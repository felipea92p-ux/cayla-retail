#!/usr/bin/env node
/**
 * Prueba de `20261024223000_costo_de_la_prenda.sql`: la pestaña «Costo» del Historial lee bien cada compra, a nivel PRENDA.
 *
 * QUÉ CUBRE (el ejemplo de la maqueta, docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html)
 *   · una compra al mismo costo: «ya tenías 12 a S/ 18.00, llegaron 30 a S/ 18.00, queda en S/ 18.00»;
 *   · una compra más cara de OTRA variante: el costo de la prenda mezcla las dos variantes (22 a 18 + 40 a 20.50 = 19.61),
 *     aunque el de la variante que llegó quede en 20.50; y las 20 que se vendieron entre compras se descuentan de «ya tenías»
 *     (el stock de la variante que no llegó sale de `movimientos`);
 *   · una variante que llega dos veces en la misma compra (dos facturas): es UNA compra, con las dos cantidades juntas;
 *   · la cuenta que muestra la pantalla cierra: ya_habia × costo_antes + llegaron × costo_llegaron ≈ total × costo_despues;
 *   · quien no ve el dinero de compras recibe null.
 *
 * CÓMO. Una transacción con ROLLBACK. Toma una prenda con dos variantes y sin compras con costo, deja su stock en cero antes
 * de 2030 (un ajuste por variante) y escribe las compras en 2030 directo en `movimientos` y `costo_historial` (como superusuario),
 * con las cifras que habría dejado `fn_recalcular_costo_variante`. Así lo que se mide es solo la lectura.
 *
 * USO
 *   node scripts/pruebas/costo_de_la_prenda.mjs    → con la migración ya aplicada en el local
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

const ESCENARIO = `
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
-- Una prenda con dos variantes y sin compras con costo.
-- La prenda de la prueba se crea aquí (dos variantes, sin compras): no depende de lo que dejen otras pruebas en la base.
with p as (
  insert into retail.productos (categoria_id, referencia, descripcion)
  select id, 'Prueba costo ' || substr(gen_random_uuid()::text, 1, 8), 'prenda propia de la prueba' from retail.categorias order by nombre limit 1
  returning id)
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, (select codigo from retail.colores where activo order by codigo limit 1), t.id, 'PRUEBA-COSTO-' || substr(gen_random_uuid()::text, 1, 8), 59.90, 18
  from p cross join (select id from retail.tallas where activo and estado = 'aprobado' order by valor limit 2) t;
select producto_id as p1 from retail.variantes where sku like 'PRUEBA-COSTO-%' order by created_at desc limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'p1' order by sku limit 1 \\gset
select id as v2 from retail.variantes where producto_id = :'p1' order by sku offset 1 limit 1 \\gset
-- Costo declarado S/ 18.00 en todas sus variantes, y stock en cero antes de 2030.
update retail.variantes set costo = 18 where producto_id = :'p1';
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
select v.id, :'tru', 'ajuste', -n.neto, 'prueba', '2029-12-31'
  from retail.variantes v
  cross join lateral (select coalesce(sum(case m.tipo when 'entrada' then m.cantidad when 'salida' then -m.cantidad
                                               when 'ajuste' then m.cantidad else 0 end), 0) as neto
                        from retail.movimientos m where m.variante_id = v.id) n
 where v.producto_id = :'p1' and n.neto <> 0;

-- 12 prendas de v1 que ya estaban (carga inicial, sin costo_historial).
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values (:'v1', :'tru', 'entrada', 12, 'prueba', '2030-09-12');

-- ① 5 oct: llegan 30 de v1 a 18.00 (había 12 a 18.00).
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 30, 'prueba', '2030-10-05') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 12, 18, 30, 18, 18, 'compra', id, '2030-10-05' from m;

-- Se venden 20 de v1.
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values (:'v1', :'tru', 'salida', 20, 'prueba', '2030-10-10');

-- ② 14 oct: llegan 40 de v2 a 20.50 (de v2 no había ninguna).
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v2', :'tru', 'entrada', 40, 'prueba', '2030-10-14') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v2', 0, 18, 40, 20.50, 20.50, 'compra', id, '2030-10-14' from m;

-- ③ 22 oct: v1 llega dos veces en la misma compra: 10 a 19.00 y 14 a 20.00 (había 22 a 18.00).
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 10, 'prueba', '2030-10-22') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 22, 18, 10, 19, 18.31, 'compra', id, '2030-10-22' from m;
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'entrada', 14, 'prueba', '2030-10-22') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'v1', 32, 18.31, 14, 20, 18.82, 'compra', id, '2030-10-22' from m;

-- Sin sesión: no ve el dinero de compras.
select 'sin_permiso|' || coalesce(retail.fn_costo_de_la_prenda(:'p1')::text, 'null');

set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select 'compras|' || (retail.fn_costo_de_la_prenda(:'p1') -> 'compras')::text;
rollback;
`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}

let salida = "";
try {
  salida = psql(ESCENARIO);
} catch (e) {
  console.log(`✗ el escenario no corrió\n    ${e.stderr ?? e.message}`);
  process.exit(1);
}
const linea = (clave) => salida.split("\n").find((l) => l.startsWith(`${clave}|`))?.slice(clave.length + 1) ?? "";
const compras = JSON.parse(linea("compras") || "[]").filter((c) => c.fecha >= "2030");
const resumen = compras.map((c) => [c.ya_habia, c.costo_antes, c.llegaron, c.costo_llegaron, c.costo_despues]);

esperar("quien no ve el dinero de compras recibe null", linea("sin_permiso") === "null", linea("sin_permiso"));
esperar("tres compras: la de dos facturas de la misma variante cuenta como una", compras.length === 3, compras);
esperar("① había 12 a 18.00, llegaron 30 a 18.00, queda en 18.00", JSON.stringify(resumen[0]) === JSON.stringify([12, 18, 30, 18, 18]), resumen[0]);
esperar("② las 20 vendidas se descuentan y el costo mezcla las dos variantes: 22 a 18 + 40 a 20.50 = 19.61",
  JSON.stringify(resumen[1]) === JSON.stringify([22, 18, 40, 20.5, 19.61]), resumen[1]);
esperar("③ dos líneas de la misma variante se juntan: 62 a 19.61 + 24 a 19.58 = 19.60",
  JSON.stringify(resumen[2]) === JSON.stringify([62, 19.61, 24, 19.58, 19.6]), resumen[2]);
for (const [i, c] of compras.entries()) {
  const antes = c.ya_habia * (c.costo_antes ?? 0) + c.llegaron * c.costo_llegaron;
  const despues = (c.ya_habia + c.llegaron) * c.costo_despues;
  // El redondeo a céntimos del costo de cada variante y del promedio deja, a lo más, medio céntimo por prenda.
  esperar(`${i + 1} · la cuenta de la pantalla cierra (${antes.toFixed(2)} ≈ ${despues.toFixed(2)})`,
    Math.abs(antes - despues) <= 0.005 * (c.ya_habia + c.llegaron) + 0.01, c);
}

console.log(fallos ? `\n${fallos} falló` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
