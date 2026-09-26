#!/usr/bin/env node
/**
 * Prueba de ADR-0235 «Un ajuste no es la primera carga» contra el Postgres LOCAL:
 * `retail.cargar_stock_inicial` (20260927153100) y el candado `ajuste_sin_historia` de `retail.registrar_movimiento`
 * (20260927153200).
 *
 * QUÉ CUBRE
 *   1. El candado: un ajuste sobre una prenda SIN ningún movimiento en la tienda se rechaza (hint `ajuste_sin_historia`)
 *      y no deja nada; el parche anterior de la misma función («Reposición» no toca el piso) sigue puesto.
 *   2. La otra puerta: `cargar_stock_inicial` carga esas prendas como ENTRADA «carga_inicial» al almacén, firmadas, todas
 *      o ninguna; con «al piso» quedan en el piso con su bajada.
 *   3. Después de la primera carga, un ajuste de verdad (una corrección) pasa como siempre.
 *   4. La carga inicial no sirve para una prenda que ya tiene historia en esa tienda (`carga_con_historia`).
 *   5. Permisos: `anon` no ejecuta; una sola firma.
 *
 * CÓMO. Como `alta_con_stock_inicial.mjs`: cada caso en su transacción con ROLLBACK, sesión simulada con
 * `request.jwt.claim(s)` y `request.headers`. `pg_temp.intento` corre una llamada y devuelve el resultado o el error
 * (estado, hint) como JSON.
 *
 * USO
 *   pnpm pruebas:ajuste-no-es-primera-carga    → con las migraciones ya aplicadas en el Postgres local
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

const PRELUDIO = `
begin;
create function pg_temp.intento(p_sql text) returns jsonb language plpgsql as $f$
declare v_estado text; v_msg text; v_hint text; v_res text;
begin
  execute p_sql into v_res;
  return jsonb_build_object('ok', true, 'res', v_res);
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'estado', v_estado, 'hint', nullif(v_hint, ''), 'msg', v_msg);
end;
$f$;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Piso de venta', 'piso_venta' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'tru', 'Almacén de tienda', 'almacen_tienda' where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda');
select id as piso from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'piso_venta' \\gset
select id as alm from retail.sububicaciones where ubicacion_id = :'tru' and tipo = 'almacen_tienda' \\gset
select id as felipe from public.personas where auth_user_id = '${FELIPE}' \\gset

-- Dos prendas nuevas, sin ningún movimiento en ninguna tienda (un producto cada una: sin talla ni color, dos variantes de
-- un mismo producto recibirían el mismo código automático).
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Ajuste no es carga 1', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p1 \\gset
insert into retail.productos (referencia, estado, marca_id, proveedor_id)
  select 'ZZ Ajuste no es carga 2', 'activo', mp.marca_id, mp.proveedor_id from retail.marca_proveedores mp order by mp.created_at limit 1
  returning id as p2 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p1', 'ZZ-ANC-1', 100, 40, true) returning id as v1 \\gset
insert into retail.variantes (producto_id, sku, precio, costo, activo) values (:'p2', 'ZZ-ANC-2', 100, 40, true) returning id as v2 \\gset

-- La sesión de Felipe (líder), como la arma PostgREST.
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select set_config('request.headers', '{}', true) as _h \\gset
`;

const COMO_API = "set local role authenticated;\n";
const COMO_POSTGRES = "reset role;\n";
const K = (clave, expresion) => `select 'K|${clave}|' || (${expresion})::text;`;
const ajuste = (v, cant, sub = "alm", motivo = "conteo_fisico") =>
  `pg_temp.intento(format('select retail.registrar_movimiento(%L::uuid, %L::uuid, ''ajuste'', ${cant}, ''${motivo}'', null, %L::uuid)::text', :'${v}', :'tru', :'${sub}'))`;
const carga = (items, alPiso = false) =>
  `pg_temp.intento(format('select retail.cargar_stock_inicial(%L::uuid, %L::jsonb, null, ${alPiso})::text', :'tru', ${items}))`;
const items = (...pares) => `jsonb_build_array(${pares.map(([v, c]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', ${c})`).join(", ")})::text`;
const movs = (v) => `(select count(*) from retail.movimientos where variante_id = :'${v}')`;
const stock = (v, sub) => `coalesce((select sum(cantidad) from retail.stock where variante_id = :'${v}' and ubicacion_id = :'tru' and sububicacion_id = :'${sub}'), 0)`;

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
function parsear(salida) {
  const d = {};
  for (const linea of salida.split("\n")) {
    if (!linea.startsWith("K|")) continue;
    const [, clave, ...resto] = linea.split("|");
    d[clave] = resto.join("|");
  }
  return d;
}
function correr(titulo, sql, verificar) {
  console.log(`\n${titulo}`);
  let salida;
  try {
    salida = psql(`${PRELUDIO}\n${sql}\nrollback;\n`).trim();
  } catch (e) {
    fallos += 1;
    total += 1;
    console.log(`  ✘ el SQL del caso falló: ${(e.stderr ?? e.message ?? "").toString().split("\n").slice(0, 4).join(" ")}`);
    return;
  }
  verificar(parsear(salida));
}
const j = (texto) => JSON.parse(texto ?? "null");

correr(
  "1. El candado: un ajuste no puede ser el primer movimiento de una prenda en la tienda",
  `${COMO_API}${K("primero", ajuste("v1", 3))}
${COMO_POSTGRES}${K("sin_filas", movs("v1"))}
${K("marca_nueva", "(length(pg_get_functiondef('retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)'::regprocedure)) - length(replace(pg_get_functiondef('retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)'::regprocedure), 'ajuste_sin_historia', ''))) / length('ajuste_sin_historia')")}
${K("marca_vieja", "position('reposicion_piso_cerrada' in pg_get_functiondef('retail.registrar_movimiento(uuid, uuid, text, integer, text, text, uuid)'::regprocedure)) > 0")}`,
  (d) => {
    const r = j(d.primero);
    afirmar("se rechaza con el hint `ajuste_sin_historia`", r && r.ok === false && r.hint === "ajuste_sin_historia", d.primero);
    afirmar("y el mensaje dice qué hacer (stock inicial)", r && /stock inicial/.test(r.msg ?? ""), r?.msg);
    afirmar("no deja ningún movimiento", d.sin_filas === "0", `movimientos=${d.sin_filas}`);
    afirmar("el candado está UNA vez en la función (se puede volver a pegar)", d.marca_nueva === "2", `apariciones=${d.marca_nueva} (la marca va en el comentario y en el hint)`);
    afirmar("el parche anterior («Reposición» no toca el piso) sigue puesto", d.marca_vieja === "true");
  },
);

correr(
  "2. La otra puerta: stock inicial, todas o ninguna, al almacén o al piso",
  `${COMO_API}${K("carga", carga(items(["v1", 3], ["v2", 2])))}
${COMO_POSTGRES}${K("libro", "(select string_agg(concat_ws(':', m.tipo, m.motivo, m.cantidad, m.sububicacion_id = :'alm', m.usuario_id = :'felipe'), ',' order by m.cantidad) from retail.movimientos m where m.variante_id in (:'v1', :'v2'))")}
${K("alm1", stock("v1", "alm"))}
${K("alm2", stock("v2", "alm"))}`,
  (d) => {
    const r = j(d.carga);
    afirmar("carga 5 unidades de las dos prendas", r && r.ok && r.res === "5", d.carga);
    afirmar("son ENTRADAS «carga_inicial» al almacén, firmadas por Felipe", d.libro === "entrada:carga_inicial:2:t:t,entrada:carga_inicial:3:t:t", d.libro);
    afirmar("el almacén quedó con 3 y 2", d.alm1 === "3" && d.alm2 === "2", `${d.alm1},${d.alm2}`);
  },
);

correr(
  "3. Colgadas en el piso: la entrada y su bajada, en la misma transacción",
  `${COMO_API}${K("carga", carga(items(["v1", 4]), true))}
${COMO_POSTGRES}${K("piso", stock("v1", "piso"))}
${K("alm", stock("v1", "alm"))}
${K("bajada", "(select count(*) from retail.movimientos where variante_id = :'v1' and motivo = 'movimiento_interno')")}`,
  (d) => {
    afirmar("carga 4", j(d.carga)?.res === "4", d.carga);
    afirmar("quedan en el piso y el almacén en 0 (el piso nunca «sube solo»: hay una bajada)", d.piso === "4" && d.alm === "0" && d.bajada === "1", `piso=${d.piso} alm=${d.alm} bajadas=${d.bajada}`);
  },
);

correr(
  "4. Con historia, un ajuste es una corrección y pasa; la carga inicial ya no sirve",
  `${COMO_API}select ${carga(items(["v1", 3]))} as _c \\gset
${K("correccion", ajuste("v1", -1))}
${K("otra_carga", carga(items(["v1", 2])))}
${COMO_POSTGRES}${K("alm", stock("v1", "alm"))}`,
  (d) => {
    afirmar("un ajuste de −1 sobre una prenda con historia pasa como siempre", j(d.correccion)?.ok === true, d.correccion);
    const otra = j(d.otra_carga);
    afirmar("una segunda carga inicial se rechaza (`carga_con_historia`)", otra && otra.ok === false && otra.hint === "carga_con_historia", d.otra_carga);
    afirmar("el almacén quedó en 3 − 1 = 2", d.alm === "2", `alm=${d.alm}`);
  },
);

correr(
  "5. Todas o ninguna: si una prenda de la lista ya tiene historia, no se carga ninguna",
  `${COMO_API}select ${carga(items(["v1", 1]))} as _c \\gset
${K("mixta", carga(items(["v1", 1], ["v2", 5])))}
${COMO_POSTGRES}${K("v2", movs("v2"))}`,
  (d) => {
    afirmar("la carga mixta se rechaza", j(d.mixta)?.ok === false, d.mixta);
    afirmar("y la prenda sin historia tampoco entró", d.v2 === "0", `movimientos v2=${d.v2}`);
  },
);

correr(
  "6. Permisos y forma",
  `${K("anon", "has_function_privilege('anon', 'retail.cargar_stock_inicial(uuid, jsonb, text, boolean, uuid)'::regprocedure, 'EXECUTE')")}
${K("auth", "has_function_privilege('authenticated', 'retail.cargar_stock_inicial(uuid, jsonb, text, boolean, uuid)'::regprocedure, 'EXECUTE')")}
${K("una", "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'cargar_stock_inicial')")}
${K("interna", "not has_function_privilege('authenticated', 'retail.fn_cargar_stock_inicial(uuid, jsonb, text)'::regprocedure, 'EXECUTE')")}`,
  (d) => {
    afirmar("anon NO puede ejecutar cargar_stock_inicial", d.anon === "false");
    afirmar("authenticated sí", d.auth === "true");
    afirmar("hay UNA sola cargar_stock_inicial", d.una === "1");
    afirmar("la carga interna (fn_cargar_stock_inicial) sigue sin llamarse de afuera", d.interna === "true");
  },
);

console.log(`\n${fallos === 0 ? "✔" : "✘"} ${total - fallos}/${total} verificaciones${fallos ? ` — ${fallos} fallaron` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
