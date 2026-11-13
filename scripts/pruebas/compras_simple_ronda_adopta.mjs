#!/usr/bin/env node
/**
 * Prueba de «la ronda adopta la plata de antes» (`20261113162000_mis_compras_la_ronda_adopta_la_plata_de_antes.sql`, Felipe 2026-11-13,
 * decisión C de la auditoría de Mis compras y Recibir). Corre sobre la base TAL COMO ESTÁ (con todas las migraciones), sin pegar nada: lo que
 * se hace dentro de cada caso se deshace con ROLLBACK.
 *
 * QUÉ PROMETE
 *   · La plata anotada DESPUÉS de cerrar una ronda y ANTES de abrir la siguiente es de la ronda que se abre: «Te dieron» de la ronda abierta
 *     (`fn_ronda_compras_de`) la cuenta.
 *   · Control: «Ya tenía plata» no se adopta (es el saldo inicial); la plata de antes de la ronda cerrada tampoco (ya era de antes).
 *   · Control: volver a pulsar «Abrir mi ronda» con la ronda ya abierta no adopta nada nuevo (devuelve la misma ronda).
 *   · Fuera de `abrir_ronda_compras`, la ronda de una plata sigue sin poder cambiar (ni de sin ronda a una ronda), aun como postgres.
 *
 * USO
 *   pnpm pruebas:compras-simple-ronda-adopta                                → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_ronda_adopta.mjs --contenedor <otro> [--base <nombre>]
 */

import { execFileSync } from "node:child_process";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
const como = (auth, clave) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n` +
  `set local role authenticated;\n`;

// Micaela con el módulo de Mis compras, sin ronda abierta ni plata de antes (lo de otras pruebas no la ensucia: todo va en una transacción).
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
insert into retail.roles (nombre) values ('ZZ Compradora ronda adopta') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'ordenes_compra');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
select set_config('t.micaela', :'micaela', true) \\g /dev/null
`;

const ABRE = `${como(MICAELA, "compra_ronda_abrir")}select (retail.abrir_ronda_compras() ->> 'id') as id \\gset ronda_\n`;
const CIERRA = `${como(MICAELA, "compra_terminar_dia")}select retail.terminar_dia_compras('se_queda') \\g /dev/null\n`;
const ANOTA = (medio, monto) => `${como(MICAELA, "plata_anotar")}select retail.anotar_plata_compras('${medio}', ${monto}) \\g /dev/null\n`;
// «Te dieron» de la ronda abierta: lo arma `fn_ronda_compras_de` (la que usa la lectura de la pantalla; ninguna cuenta la llama directo).
const DIERON = `reset role;\nselect (retail.fn_ronda_compras_de(current_setting('t.micaela')::uuid) -> 'abierta' ->> 'dieron');\n`;
// Todo el caso corre en UNA transacción, donde `now()` es el mismo instante para la ronda que se cierra y la plata que se anota. En la
// tienda son momentos distintos: la plata sin ronda recién anotada se corre al futuro (llegó DESPUÉS del cierre) o al pasado (llegó ANTES).
// Mover la hora lo impiden los candados de la plata (bien): se apagan solo para esa línea (`session_replication_role`) y se vuelven a encender.
const ADELANTA = `reset role;\nset local session_replication_role = replica;\nupdate retail.fondo_plata_anotada set created_at = now() + interval '1 minute' where persona_id = current_setting('t.micaela')::uuid and ronda_id is null and created_at = now();\nset local session_replication_role = origin;\n`;
const ATRASA = `reset role;\nset local session_replication_role = replica;\nupdate retail.fondo_plata_anotada set created_at = now() - interval '1 hour' where persona_id = current_setting('t.micaela')::uuid and ronda_id is null and created_at = now();\nset local session_replication_role = origin;\n`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).join(" / ");
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

// La base de cada caso: Micaela cierra una ronda (RC-a) y queda sin ronda abierta.
const CON_RONDA_CERRADA = `${ABRE}${CIERRA}`;

caso(
  "la plata que llega entre dos rondas es de la ronda que se abre: «Te dieron» la cuenta",
  `${CON_RONDA_CERRADA}${ANOTA("yape_plin", 500)}${ADELANTA}${ABRE}${DIERON}
reset role;
select count(*) from retail.fondo_plata_anotada where persona_id = current_setting('t.micaela')::uuid and ronda_id = :'ronda_id';`,
  "500.00 / 1",
);

caso(
  "control: «Ya tenía plata» y la plata de antes de la ronda cerrada no se adoptan",
  `${ANOTA("ya_tenia", 200)}${ATRASA}${ABRE}${CIERRA}${ANOTA("efectivo", 80)}${ADELANTA}${ABRE}${DIERON}
reset role;
select string_agg(medio || ':' || case when ronda_id = :'ronda_id' then 'esta' when ronda_id is null then 'sin' else 'otra' end, ',' order by medio)
  from retail.fondo_plata_anotada where persona_id = current_setting('t.micaela')::uuid;`,
  // El «ya tenía» se anotó antes de la primera ronda: sin ronda. La de efectivo, entre las dos: de esta.
  "80.00 / efectivo:esta,ya_tenia:sin",
);

caso(
  "control: sin ninguna ronda cerrada antes, abrir no adopta nada (lo de antes de las rondas sigue siendo de antes)",
  `${ANOTA("transferencia", 300)}${ADELANTA}${ABRE}${DIERON}`,
  "0",
);

caso(
  "control: volver a pulsar «Abrir mi ronda» con la ronda abierta no adopta lo anotado (eso ya lo pone el disparador) ni repite nada",
  `${CON_RONDA_CERRADA}${ANOTA("yape_plin", 150)}${ADELANTA}${ABRE}${ANOTA("efectivo", 50)}${ABRE}${DIERON}`,
  "200.00",
);

caso(
  "fuera de abrir la ronda, de qué ronda es una plata no cambia (tampoco de sin ronda a una ronda, ni como postgres)",
  `${CON_RONDA_CERRADA}${ANOTA("yape_plin", 70)}
reset role;
select id as plata from retail.fondo_plata_anotada where persona_id = current_setting('t.micaela')::uuid and ronda_id is null limit 1 \\gset
select id as otra from retail.compra_rondas where persona_id = current_setting('t.micaela')::uuid limit 1 \\gset
select split_part(pg_temp.intento(format('update retail.fondo_plata_anotada set ronda_id = %L where id = %L', :'otra', :'plata')), '|', 3);`,
  // Lo frena cualquiera de los dos candados de la plata (el que se dispare primero): los dos niegan el cambio.
  (o) => o === "De qué ronda es no cambia." || o === "La plata anotada solo cambia al confirmarla, una vez.",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
