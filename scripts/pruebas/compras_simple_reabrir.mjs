#!/usr/bin/env node
/**
 * Prueba de «Reabrir la última ronda» (ADR-0569): `20261029150000_mis_compras_reabrir_la_ultima_ronda.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave (42501 sin «Mi plata para compras»); solo la ronda propia; solo la ÚLTIMA cerrada; nunca con otra abierta.
 *   · Mientras Compras no recibió el cierre, se reabre: la ronda vuelve con el MISMO id y número, el cierre sale del libro de cierres y queda
 *     archivado (qué había decidido y cuánto): nada se borra sin rastro. Lo olvidado se anota en ESA ronda y al cerrarla de nuevo el cierre
 *     nace con lo que de verdad tiene (el gasto de S/ 4 de bebidas baja el monto, y se puede elegir «devuelvo» en vez de «me quedo»).
 *   · Con el cierre ya recibido por Compras (resuelto), no se reabre: esa plata ya se movió.
 *   · Dos toques seguidos devuelven la misma ronda (`ya_estaba`), no dos aperturas ni un error.
 *   · Fuera de la función, una ronda cerrada sigue sin cambiar y un cierre sigue sin borrarse: la excepción es solo de quien trae la marca.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, las migraciones de Compras simple y la de esta prueba pegadas dos veces y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:compras-simple-reabrir                                     → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_reabrir.mjs --contenedor <otro>     → contra otro contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const migracion = (nombre) => readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8").replace(/^set lock_timeout.*$/gm, "");
// Compras simple en orden, como en la base, y al final la de esta prueba.
const MIGRACIONES = [
  "20261023114000_compras_simple_gasto_envio_y_cierre.sql",
  "20261023183000_compras_simple_ronda_de_compras.sql",
  "20261026174000_mis_compras_mis_envios.sql",
  "20261027231000_mis_compras_auditoria_candados.sql",
  "20261029150000_mis_compras_reabrir_la_ultima_ronda.sql",
].map(migracion);

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

const PRELUDIO = `
begin;
${MIGRACIONES.map((m) => `${m}\n${m}`).join("\n")}
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
-- Micaela compra solo con su rol de prueba: «Mi plata para compras».
insert into retail.roles (nombre) values ('ZZ Compradora ADR-0569') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'ordenes_compra');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
-- Su historia de prueba empieza sin rondas: el disparador de «no se borra» se apaga solo en esta transacción (que siempre se deshace).
alter table retail.compra_rondas disable trigger compra_rondas_fija;
alter table retail.compra_cierres disable trigger compra_cierres_resuelto_fijo;
update retail.compra_rondas set cierre_id = null, cerrada_en = null where persona_id = :'micaela';
delete from retail.compra_cierres where persona_id = :'micaela';
delete from retail.compra_rondas where persona_id = :'micaela' and not exists (select 1 from retail.compra_papeles p where p.ronda_id = compra_rondas.id)
   and not exists (select 1 from retail.compra_gastos g where g.ronda_id = compra_rondas.id) and not exists (select 1 from retail.fondo_plata_anotada a where a.ronda_id = compra_rondas.id);
alter table retail.compra_rondas enable trigger compra_rondas_fija;
alter table retail.compra_cierres enable trigger compra_cierres_resuelto_fijo;
`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;
const ABRIR = `${como(MICAELA, "compra_ronda_abrir")}\nselect retail.abrir_ronda_compras() ->> 'id' as ronda \\gset\n`;
const GASTO = (id, monto = 4) => `${como(MICAELA, "gasto_rapido")}\nselect retail.registrar_gasto_rapido('${id}', 'comida', null, ${monto}, null) \\g /dev/null\n`;
const PLATA = (monto) => `${como(MICAELA, "plata_anotar")}\nselect retail.anotar_plata_compras('efectivo', ${monto}, null, gen_random_uuid()) \\g /dev/null\n`;
const CERRAR = (decision) => `${como(MICAELA, "compra_terminar_dia")}\nselect retail.terminar_dia_compras('${decision}') \\g /dev/null\n`;
const REABRIR = `${como(MICAELA, "compra_ronda_reabrir")}\nselect retail.reabrir_ronda_compras()`;
const TIENE = `retail.fn_mi_plata_tiene(:'micaela')`;

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

caso(
  "sin «Mi plata para compras» no se reabre (42501)",
  `${ABRIR}${CERRAR("se_queda")}reset role;
delete from retail.rol_modulos where rol_id = :'rol';
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'existencias');
${como(MICAELA, "compra_ronda_reabrir")}
select ${hint("select retail.reabrir_ronda_compras()")}, left(${intento("select retail.reabrir_ronda_compras()")}, 5);`,
  "ordenes_compra_sin_modulo|42501",
);

caso(
  "sin ninguna ronda cerrada no hay nada que reabrir; con una abierta, no se reabre otra",
  `${como(MICAELA, "compra_ronda_reabrir")}
select ${hint("select retail.reabrir_ronda_compras()")};
${ABRIR}${como(MICAELA, "compra_ronda_reabrir")}
select ${hint("select retail.reabrir_ronda_compras()")};`,
  "compra_ronda_nada_que_reabrir / compra_ronda_ya_abierta",
);

caso(
  "se reabre con el mismo id y número, el cierre queda archivado y no en el libro, y dos toques devuelven la misma ronda",
  `${ABRIR}${PLATA(40)}${CERRAR("se_queda")}reset role;
select numero as n0 from retail.compra_rondas where id = :'ronda' \\gset
${REABRIR} as r1 \\gset
select (:'r1'::jsonb ->> 'id') = :'ronda', (:'r1'::jsonb ->> 'numero')::int = :'n0'::int, :'r1'::jsonb ->> 'decision_anterior', :'r1'::jsonb ->> 'ya_estaba';
select (retail.reabrir_ronda_compras() ->> 'ya_estaba'), (retail.reabrir_ronda_compras() ->> 'id') = :'ronda';
reset role;
select (select count(*) from retail.compra_rondas where persona_id = :'micaela' and cerrada_en is null and cierre_id is null and id = :'ronda'),
       (select count(*) from retail.compra_cierres where persona_id = :'micaela'),
       (select decision || '/' || monto from retail.compra_cierres_reabiertos where ronda_id = :'ronda');`,
  "t|t|se_queda|false / true|t / 1|0|se_queda/40.00",
);

caso(
  "el gasto olvidado queda en esa ronda y, al cerrarla de nuevo, se puede elegir «devuelvo»: el monto ya trae el gasto",
  `${ABRIR}${PLATA(40)}${CERRAR("se_queda")}${REABRIR} \\g /dev/null
${GASTO("aaaaaaaa-0569-4000-8000-0000000000a1")}
reset role;
select (select ronda_id::text = :'ronda' from retail.compra_gastos where id = 'aaaaaaaa-0569-4000-8000-0000000000a1');
${CERRAR("devuelve")}reset role;
select k.decision, k.monto, r.cierre_id = k.id, r.cerrada_en is not null from retail.compra_cierres k join retail.compra_rondas r on r.id = k.ronda_id where r.id = :'ronda';`,
  "t / devuelve|36.00|t|t",
);

caso(
  "solo la última ronda cerrada se reabre (la anterior queda como estaba)",
  `${ABRIR}${CERRAR("se_queda")}reset role;
select :'ronda' as primera \\gset
${ABRIR}${CERRAR("se_queda")}reset role;
select :'ronda' as segunda \\gset
${REABRIR} as r \\gset
select (:'r'::jsonb ->> 'id') = :'segunda', (:'r'::jsonb ->> 'id') <> :'primera';
reset role;
select (select cerrada_en is not null from retail.compra_rondas where id = :'primera');`,
  "t|t / t",
);

caso(
  "con el cierre ya recibido por Compras no se reabre (compra_ronda_cierre_resuelto) y la ronda sigue cerrada",
  `${ABRIR}${PLATA(40)}${CERRAR("devuelve")}reset role;
update retail.compra_cierres set resuelto_en = now(), resuelto_por = :'micaela' where ronda_id = :'ronda';
${como(MICAELA, "compra_ronda_reabrir")}
select ${hint("select retail.reabrir_ronda_compras()")};
reset role;
select (select cerrada_en is not null from retail.compra_rondas where id = :'ronda'), (select count(*) from retail.compra_cierres where ronda_id = :'ronda');`,
  "compra_ronda_cierre_resuelto / t|1",
);

caso(
  "fuera de la función nada cambia: una ronda cerrada no se reabre a mano, un cierre no se borra, y la marca de otra ronda no sirve",
  `${ABRIR}${CERRAR("se_queda")}reset role;
select pg_temp.intento(format($q$update retail.compra_rondas set cerrada_en = null, cierre_id = null where id = %L$q$, :'ronda')) like '%compra_ronda_cerrada%',
       pg_temp.intento(format($q$delete from retail.compra_cierres where ronda_id = %L$q$, :'ronda')) like '%Un cierre del día no se borra%';
select set_config('retail.reabriendo_ronda', gen_random_uuid()::text, true) \\g /dev/null
select pg_temp.intento(format($q$update retail.compra_rondas set cerrada_en = null, cierre_id = null where id = %L$q$, :'ronda')) like '%compra_ronda_cerrada%';`,
  "t|t / t",
);

caso(
  "la función no es de anon, sí de las cuentas con sesión; la tabla de archivo no se lee ni se escribe desde la API",
  `select has_function_privilege('anon', 'retail.reabrir_ronda_compras()', 'execute'),
       has_function_privilege('authenticated', 'retail.reabrir_ronda_compras()', 'execute'),
       has_table_privilege('authenticated', 'retail.compra_cierres_reabiertos', 'select'),
       has_table_privilege('authenticated', 'retail.compra_cierres_reabiertos', 'insert');`,
  "f|t|f|f",
);

caso(
  "la migración se puede pegar dos veces: sigue habiendo una sola clave de firma para reabrir",
  `select count(*) from retail.acciones_sin_responsable where clave = 'compra_ronda_reabrir';`,
  "1",
);

console.log(`\n${casos - fallas}/${casos} casos en verde${fallas ? ` — ${fallas} en rojo` : ""} (base: ${BASE})`);
process.exit(fallas ? 1 : 0);
