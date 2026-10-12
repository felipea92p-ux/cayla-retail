#!/usr/bin/env node
/**
 * Prueba de ADR-0381 «El precio 0 solo vale en Empaque, también en la base» — la mitad del CATÁLOGO
 * (`supabase/migrations/20261012190000_precio_cero_solo_empaque.sql`). La venta y la aprobación tienen sus casos en
 * `registrar_venta.mjs` y `revisar_productos_pendientes.mjs`, junto a las demás pruebas de esas funciones.
 *
 * EL PROBLEMA. Editar producto ya pedía «un precio mayor que 0» (salvo en Empaque, ADR-0377), pero solo la pantalla: la base
 * aceptaba el 0 en `crear_producto_con_variantes` (Nuevo producto) y en `catalogo_actualizar_producto` (Editar producto). Una
 * celda de la tabla de precios del alta con «0» creaba la prenda a S/ 0, y la caja la vendía gratis.
 *
 * QUÉ CUBRE
 *   A. Nuevo producto (`crear_producto_con_stock_inicial` → `crear_producto_con_variantes`): una variante a 0 no se crea
 *      (`sin_precio`) y no queda NADA (ni el producto); con precio se crea; en una familia fuera de los motores el 0 se crea;
 *      un negativo sigue rechazándose.
 *   B. Editar producto (`catalogo_actualizar_producto`): poner una variante ACTIVA en 0 se rechaza y el precio no cambia;
 *      una desactivada en 0 se guarda (no se vende); en Empaque el 0 se guarda; un precio normal se guarda.
 *   C. La regla: `fn_categoria_admite_precio_cero` dice sí solo en una familia apagada, y no sin dato; la migración se puede
 *      volver a pegar.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK (nunca se commitea nada), como Felipe (líder) con `request.jwt.claim.sub`.
 *
 * USO
 *   pnpm pruebas:precio-cero    → con la migración ya aplicada en el Postgres local
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MIGRACION = join(RAIZ, "supabase", "migrations", "20261012190000_precio_cero_solo_empaque.sql");
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

// `pg_temp.intentar(sql)` devuelve «ok» o «hint :: mensaje» en vez de abortar, para mirar el estado DESPUÉS del error.
// `pg_temp.crear(ref, precio)` es el alta de Nuevo producto (sin unidades: lo que se prueba es el precio) en una categoría que no
// exige tejido ni patrón, con una talla. `pg_temp.guardar(producto, precio, activa)` es el guardado de Editar producto con su
// única variante cambiada.
const PRELUDIO = `
create function pg_temp.intentar(p_sql text) returns text language plpgsql as $f$
declare v_hint text; v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint, v_msg = message_text;
  return coalesce(nullif(v_hint, ''), '-') || ' :: ' || v_msg;
end $f$;
set local request.jwt.claim.sub = '${FELIPE}';
set local request.jwt.claims = '{"sub":"${FELIPE}","role":"authenticated"}';
select c.id as cat, c.familia as familia from retail.categorias c join retail.familias f on f.codigo = c.familia
  where c.activo and not f.exige_tejido_patron
    and exists (select 1 from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo where ct.categoria_id = c.id)
  order by c.nombre limit 1 \\gset
select t.id as talla from retail.categoria_tallas ct join retail.tallas t on t.id = ct.talla_id and t.activo
  where ct.categoria_id = :'cat' order by t.id limit 1 \\gset
select set_config('prueba.cat', :'cat', true) as _c, set_config('prueba.talla', :'talla', true) as _t \\gset
create function pg_temp.crear(p_ref text, p_precio numeric) returns uuid language sql as $f$
  select retail.crear_producto_con_stock_inicial(
    p_referencia => p_ref, p_categoria_id => current_setting('prueba.cat')::uuid,
    p_variantes => jsonb_build_array(jsonb_build_object('talla_id', current_setting('prueba.talla'), 'color_codigo', null,
                                                        'precio', p_precio, 'costo', 0)),
    p_token => gen_random_uuid());
$f$;
create function pg_temp.guardar(p_producto uuid, p_precio numeric, p_activa boolean) returns integer language sql as $f$
  select retail.catalogo_actualizar_producto(
    p_producto_id => p.id, p_referencia => p.referencia, p_estado => p.estado,
    p_variantes => (select jsonb_agg(jsonb_build_object('id', v.id, 'color_codigo', v.color_codigo, 'talla_id', v.talla_id,
                                                        'precio', p_precio, 'costo', v.costo, 'activo', p_activa))
                      from retail.variantes v where v.producto_id = p.id),
    p_categoria_id => p.categoria_id, p_descripcion => p.descripcion, p_stock_minimo => p.stock_minimo,
    p_temporada => p.temporada, p_permitir_venta_sin_stock => p.permitir_venta_sin_stock,
    p_tejido_id => p.tejido_id, p_patron_id => p.patron_id)
  from retail.productos p where p.id = p_producto;
$f$;
`;

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`    ${JSON.stringify(detalle).slice(0, 1500)}`);
  }
}

// ============================================================================
// A. Nuevo producto
// ============================================================================
{
  const r = correr(`
    select pg_temp.intentar($$select pg_temp.crear('Llavero Prueba Precio Cero', 0)$$);
    select count(*) from retail.productos where referencia = 'Llavero Prueba Precio Cero';
    select pg_temp.intentar($$select pg_temp.crear('Llavero Prueba Precio Bien', 25)$$);
    select pg_temp.intentar($$select pg_temp.crear('Llavero Prueba Precio Negativo', -1)$$);
  `);
  const l = r.ok ? r.lineas : [];
  esperar("una variante a S/ 0 no se crea (sin_precio) en una familia de mercadería", r.ok && /^sin_precio :: /.test(l[0] ?? ""), r.ok ? l : r.mensaje);
  esperar("…y no queda nada: ni el producto", r.ok && l[1] === "0", l);
  esperar("con precio, se crea como siempre", r.ok && l[2] === "ok", l);
  esperar("un precio negativo sigue rechazándose", r.ok && l[3] !== "ok", l);
}
{
  const r = correr(`
    update retail.familias set entra_a_motores = false where codigo = :'familia';
    select pg_temp.intentar($$select pg_temp.crear('Bolsa Prueba Obsequio', 0)$$);
  `);
  esperar("en una familia fuera de los motores (Empaque) el 0 sí se crea", r.ok && r.lineas[0] === "ok", r.ok ? r.lineas : r.mensaje);
}

// ============================================================================
// B. Editar producto
// ============================================================================
{
  const r = correr(`
    select pg_temp.crear('Llavero Prueba Editar', 25) as p \\gset
    select pg_temp.intentar(format('select pg_temp.guardar(%L, 0, true)', :'p'));
    select precio from retail.variantes where producto_id = :'p';
    select pg_temp.intentar(format('select pg_temp.guardar(%L, 0, false)', :'p'));
    select precio || '|' || activo from retail.variantes where producto_id = :'p';
    select pg_temp.intentar(format('select pg_temp.guardar(%L, 31.50, true)', :'p'));
    select precio || '|' || activo from retail.variantes where producto_id = :'p';
  `);
  const l = r.ok ? r.lineas : [];
  esperar("poner una variante ACTIVA en S/ 0 se rechaza (sin_precio)", r.ok && /^sin_precio :: /.test(l[0] ?? ""), r.ok ? l : r.mensaje);
  esperar("…y su precio no cambia", r.ok && l[1] === "25.00", l);
  esperar("una variante desactivada puede quedar en 0 (no se vende)", r.ok && l[2] === "ok" && l[3] === "0.00|false", l);
  esperar("un precio normal se guarda y la reactiva", r.ok && l[4] === "ok" && l[5] === "31.50|true", l);
}
{
  const r = correr(`
    select pg_temp.crear('Bolsa Prueba Editar', 1.20) as p \\gset
    update retail.familias set entra_a_motores = false where codigo = :'familia';
    select pg_temp.intentar(format('select pg_temp.guardar(%L, 0, true)', :'p'));
    select precio from retail.variantes where producto_id = :'p';
  `);
  esperar("en Empaque la variante activa puede quedar en S/ 0 (la bolsa de obsequio)", r.ok && r.lineas[0] === "ok" && r.lineas[1] === "0.00", r.ok ? r.lineas : r.mensaje);
}

// ============================================================================
// C. La regla y la migración
// ============================================================================
{
  const r = correr(`
    select retail.fn_categoria_admite_precio_cero(:'cat'), retail.fn_categoria_admite_precio_cero(null),
           retail.fn_categoria_admite_precio_cero(gen_random_uuid());
    update retail.familias set entra_a_motores = false where codigo = :'familia';
    select retail.fn_categoria_admite_precio_cero(:'cat');
  `);
  esperar("la regla: una familia de mercadería no admite 0; sin categoría o sin dato, tampoco", r.ok && r.lineas[0] === "f|f|f", r.ok ? r.lineas : r.mensaje);
  esperar("…una familia fuera de los motores, sí", r.ok && r.lineas[1] === "t", r.ok ? r.lineas : r.mensaje);
}
{
  const r = correr(`
    select has_function_privilege('anon', 'retail.fn_categoria_admite_precio_cero(uuid)', 'execute'),
           has_function_privilege('authenticated', 'retail.fn_categoria_admite_precio_cero(uuid)', 'execute');
  `);
  esperar("anon no ejecuta la regla; authenticated sí (la llama `catalogo_actualizar_producto`, que corre como quien guarda)", r.ok && r.lineas[0] === "f|t", r.ok ? r.lineas : r.mensaje);
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
  esperar("la migración se puede pegar dos veces (los reemplazos anclados no se duplican)", ok, mensaje);
}

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
