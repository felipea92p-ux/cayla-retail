#!/usr/bin/env node
/**
 * Prueba del saldo por prenda de Movimientos (ADR-0234, «Actualización 2026-09-26 (saldo)») contra el Postgres LOCAL:
 * `retail.fn_movimientos_saldos` (20260927173000).
 *
 * QUÉ CUBRE
 *   1. La historia de una prenda nueva en Tienda Trujillo, con horas distintas: cada movimiento dice cuántas quedaron en
 *      la tienda (piso + almacén) después de él — la bajada al piso no cambia el número, la cuarentena lo baja.
 *   2. Una operación de dos movimientos de la misma prenda en el mismo instante: los dos dicen lo que quedó al TERMINAR
 *      (nunca un saldo a mitad de camino que dependa del orden al azar de los ids).
 *   3. El último saldo es el stock de hoy (sin cuarentena), igual que Existencias.
 *   4. Un movimiento de otra sede no devuelve nada; sin sesión, 42501; `anon` no ejecuta; una sola firma.
 *
 * CÓMO. Como `ajuste_no_es_primera_carga.mjs`: todo en una transacción con ROLLBACK. Los movimientos se escriben
 * directo (como postgres) con su `created_at`: dentro de una transacción `now()` no avanza, y la prueba necesita horas
 * distintas. El stock se deja en lo que esa historia deja, porque el ledger parte del stock real hacia atrás.
 *
 * USO
 *   pnpm pruebas:movimientos-saldo    → con la migración ya aplicada en el Postgres local
 */

import { execFileSync } from "node:child_process";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}

const SQL = `
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lim from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Cuarentena', 'cuarentena' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena');
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' limit 1 \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' limit 1 \\gset
select id as cua from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'cuarentena' limit 1 \\gset

insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Saldo de movimientos', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-SALDO-1', 100, 40, true) returning id as v1 \\gset

-- La historia (horas en el pasado, cada una distinta salvo t4, que es UNA operación de dos movimientos):
--   t1 entra 5 al almacén → 5 · t2 baja 2 al piso → 5 · t3 se vende 1 del piso → 4
--   t4 conteo: −1 en almacén y +2 en piso, a la vez → 5 · t5 1 del piso a cuarentena → 4
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'tru', :'alm', 'entrada', 5, 'carga_inicial', now() - interval '5 hours') returning id as m1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'tru', :'alm', :'tru', :'piso', 'traslado', 2, 'movimiento_interno', now() - interval '4 hours') returning id as m2 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'tru', :'piso', 'salida', 1, 'venta', now() - interval '3 hours') returning id as m3 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'tru', :'alm', 'ajuste', -1, 'conteo_fisico', now() - interval '2 hours') returning id as m4a \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'tru', :'piso', 'ajuste', 2, 'conteo_fisico', now() - interval '2 hours') returning id as m4b \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, ubicacion_destino_id, sububicacion_destino_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'tru', :'piso', :'tru', :'cua', 'traslado', 1, 'movimiento_interno', now() - interval '1 hour') returning id as m5 \\gset
-- Lo que esa historia deja: almacén 5−2−1 = 2, piso 2−1+2−1 = 2, cuarentena 1.
insert into retail.stock (variante_id, ubicacion_id, sububicacion_id, cantidad) values
  (:'v1', :'tru', :'alm', 2), (:'v1', :'tru', :'piso', 2), (:'v1', :'tru', :'cua', 1);
-- Un movimiento de OTRA sede, que no debe volver aunque se pida.
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
  values (:'v1', :'lim', 'entrada', 3, 'carga_inicial', now() - interval '30 minutes') returning id as mlim \\gset

set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
set local role authenticated;
select 'K|saldos|' || coalesce(string_agg(
    case s.movimiento_id when :'m1' then 'm1' when :'m2' then 'm2' when :'m3' then 'm3' when :'m4a' then 'm4a'
                         when :'m4b' then 'm4b' when :'m5' then 'm5' when :'mlim' then 'mlim' end || '=' || s.quedan, ',' order by 1), '')
  from retail.fn_movimientos_saldos(:'tru', array[:'m1', :'m2', :'m3', :'m4a', :'m4b', :'m5', :'mlim']::uuid[]) s;
select 'K|vacio|' || count(*) from retail.fn_movimientos_saldos(:'tru', array[]::uuid[]);
reset role;
select 'K|hoy|' || sum(cantidad) from retail.stock st join retail.sububicaciones su on su.id = st.sububicacion_id
  where st.variante_id = :'v1' and st.ubicacion_id = :'tru' and su.tipo <> 'cuarentena';

-- Sin sesión: la base no dice nada.
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '';
set local role authenticated;
create function pg_temp.sin_sesion(p_tru uuid, p_m uuid) returns text language plpgsql as $f$
begin
  perform retail.fn_movimientos_saldos(p_tru, array[p_m]);
  return 'PASO';
exception when others then
  return sqlstate;
end;
$f$;
select 'K|sin_sesion|' || pg_temp.sin_sesion(:'tru', :'m1');
reset role;

select 'K|anon|' || has_function_privilege('anon', 'retail.fn_movimientos_saldos(uuid, uuid[])'::regprocedure, 'EXECUTE');
select 'K|auth|' || has_function_privilege('authenticated', 'retail.fn_movimientos_saldos(uuid, uuid[])'::regprocedure, 'EXECUTE');
select 'K|una|' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'fn_movimientos_saldos';
rollback;
`;

let fallos = 0;
let total = 0;
function afirmar(nombre, condicion, detalle = "") {
  total += 1;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}

console.log("Saldo por prenda de Movimientos (fn_movimientos_saldos)");
let d = {};
try {
  for (const linea of psql(SQL).split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
} catch (e) {
  console.log(`  ✘ el SQL de la prueba falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
  process.exit(1);
}

const saldos = Object.fromEntries((d.saldos ?? "").split(",").filter(Boolean).map((par) => par.split("=")));
afirmar("entra 5 al almacén → quedan 5", saldos.m1 === "5", d.saldos);
afirmar("la bajada al piso no cambia lo que hay en la tienda → quedan 5", saldos.m2 === "5", d.saldos);
afirmar("se vende 1 → quedan 4", saldos.m3 === "4", d.saldos);
afirmar("una operación de dos movimientos (−1 y +2 a la vez): los dos dicen lo que quedó al terminar → 5", saldos.m4a === "5" && saldos.m4b === "5", d.saldos);
afirmar("1 pasa a cuarentena → quedan 4 (lo dañado no cuenta, como en Existencias)", saldos.m5 === "4", d.saldos);
afirmar("el último saldo es el stock de hoy sin cuarentena", saldos.m5 === d.hoy, `saldo=${saldos.m5} hoy=${d.hoy}`);
afirmar("un movimiento de otra sede no vuelve aunque se pida", !("mlim" in saldos), d.saldos);
afirmar("sin movimientos pedidos, no devuelve nada", d.vacio === "0", `filas=${d.vacio}`);
afirmar("sin sesión, la base no responde (42501)", d.sin_sesion === "42501", d.sin_sesion);
afirmar("anon NO puede ejecutarla; authenticated sí", d.anon === "false" && d.auth === "true", `anon=${d.anon} auth=${d.auth}`);
afirmar("una sola firma", d.una === "1", `versiones=${d.una}`);

console.log(`\n${total - fallos}/${total} verificaciones en verde`);
process.exit(fallos ? 1 : 0);
