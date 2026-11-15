-- ============================================================================
-- 20261115200000_quien_fija_precio_ve_el_costo.sql — CAYLA V2 · ADR-0668 (A3)
-- Quien fija el precio ve el costo; el cliente nunca. ESPERA EL OK DE FELIPE: es un permiso sobre dinero.
--
-- EL PROBLEMA PRIMERO. Felipe, 2026-11-15: «quiero permitir que vea el costo para que no fije un precio a ciegas… que el costo nunca
-- lo vea el cliente eso sí». En Recibir ya es así desde el 2026-11-07 (`fn_puede_poner_costo_al_recibir`, 20261107194000). En
-- Catálogo ▸ Productos no: quien tiene el módulo Productos cambia el precio en la ficha, pero el costo solo lo ve quien tiene el dinero
-- de Compras (`fn_puede_ver_dinero_de_compras`: el líder o Facturas de compra / Por pagar / Notas de crédito). Fija el precio sin
-- saber cuánto se pagó. Y «Revisar precios» y «Aplicar» de la IA le dicen «Tu rol no ve los costos» aunque tenga Productos.
--
-- QUÉ CAMBIA
--   `fn_ve_costo_de_prenda()` (NUEVA) = quien ve el dinero de Compras, O quien tiene Productos, Recibir mercadería o Campañas (las tres
--   hojas donde se fija o se rebaja un precio). Reemplaza a `fn_puede_ver_dinero_de_compras()` SOLO en las seis funciones de LA HOJA donde
--   se fija el precio de una prenda (Felipe: «quien fija el precio ve el costo en esa hoja»):
--     · Editar producto y Nuevo producto: `fn_costos_variantes_json`, `fn_costo_de_la_prenda`, `fn_costo_de_las_tallas` y
--       `catalogo_actualizar_producto` (el costo a mano de una talla SIN costo de Compras ni del Taller; el que vino de una compra sigue
--       sin corregirse a mano: eso no cambia aquí). Crear una prenda ya guardaba el costo sin preguntar por el dinero
--       (`crear_producto_con_variantes`): la ficha ahora dice lo mismo.
--     · Revisar precios y la IA: `fn_precios_a_revisar` y `aplicar_precio_propuesto` (proponer ya estaba abierto a Productos y
--       Recibir: `fn_precio_contexto`, `registrar_precio_propuesta`).
--     · Campañas ▸ el aviso «queda bajo el costo» lee `fn_costos_variantes_json`: ahora sale también para quien arma la campaña.
--   A QUIÉN LE ABRE, medido en producción el 2026-11-15: solo al rol «Terminal de ventas» (las 3 terminales del mostrador, con Productos
--   y Punto de venta). «Terminal Almacén» y «Compras» ya veían el costo por el dinero de Compras.
--
-- LA TABLA DE PRODUCTOS NO CAMBIA (`fn_productos_listado`, `fn_productos_facetas`, `fn_productos_filtro`): sus columnas Costo y Margen,
-- la vista rápida y el filtro «Falta: costo» siguen con el dinero de Compras. Es la lista que se mira de pasada, también en la pantalla
-- del mostrador con la clienta delante; el costo sale solo al abrir la hoja que cambia el precio.
--
-- LO QUE NO CAMBIA: el dinero de Compras sigue cerrado para quien no lo ve: facturas, saldos, lo que se le debe a cada proveedor, el
-- valor del inventario (`fn_valor_inventario_existencias`), los ingresos por modelo, el historial de cambios de costo
-- (`fn_historial_prenda`), la fusión de productos y las tallas sin costo de Existencias. Corregir un costo de compra sigue siendo del
-- líder (`fn_costo_de_la_prenda`.`puede_corregir`). Y NINGUNA pantalla de cara al cliente (Vender, el ticket, la etiqueta, la tienda
-- web) pide el costo: lo vigila `apps/web/lib/costo-no-llega-al-cliente.test.ts`.
--
-- DECIDÍ: una sola puerta, «puede fijar precio en alguna hoja», en las funciones de esas hojas.
-- DESCARTÉ: (a) abrir `fn_puede_ver_dinero_de_compras()`: también cuida facturas y lo que se debe a cada proveedor, que no son de quien
--   fija un precio; (b) una puerta por función (Productos en unas, Campañas en otras): son la misma pregunta y se separarían con el
--   tiempo (dos definiciones de lo mismo); (c) darle a cada rol un módulo de Compras: le abriría todo el dinero de Compras.
-- SE ROMPE SI: alguien llama a una de estas seis desde una pantalla de cara al cliente para «mostrar el ahorro». La prueba de la web lo
--   rechaza; la base no distingue pantallas, solo cuentas (una terminal de Vender con Productos ve el costo al abrir Editar producto, nunca en Vender).
--
-- CÓMO. Cada función se cambia sobre su definición VIVA: se busca `retail.fn_puede_ver_dinero_de_compras()` y debe estar exactamente
-- una vez (medido en producción el 2026-11-15: una vez en las seis, y una sola versión de cada una). Si ya dice `fn_ve_costo_de_prenda`,
-- no hace nada; si la pregunta no está o está dos veces, aborta SIN TOCAR NADA (todo va en una transacción).
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe). UNA parte, idempotente: funciones y comentarios, SIN tablas, políticas ni
-- `drop trigger` (ADR-0195). ORDEN con la web: primero este SQL, después la web. Con la web de antes, la Terminal de ventas ya ve el
-- costo en Editar producto (la ficha lo dibuja si la base se lo da); el botón «Revisar precios» le aparece recién con la web nueva.
-- VUELTA ATRÁS: el mismo reemplazo al revés (`fn_ve_costo_de_prenda()` → `fn_puede_ver_dinero_de_compras()`) en las seis; la función
-- nueva puede quedarse.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_ve_costo_de_prenda()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(retail.fn_puede_ver_dinero_de_compras(), false)
      or coalesce(retail.fn_ve_modulo('productos'), false)
      or coalesce(retail.fn_ve_modulo('recibir'), false)
      or coalesce(retail.fn_ve_modulo('campanas'), false);
