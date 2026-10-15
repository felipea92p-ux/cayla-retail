#!/usr/bin/env node
/**
 * Prueba de ADR-0385 «No se cambia por una prenda sin precio» (`supabase/migrations/20261012201000_cambio_sin_precio.sql`).
 *
 * EL PROBLEMA. `registrar_cambio` calcula la diferencia con el precio de la prenda NUEVA (`fn_precio_para_cambio`) y no
 * miraba si era 0. Cambiar una blusa de S/ 79.90 por una prenda en S/ 0 daba una diferencia de −79.90 que se le devolvía al
 * cliente: se llevaba la prenda nueva gratis y su dinero de vuelta, sin pasar por Devoluciones ni sus candados. Una prenda en 0
 * existe a propósito: el conteo la propone así («déjalo en 0 y lo completa el Líder») y queda pendiente hasta que alguien le
 * pone precio.
 *
 * QUÉ CUBRE
 *   1. Un cambio por una prenda con precio sigue funcionando (la base del resto).
 *   2. Por una prenda de mercadería en S/ 0: se rechaza con `cambio_sin_precio`, que nombra la prenda, y no queda NADA escrito
 *      (ni el cambio, ni movimientos, ni stock movido).
 *   3. Por una prenda en S/ 0 de una familia fuera de los motores (la bolsa de obsequio): TAMBIÉN se rechaza. Un cambio por
 *      una bolsa gratis sería una devolución completa por la puerta de atrás (decisión del ADR-0385).
 *   4. Una prenda con precio base 0 y precio propio en esta tienda TAMBIÉN se rechaza: desde el 2026-10-15 una talla a 0 en la grilla
 *      vale 0 en toda tienda (`20261015121000_talla_en_cero_sigue_en_cero.sql`); antes se cambiaba al precio de la tienda.
 *   5. La migración se puede pegar dos veces.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada), como Felipe (líder) con `request.jwt.claim.sub`.
 * La venta de partida es la de `registrar_cambio.mjs`: BLU-EMMA-NEG-M vendida en Tienda Lima y cambiada por VES-SOFI-NEG-M.
 * Vive aparte de `registrar_cambio.mjs` a propósito: ese archivo lo están tocando otros PR abiertos.
 *
 * USO
 *   pnpm pruebas:cambio-sin-precio    → con la migración ya aplicada en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = join(RAIZ, "supabase", "migrations", "20261012201000_cambio_sin_precio.sql");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder (seed)

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}
function correr(sql) {
  try {
    return { ok: true, lineas: psql(`begin;\n${PRELUDIO}\n${sql}\nrollback;\n`).trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

// `pg_temp.intentar(sql)` devuelve «ok» o «mensaje :: detalle» en vez de abortar, para mirar el estado DESPUÉS del error.
// Deja una venta de BLU-EMMA-NEG-M (`:venta_item`) en Tienda Lima, con caja abierta y stock de sobra de las dos prendas.
const PRELUDIO = `
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_msg text; v_det text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
  return v_msg || ' :: ' || coalesce(nullif(v_det, ''), '-');
end $f$;
set local request.jwt.claim.sub = '${FELIPE}';
select id as ubic from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Piso de venta', 'piso_venta'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'piso_venta');
insert into retail.sububicaciones (ubicacion_id, nombre, tipo)
  select :'ubic', 'Almacén de tienda', 'almacen_tienda'
  where not exists (select 1 from retail.sububicaciones where ubicacion_id = :'ubic' and tipo = 'almacen_tienda');
select (select count(*) from (
  select retail.cerrar_caja(id, 0) from retail.cajas where ubicacion_id = :'ubic' and estado = 'abierta'
) x) as _cerro_previa \\gset
select retail.abrir_caja(:'ubic', 500.00, 'prueba automatizada') as caja_id \\gset
select id as v_old, precio as precio_old from retail.variantes where sku = 'BLU-EMMA-NEG-M' \\gset
select id as v_new from retail.variantes where sku = 'VES-SOFI-NEG-M' \\gset
select retail.fn_sububicacion_por_defecto(:'ubic', 'venta') as sub_piso \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_old', :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov_old \\gset
select retail.fn_aplicar_movimiento(:'mov_old') as _d1 \\gset
insert into retail.movimientos (variante_id, ubicacion_id, sububicacion_id, tipo, cantidad, motivo)
  values (:'v_new', :'ubic', :'sub_piso', 'entrada', 50, 'colchón de prueba') returning id as mov_new \\gset
select retail.fn_aplicar_movimiento(:'mov_new') as _d2 \\gset
select retail.fn_precio_en_sede(:'v_old', :'ubic') as precio_old_sede \\gset
select retail.registrar_venta(:'ubic',
  jsonb_build_array(jsonb_build_object('variante_id', :'v_old', 'cantidad', 1, 'precio_unitario', :'precio_old_sede', 'descuento_unitario', 0)),
  jsonb_build_array(jsonb_build_object('metodo', 'tarjeta', 'monto', (:'precio_old_sede')::numeric)),
  null, gen_random_uuid()) as venta_id \\gset
select id as venta_item from retail.venta_items where venta_id = :'venta_id' and variante_id = :'v_old' \\gset
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'), 0) as stock_old_antes \\gset
select coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_new' and ubicacion_id = :'ubic'), 0) as stock_new_antes \\gset
`;

/** El cambio, con «tarjeta» para la diferencia (la haya o no: sin diferencia la base no la mira). */
const CAMBIAR = "select pg_temp.intentar(format('select retail.registrar_cambio(%L, %L, %L, 1, %L, gen_random_uuid())', :'venta_item', :'ubic', :'v_new', 'tarjeta'));";
/** Lo que quedó escrito: cambios de esa línea, y cuánto se movió el stock de cada prenda. */
const QUEDO = `select (select count(*) from retail.cambios where venta_item_id = :'venta_item')
  || '|' || (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_old' and ubicacion_id = :'ubic'), 0) - :'stock_old_antes')
  || '|' || (coalesce((select sum(cantidad) from retail.stock where variante_id = :'v_new' and ubicacion_id = :'ubic'), 0) - :'stock_new_antes');`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}

