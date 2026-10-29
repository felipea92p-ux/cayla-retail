#!/usr/bin/env node
/**
 * Prueba de «¿A qué cuenta de CAYLA devolviste?» al cerrar la ronda (Felipe 2026-10-29):
 * `20261029165000_mis_compras_cuenta_de_la_devolucion_parte1_columna.sql` y `20261029170000_..._parte2_funciones.sql`.
 *
 * QUÉ PROMETE
 *   · Con «devuelvo» y una cuenta de CAYLA (banco o caja fuerte activos), el cierre guarda esa cuenta: es una INDICACIÓN, no mueve plata.
 *   · Una cuenta que Compras no podría recibir (un cajón, la del líder, una archivada, una que no existe) se rechaza (`compra_cierre_cuenta`)
 *     y no se escribe nada: la ronda sigue abierta.
 *   · Sin cuenta (el cierre de siempre, o una pantalla vieja que llama con un argumento) se cierra igual. Con «me quedo» la cuenta se ignora.
 *   · La base misma impide una cuenta en un cierre que no devuelve.
 *   · `fn_cuentas_para_devolver_compras` lista solo bancos y cajas fuertes activos, y pide el módulo «Mis compras» o «Revisar compras».
 *   · La función vieja de un parámetro ya no existe (dos con el mismo nombre dejarían la llamada ambigua) y `fn_revisar_compras` trae la cuenta.
 *   · Pegar las migraciones dos veces no cambia nada.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, las migraciones de Compras simple y las de esta prueba pegadas dos veces y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:compras-simple-cuenta-devolucion                                     → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_cuenta_devolucion.mjs --contenedor <otro>     → contra otro contenedor
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
// Compras simple en orden, como en la base, y al final las de esta prueba.
const MIGRACIONES = [
  "20261023114000_compras_simple_gasto_envio_y_cierre.sql",
  "20261023183000_compras_simple_ronda_de_compras.sql",
  "20261026174000_mis_compras_mis_envios.sql",
  "20261027231000_mis_compras_auditoria_candados.sql",
  "20261029150000_mis_compras_reabrir_la_ultima_ronda.sql",
  "20261029165000_mis_compras_cuenta_de_la_devolucion_parte1_columna.sql",
  "20261029170000_mis_compras_cuenta_de_la_devolucion_parte2_funciones.sql",
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
insert into retail.roles (nombre) values ('ZZ Compradora cuenta devolucion') returning id as rol \\gset
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'ordenes_compra');
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
-- Las cuentas de la prueba: las que ya hay (un banco, una caja fuerte, un cajón, la del líder) y un banco archivado.
select id as banco from retail.cuentas_dinero where tipo = 'banco' and archivada_en is null order by orden, nombre limit 1 \\gset
select id as cfuerte from retail.cuentas_dinero where tipo = 'caja_fuerte' and archivada_en is null order by orden, nombre limit 1 \\gset
select id as cajon from retail.cuentas_dinero where tipo = 'cajon' and archivada_en is null limit 1 \\gset
select id as rendir from retail.cuentas_dinero where tipo = 'por_rendir' limit 1 \\gset
insert into retail.cuentas_dinero (nombre, tipo, cuenta_contable, archivada_en) values ('Banco archivado prueba', 'banco', '104', now()) returning id as archivada \\gset
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
const PLATA = (monto) => `${como(MICAELA, "plata_anotar")}\nselect retail.anotar_plata_compras('efectivo', ${monto}, null, gen_random_uuid()) \\g /dev/null\n`;
const CERRAR = (args) => `${como(MICAELA, "compra_terminar_dia")}\nselect retail.terminar_dia_compras(${args}) \\g /dev/null\n`;
const FIRMA = como(MICAELA, "compra_terminar_dia");
const REABRIR = `${como(MICAELA, "compra_ronda_reabrir")}\nselect retail.reabrir_ronda_compras() \\g /dev/null\n`;

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
  "«devuelvo» con un banco o con una caja fuerte guarda la cuenta indicada en el cierre",
  `${ABRIR}${PLATA(40)}${CERRAR(`'devuelve', :'banco'`)}reset role;
select k.decision, k.monto, k.cuenta_indicada_id = :'banco' from retail.compra_cierres k where k.ronda_id = :'ronda';
${REABRIR}${CERRAR(`'devuelve', :'cfuerte'`)}reset role;
select k.cuenta_indicada_id = :'cfuerte' from retail.compra_cierres k where k.ronda_id = :'ronda';`,
  "devuelve|40.00|t / t",
);

caso(
  "cajón, caja del líder, banco archivado y una cuenta inexistente dan compra_cierre_cuenta y no escriben nada",
  `${ABRIR}${PLATA(40)}${FIRMA}
select split_part(pg_temp.intento(format($q$select retail.terminar_dia_compras('devuelve', %L)$q$, :'cajon')), '|', 2),
       split_part(pg_temp.intento(format($q$select retail.terminar_dia_compras('devuelve', %L)$q$, :'rendir')), '|', 2),
       split_part(pg_temp.intento(format($q$select retail.terminar_dia_compras('devuelve', %L)$q$, :'archivada')), '|', 2),
       split_part(pg_temp.intento($q$select retail.terminar_dia_compras('devuelve', gen_random_uuid())$q$), '|', 2);
reset role;
select (select cerrada_en is null from retail.compra_rondas where id = :'ronda'), (select count(*) from retail.compra_cierres where ronda_id = :'ronda');`,
  "compra_cierre_cuenta|compra_cierre_cuenta|compra_cierre_cuenta|compra_cierre_cuenta / t|0",
);

caso(
  "sin cuenta (un solo argumento, como llama una pantalla vieja) se cierra igual y la cuenta queda vacía; con «me quedo» la cuenta se ignora",
  `${ABRIR}${PLATA(40)}${CERRAR(`'devuelve'`)}reset role;
select k.decision, k.cuenta_indicada_id is null from retail.compra_cierres k where k.ronda_id = :'ronda';
${REABRIR}${CERRAR(`'se_queda', :'banco'`)}reset role;
select k.decision, k.cuenta_indicada_id is null from retail.compra_cierres k where k.ronda_id = :'ronda';`,
  "devuelve|t / se_queda|t",
);

caso(
  "la base impide una cuenta indicada en un cierre que no devuelve (candado de la tabla)",
  `${ABRIR}${CERRAR(`'se_queda'`)}reset role;
alter table retail.compra_cierres disable trigger compra_cierres_resuelto_fijo;
select pg_temp.intento(format($q$update retail.compra_cierres set cuenta_indicada_id = %L where ronda_id = %L$q$, :'banco', :'ronda')) like '23514%compra_cierres_cuenta_indicada%';`,
  "t",
);

caso(
  "las cuentas para devolver son solo bancos y cajas fuertes activos; sin el módulo, 42501",
  `${como(MICAELA)}
select (select bool_and(x ->> 'tipo' in ('banco', 'caja_fuerte')) from jsonb_array_elements(retail.fn_cuentas_para_devolver_compras()) x),
       (select count(*) from jsonb_array_elements(retail.fn_cuentas_para_devolver_compras()) x where x ->> 'id' in (:'cajon', :'rendir', :'archivada')),
       (select count(*) from jsonb_array_elements(retail.fn_cuentas_para_devolver_compras()) x where x ->> 'id' in (:'banco', :'cfuerte'));
reset role;
delete from retail.rol_modulos where rol_id = :'rol';
insert into retail.rol_modulos (rol_id, modulo) values (:'rol', 'existencias');
${como(MICAELA)}
select left(${intento("select retail.fn_cuentas_para_devolver_compras()")}, 5);`,
  "t|0|2 / 42501",
);

caso(
  "la función vieja de un parámetro ya no existe; la nueva es de las cuentas con sesión y no de anon; Revisar compras trae la cuenta",
  `select (select count(*) from pg_proc where proname = 'terminar_dia_compras' and pronamespace = 'retail'::regnamespace),
       to_regprocedure('retail.terminar_dia_compras(text)') is null,
       has_function_privilege('anon', 'retail.terminar_dia_compras(text, uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.terminar_dia_compras(text, uuid)', 'execute'),
       has_function_privilege('anon', 'retail.fn_cuentas_para_devolver_compras()', 'execute'),
       position('cuenta_indicada_id' in pg_get_functiondef('retail.fn_revisar_compras()'::regprocedure)) > 0;`,
  "1|t|f|t|f|t",
);

console.log(`\n${casos - fallas}/${casos} casos pasan.`);
process.exit(fallas ? 1 : 0);