$$;
comment on function retail.fn_ve_costo_de_prenda() is
  'ADR-0668 (A3, Felipe 2026-11-15: «quien fija precio ve el costo; el cliente nunca»): quien ve el dinero de Compras, o quien tiene Productos, Recibir mercadería o Campañas. Solo para el costo de UNA prenda donde se fija su precio; el resto del dinero de Compras sigue con fn_puede_ver_dinero_de_compras.';
revoke all on function retail.fn_ve_costo_de_prenda() from public, anon;
grant execute on function retail.fn_ve_costo_de_prenda() to authenticated, service_role;

-- La puerta de cada función, cambiada sobre su definición viva. Una sola versión por nombre: si hubiera dos, no se sabría cuál tocar.
create or replace function pg_temp.cambiar_puerta(p_nombre text)
returns void
language plpgsql
as $f$
declare
  v_oid oid;
  v_versiones integer;
  v_def text;
  v_n integer;
begin
  v_versiones := (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'retail' and p.proname = p_nombre);
  if v_versiones <> 1 then
    raise exception 'retail.% tiene % versiones: se esperaba una', p_nombre, v_versiones;
  end if;
  v_oid := (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'retail' and p.proname = p_nombre);
  v_def := pg_get_functiondef(v_oid);
  if position('retail.fn_ve_costo_de_prenda()' in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'retail.fn_puede_ver_dinero_de_compras()', '')))
         / length('retail.fn_puede_ver_dinero_de_compras()');
  if v_n <> 1 then
    raise exception 'retail.% cambió desde que se escribió esta migración: pregunta % veces por el dinero de Compras (se esperaba 1)', p_nombre, v_n;
  end if;
  execute replace(v_def, 'retail.fn_puede_ver_dinero_de_compras()', 'retail.fn_ve_costo_de_prenda()');
end;
$f$;

select pg_temp.cambiar_puerta('fn_costos_variantes_json');
select pg_temp.cambiar_puerta('fn_costo_de_la_prenda');
select pg_temp.cambiar_puerta('fn_costo_de_las_tallas');
select pg_temp.cambiar_puerta('catalogo_actualizar_producto');
select pg_temp.cambiar_puerta('fn_precios_a_revisar');
select pg_temp.cambiar_puerta('aplicar_precio_propuesto');

reset search_path;
reset lock_timeout;
