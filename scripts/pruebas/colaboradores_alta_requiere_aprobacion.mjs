#!/usr/bin/env node
/**
 * Pruebas de `20260922170000_alta_colaborador_requiere_aprobacion.sql` (D-70, ADR-0157)
 * contra el Postgres local.
 *
 * QUÉ PRUEBA
 *   · `agregar_colaborador` crea la fila en `pendiente_aprobacion`, no en `activo`;
 *   · con la fila en `pendiente_aprobacion`, `fn_puede_operar_ubicacion` da falso para esa
 *     ubicación — la persona nueva NO puede operar;
 *   · `fn_aprobar_alta_colaborador` exige ser líder (42501 si no lo es);
 *   · tras aprobar, `fn_puede_operar_ubicacion` da verdadero para su ubicación asignada;
 *   · aprobar una alta que ya está activa, o que no existe, falla con un mensaje claro;
 *   · `suspender_colaborador` rechaza a alguien todavía pendiente (no se puede "pausar" lo
 *     que nunca se aprobó);
 *   · la migración se puede pegar dos veces.
 *
 * CÓMO. Mismo patrón que `colaboradores_endurecimiento.mjs`: cada escenario en su propia
 * transacción con ROLLBACK, nunca se commitea nada. Crea su propia persona de prueba (auth.users
 * + public.personas) dentro de la transacción — no depende de qué haya sembrado el seed local.
 * Simula al líder y a la persona nueva con `set local request.jwt.claim.sub`.
 *
 * `--en-seco`: carga la migración dentro de cada escenario (sin aplicarla a la base compartida).
 *
 * `pnpm pruebas:colaboradores-alta-aprobacion`
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder del seed local

const EN_SECO = process.argv.includes("--en-seco");
const SQL_MIGRACION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260922170000_alta_colaborador_requiere_aprobacion.sql"),
  "utf8"
);
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

// Una persona de prueba propia (activa en el stub de Dynamic), no tocamos lo que sembró
// el seed — así el escenario no depende de qué otras sesiones hayan hecho en la base
// compartida. `sede_base_id` sale de cualquier sede que exista (el stub siempre siembra al
// menos una en seed.sql).
const CANDIDATA_NUEVA = `
select gen_random_uuid() as candidata_id, gen_random_uuid() as candidata_auth \\gset
select id as sede from public.sedes limit 1 \\gset
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', :'candidata_auth', 'authenticated', 'authenticated',
  'prueba-d70-' || :'candidata_id' || '@cayla.local', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb,
  '', '', '', '', '', '', '', '');
insert into public.personas (id, auth_user_id, nombres, apellidos, sede_base_id, estado)
values (:'candidata_id', :'candidata_auth', 'Prueba', 'D70', :'sede', 'activo');
`;

const escena = (cuerpo) => `
begin;
${PRELUDIO}
${INTENTO}
${CANDIDATA_NUEVA}
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
  console.log(`${bien ? "OK  " : "FALLA"} ${nombre}${bien ? "" : `\n      recibí: ${texto.slice(0, 400)}`}`);
}

verificar(
  "agregar_colaborador crea la fila pendiente_aprobacion, no activa",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    select estado from retail.colaboradores where persona_id = :'candidata_id';`)),
  /(^|\n)pendiente_aprobacion$/
);

verificar(
  "pendiente: fn_puede_operar_ubicacion da falso para su propia ubicación",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    set local request.jwt.claim.sub = :'candidata_auth';
    select retail.fn_puede_operar_ubicacion(:'ubi'::uuid);`)),
  /(^|\n)f$/
);

verificar(
  "fn_aprobar_alta_colaborador exige ser líder",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    set local request.jwt.claim.sub = :'candidata_auth';
    select pg_temp.intento(format('select retail.fn_aprobar_alta_colaborador(%L)', :'candidata_id'));`)),
  /Solo un líder puede aprobar/
);

verificar(
  "tras aprobar: fn_puede_operar_ubicacion da verdadero para su ubicación",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    select retail.fn_aprobar_alta_colaborador(:'candidata_id');
    set local request.jwt.claim.sub = :'candidata_auth';
    select retail.fn_puede_operar_ubicacion(:'ubi'::uuid);`)),
  /(^|\n)t$/
);

verificar(
  "aprobar una alta ya activa falla con mensaje claro",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    select retail.fn_aprobar_alta_colaborador(:'candidata_id');
    select pg_temp.intento(format('select retail.fn_aprobar_alta_colaborador(%L)', :'candidata_id'));`)),
  /Esa alta ya estaba aprobada/
);

verificar(
  "aprobar una alta que no existe falla con mensaje claro",
  correr(escena(`
    select pg_temp.intento(format('select retail.fn_aprobar_alta_colaborador(%L)', :'candidata_id'));`)),
  /no tiene una alta pendiente/
);

verificar(
  "suspender_colaborador rechaza a alguien todavía pendiente",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    select pg_temp.intento(format('select retail.suspender_colaborador(%L, null)', :'candidata_id'));`)),
  /todavía no está aprobada/
);

verificar(
  "aprobar deja registro en el historial (accion 'aprobacion')",
  correr(escena(`
    select retail.agregar_colaborador(:'candidata_id', :'ubi');
    select retail.fn_aprobar_alta_colaborador(:'candidata_id');
    select count(*) from retail.colaboradores_historial where persona_id = :'candidata_id' and accion = 'aprobacion';`)),
  /(^|\n)1$/
);

verificar(
  "colaboradores ya existentes (backfill) siguen pudiendo operar: estado activo por default",
  correr(escena(`
    select estado from retail.colaboradores where persona_id = (select id from public.personas where auth_user_id = '${FELIPE}');`)),
  /(^|\n)activo$/
);

verificar(
  "la migración se puede pegar dos veces",
  correr(`begin;\n${SQL_MIGRACION}\n${SQL_MIGRACION}\nrollback;`),
  /^$/
);

console.log(fallos === 0 ? "\nTodo en verde." : `\n${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
