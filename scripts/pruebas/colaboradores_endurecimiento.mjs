#!/usr/bin/env node
/**
 * Pruebas de `20260922100000_colaboradores_endurecimiento.sql` (ADR-0145) contra el Postgres local.
 *
 * QUÉ PRUEBA
 *   · `authenticated` y `anon` ya no tienen INSERT/UPDATE/DELETE sobre `retail.colaboradores` (solo SELECT);
 *   · el CHECK `colaboradores_colaborador_con_ubicacion` rechaza un colaborador sin ubicación (23514) y deja
 *     pasar a un líder sin ubicación;
 *   · `agregar_colaborador` falla la segunda vez con «ya tiene acceso» en vez de callar;
 *   · `quitar_colaborador` falla la segunda vez con «ya no tiene acceso», y quitarse a uno mismo nombra a
 *     «otro líder»;
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `candado_lider_caja_y_ajuste.mjs`: cada escenario en su transacción con ROLLBACK,
 * nunca se commitea nada. Simula al líder con `set local request.jwt.claim.sub`. Elige por sí mismo una
 * persona activa que todavía no tiene acceso; si no hay ninguna en el local, lo dice y sale sin fallar.
 *
 * `--en-seco`: carga la migración dentro de cada escenario (sin aplicarla a la base compartida).
 *
 * ESTADO: escrita sin poder correrla (la sesión que la creó no tenía Docker/Postgres local). Correrla antes de
 * fusionar: `pnpm pruebas:colaboradores-endurecimiento --en-seco`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed local

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20260922100000_colaboradores_endurecimiento.sql"), "utf8");
const PRELUDIO = EN_SECO ? SQL_MIGRACION : "";

function correr(sql) {
  try {
    const salida = execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const INTENTO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
`;

const escena = (cuerpo) => `
begin;
${PRELUDIO}
${INTENTO}
select p.id as candidata from public.personas p
  where p.estado = 'activo' and p.auth_user_id is not null
    and not exists (select 1 from retail.colaboradores c where c.persona_id = p.id) limit 1 \\gset
select id as ubi from retail.ubicaciones where activo limit 1 \\gset
set local request.jwt.claim.sub = '${FELIPE}';
${cuerpo}
rollback;
`;

let fallos = 0;
function verificar(nombre, res, esperado) {
  const texto = res.ok ? res.salida : res.mensaje;
  const bien = esperado.test(texto);
  if (!bien) fallos++;
  console.log(`${bien ? "OK  " : "FALLA"} ${nombre}${bien ? "" : `\n      recibí: ${texto.slice(0, 300)}`}`);
}

verificar(
  "authenticated/anon solo conservan SELECT",
  correr(escena(`select
    has_table_privilege('authenticated','retail.colaboradores','SELECT') and
    not has_table_privilege('authenticated','retail.colaboradores','INSERT') and
    not has_table_privilege('authenticated','retail.colaboradores','UPDATE') and
    not has_table_privilege('authenticated','retail.colaboradores','DELETE') and
    not has_table_privilege('anon','retail.colaboradores','INSERT');`)),
  /(^|\n)t$/
);

verificar(
  "CHECK: un colaborador sin ubicación se rechaza (23514)",
  correr(escena(`select pg_temp.intento(format(
    $q$insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values (%L, 'colaborador', null)$q$, :'candidata'));`)),
  /23514\|.*colaboradores_colaborador_con_ubicacion/
);

verificar(
  "CHECK: un líder sin ubicación pasa",
  correr(escena(`select pg_temp.intento(format(
    $q$insert into retail.colaboradores (persona_id, rol, ubicacion_asignada_id) values (%L, 'lider', null)$q$, :'candidata'));`)),
  /SIN_ERROR/
);

verificar(
  "agregar_colaborador: la segunda vez dice «ya tiene acceso»",
  correr(escena(`select retail.agregar_colaborador(:'candidata', :'ubi');
select pg_temp.intento(format('select retail.agregar_colaborador(%L, %L)', :'candidata', :'ubi'));`)),
  /Esa persona ya tiene acceso a retail/
);

verificar(
  "quitar_colaborador: la segunda vez dice «ya no tiene acceso»",
  correr(escena(`select retail.agregar_colaborador(:'candidata', :'ubi');
select retail.quitar_colaborador(:'candidata');
select pg_temp.intento(format('select retail.quitar_colaborador(%L)', :'candidata'));`)),
  /Esa persona ya no tiene acceso/
);

verificar(
  "quitarse a uno mismo nombra a «otro líder»",
  correr(escena(`select pg_temp.intento(format('select retail.quitar_colaborador(%L)',
    (select id from public.personas where auth_user_id = '${FELIPE}')));`)),
  /pide a otro líder/
);

verificar(
  "la migración se puede pegar dos veces",
  correr(`begin;\n${SQL_MIGRACION}\n${SQL_MIGRACION}\nrollback;`),
  /^$/
);

console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