{
  const r = correr(`${CAMBIAR}\n${QUEDO}`);
  esperar("1 · un cambio por una prenda con precio sigue funcionando (y mueve el stock de las dos)", r.ok && r.lineas[0] === "ok" && r.lineas[1] === "1|1|-1", r.ok ? r.lineas : r.mensaje);
}
{
  const r = correr(`update retail.variantes set precio = 0 where id = :'v_new';\n${CAMBIAR}\n${QUEDO}`);
  const l = r.ok ? r.lineas : [];
  esperar("2 · por una prenda de mercadería en S/ 0 se rechaza con cambio_sin_precio y nombra la prenda", r.ok && /^cambio_sin_precio :: Vestido Sofía \(/.test(l[0] ?? ""), r.ok ? l : r.mensaje);
  esperar("    …y no queda nada escrito: ni el cambio ni stock movido", r.ok && l[1] === "0|0|0", l);
}
{
  const r = correr(`update retail.variantes set precio = 0 where id = :'v_new';
update retail.familias set entra_a_motores = false
  where codigo = (select c.familia from retail.categorias c join retail.productos p on p.categoria_id = c.id
                   join retail.variantes v on v.producto_id = p.id where v.id = :'v_new');
${CAMBIAR}`);
  esperar("3 · por una prenda en S/ 0 de una familia fuera de los motores (la bolsa de obsequio) también se rechaza", r.ok && /^cambio_sin_precio/.test(r.lineas[0] ?? ""), r.ok ? r.lineas : r.mensaje);
}
{
  // CAMBIÓ el 2026-10-15 («La talla de S/ 0 sigue en S/ 0», Felipe; `20261015121000_talla_en_cero_sigue_en_cero.sql`). Hasta ese día
  // una prenda en 0 con precio propio en la tienda se cambiaba al de la tienda. Ahora una talla a 0 en la grilla vale 0 en TODA tienda:
  // el precio de la tienda ya no la rescata, sigue siendo una prenda sin precio y el cambio se rechaza como en el caso 2.
  const r = correr(`select producto_id as p_new from retail.variantes where id = :'v_new' \\gset
select retail.poner_precio_sede(:'p_new', :'ubic', 99, 'prueba automatizada') as _ps \\gset
update retail.variantes set precio = 0 where id = :'v_new';
${CAMBIAR}
${QUEDO}`);
  const l = r.ok ? r.lineas : [];
  esperar("4 · con precio base 0 y precio propio en la tienda, igual se rechaza: vale 0 en toda tienda (cambio_sin_precio, nada escrito)", r.ok && /^cambio_sin_precio :: Vestido Sofía \(/.test(l[0] ?? "") && l[1] === "0|0|0", r.ok ? l : r.mensaje);
}
{
  const sql = readFileSync(MIGRACION, "utf8");
  let ok = true;
  let mensaje = "";
  try {
    psql(`begin;\n${sql}\n${sql}\nrollback;\n`);
  } catch (e) {
    ok = false;
    mensaje = `${e.stderr ?? ""}`;
  }
  esperar("5 · la migración se puede pegar dos veces (el reemplazo anclado no se duplica)", ok, mensaje);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
