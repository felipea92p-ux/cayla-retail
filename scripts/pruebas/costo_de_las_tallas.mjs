#!/usr/bin/env node
/**
 * Prueba de `20261107232000_costo_de_las_tallas.sql` (ADR-0631): el «?» de cada talla gris en Catálogo ▸ Costos lee bien la
 * ÚLTIMA compra de cada talla.
 *
 * QUÉ CUBRE (el caso real del Short Sohanna, 7-nov)
 *   · una talla con una prenda guardada de antes: «había 1 a S/ 45, llegó 1 a S/ 48, quedó en S/ 46.50»;
 *   · una talla sin nada guardado: «no había ninguna, llegó 1 a S/ 48, quedó en S/ 48»;
 *   · una talla que llega dos veces en la misma compra (dos facturas): UNA entrada, con lo de antes de la primera línea, la suma
 *     de lo que llegó y lo que dejó la última; y la cuenta cierra a céntimos;
 *   · un cierre del Taller revertido no cuenta: la última entrada vuelve a ser la compra de antes (ADR-0614);
 *   · una talla sin compras no aparece (su costo es el declarado);
 *   · «igualar» (Solo sin stock, Felipe 2026-11-09): la talla sin compra y sin stock toma el costo de la última compra que cuenta (la del
 *     22-oct, no el cierre revertido); NO entran la que tiene stock, la que va en un traslado en camino ni la desactivada;
 *   · quien no ve el dinero de compras recibe null.
 *
 * CÓMO. Una transacción con ROLLBACK. Crea su propia prenda con tres variantes a S/ 45 y sin stock antes de 2030, y escribe las
 * entradas en 2030 directo en `movimientos` y `costo_historial` (como superusuario), con las cifras que habría dejado
 * `fn_recalcular_costo_variante`. Así lo que se mide es solo la lectura.
 *
 * USO
 *   node scripts/pruebas/costo_de_las_tallas.mjs    → con la migración ya aplicada en el local
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

// Una entrada de prueba: el movimiento y su fila de costo, en la misma hora (como una compra real).
const entrada = (v, cuando, stockPrevio, costoAntes, llegan, costoLlega, queda, origen = "compra") => `
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'${v}', :'tru', 'entrada', ${llegan}, 'prueba', '${cuando}') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, created_at)
select :'${v}', ${stockPrevio}, ${costoAntes}, ${llegan}, ${costoLlega}, ${queda}, '${origen}', id, '${cuando}' from m;`;

const ESCENARIO = `
begin;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as sub from retail.sububicaciones where ubicacion_id = :'tru' order by nombre limit 1 \\gset
with p as (
  insert into retail.productos (categoria_id, referencia, descripcion)
  select id, 'Prueba tallas ' || substr(gen_random_uuid()::text, 1, 8), 'prenda propia de la prueba' from retail.categorias order by nombre limit 1
  returning id)
insert into retail.variantes (producto_id, color_codigo, talla_id, sku, precio, costo)
select p.id, (select codigo from retail.colores where activo order by codigo limit 1), t.id, 'PRUEBA-TALLAS-' || substr(gen_random_uuid()::text, 1, 8), 89.90, 45
  from p cross join (select id from retail.tallas where activo and estado = 'aprobado' order by valor limit 6) t;
select producto_id as p1 from retail.variantes where sku like 'PRUEBA-TALLAS-%' order by created_at desc limit 1 \\gset
select id as v1 from retail.variantes where producto_id = :'p1' order by sku limit 1 \\gset
select id as v2 from retail.variantes where producto_id = :'p1' order by sku offset 1 limit 1 \\gset
select id as v3 from retail.variantes where producto_id = :'p1' order by sku offset 2 limit 1 \\gset
select id as v4 from retail.variantes where producto_id = :'p1' order by sku offset 3 limit 1 \\gset
select id as v5 from retail.variantes where producto_id = :'p1' order by sku offset 4 limit 1 \\gset
select id as v6 from retail.variantes where producto_id = :'p1' order by sku offset 5 limit 1 \\gset
-- Sin compra las cuatro (v3…v6). v4 tiene 1 prenda en tienda, v5 va en un traslado en camino y v6 está desactivada: solo v3 se iguala.
insert into retail.stock (variante_id, ubicacion_id, cantidad, updated_at, sububicacion_id, cantidad_apartada) values (:'v4', :'tru', 1, now(), :'sub', 0);
with t as (insert into retail.transferencias (ubicacion_origen_id, ubicacion_destino_id, estado) values (:'tru', :'lima', 'en_transito') returning id)
insert into retail.transferencia_items (transferencia_id, variante_id, cantidad) select t.id, :'v5', 1 from t;
update retail.variantes set activo = false where id = :'v6';

-- v1 tiene 1 de la carga inicial (sin fila de costo, a su costo declarado de S/ 45).
insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at) values (:'v1', :'tru', 'entrada', 1, 'prueba', '2030-09-12');

-- ① 5 oct, una compra: v1 (había 1 a 45, llega 1 a 48 → 46.50) y v2 (no había ninguna, llega 1 a 48 → 48).
${entrada("v1", "2030-10-05", 1, 45, 1, 48, 46.5)}
${entrada("v2", "2030-10-05", 0, 45, 1, 48, 48)}

-- ② 22 oct, v2 llega dos veces en la misma compra: 2 a 50 (había 1 a 48 → 49.33) y 1 a 52 (había 3 a 49.33 → 50.00).
${entrada("v2", "2030-10-22", 1, 48, 2, 50, 49.33)}
${entrada("v2", "2030-10-22", 3, 49.33, 1, 52, 50)}

-- ③ 1 nov, un cierre del Taller de v1 (2 a 60 → 53.25) que se revierte el 2 nov: para la ficha, nunca pasó.
${entrada("v1", "2030-11-01", 2, 46.5, 2, 60, 53.25, "produccion")}
select ch.movimiento_id as cierre from retail.costo_historial ch where ch.variante_id = :'v1' and ch.origen = 'produccion' \\gset
with m as (insert into retail.movimientos (variante_id, ubicacion_id, tipo, cantidad, motivo, created_at)
           values (:'v1', :'tru', 'salida', 2, 'prueba', '2030-11-02') returning id)
insert into retail.costo_historial (variante_id, stock_previo, costo_anterior, cantidad_nueva, costo_unitario_nuevo, costo_resultante, origen, movimiento_id, revierte_movimiento_id, created_at)
select :'v1', 4, 53.25, 2, 60, 46.5, 'reversion', id, :'cierre', '2030-11-02' from m;

-- Sin sesión: no ve el dinero de compras.
select 'sin_permiso|' || coalesce(retail.fn_costo_de_las_tallas(:'p1')::text, 'null');

set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select 'tallas|' || retail.fn_costo_de_las_tallas(:'p1')::text;
select 'ids|' || :'v1' || ',' || :'v2' || ',' || :'v3' || ',' || :'v4' || ',' || :'v5' || ',' || :'v6';
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
const respuesta = JSON.parse(linea("tallas") || "{}");
const tallas = respuesta.tallas ?? {};
const [v1, v2, v3] = linea("ids").split(",");
const forma = (t) => (t ? [t.habia, Number(t.costo_habia), t.llegaron, Number(t.costo_llegaron), Number(t.quedo), t.origen] : null);

esperar("quien no ve el dinero de compras recibe null", linea("sin_permiso") === "null", linea("sin_permiso"));
esperar("una clave por cada talla con compras, y ninguna para la que no tiene", Object.keys(tallas).length === 2 && !(v3 in tallas), Object.keys(tallas));
esperar("con una prenda de antes: había 1 a 45, llegó 1 a 48, quedó en 46.50 (el cierre revertido no cuenta)",
  JSON.stringify(forma(tallas[v1])) === JSON.stringify([1, 45, 1, 48, 46.5, "compra"]), tallas[v1]);
esperar("dos líneas de la misma compra son una: había 1 a 48, llegaron 3 a 50.67, quedó en 50.00",
  JSON.stringify(forma(tallas[v2])) === JSON.stringify([1, 48, 3, 50.67, 50, "compra"]), tallas[v2]);
esperar("la fecha es la de la última compra de la talla", String(tallas[v2]?.fecha ?? "").startsWith("2030-10-22"), tallas[v2]?.fecha);
esperar("igualar: solo la talla sin compra NI stock, al costo de la última compra que cuenta (50.67, no el cierre revertido)",
  JSON.stringify(respuesta.igualar) === JSON.stringify({ costo: 50.67, variantes: [v3] }), respuesta.igualar);
for (const [nombre, t] of [["v1", tallas[v1]], ["v2", tallas[v2]]]) {
  if (!t) continue;
  const antes = t.habia * Number(t.costo_habia) + t.llegaron * Number(t.costo_llegaron);
  const despues = (t.habia + t.llegaron) * Number(t.quedo);
  // El redondeo a céntimos de cada línea y del promedio deja, a lo más, medio céntimo por prenda.
  esperar(`${nombre} · la cuenta del «?» cierra (${antes.toFixed(2)} ≈ ${despues.toFixed(2)})`,
    Math.abs(antes - despues) <= 0.005 * (t.habia + t.llegaron) + 0.01, t);
}

console.log(fallos ? `\n${fallos} falló` : "\nTodo bien");
process.exit(fallos ? 1 : 0);
