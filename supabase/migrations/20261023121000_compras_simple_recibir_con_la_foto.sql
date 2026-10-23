-- ============================================================================
-- 20261023121000_compras_simple_recibir_con_la_foto.sql — CAYLA V2 · ADR-0480 (Compras simple), actividad 6
-- La tienda recibe lo que compró la compradora mirando la foto de su papel, y la prenda que ella ya eligió llega elegida.
--
-- EL PROBLEMA PRIMERO. Lo comprado desde el celular (actividad 3) sale a la tienda como un envío (actividad 5) y se recibe con la
-- recepción de siempre (ADR-0393: contar por categoría, cerrar, crear lo nuevo). Esa recepción ya hace casi todo lo que Felipe decidió para
-- el paso 3: el costo sale de la línea y entra con el stock al cerrar, y al crear una prenda nueva viene el precio que sugirió la compradora
-- (`fn_envio_detalle`, ADR-0362 decisión 21). Le faltaban dos cosas: (1) la foto del papel, que la tienda no veía —y con solo el módulo
-- Recibir tampoco podía leer del depósito—; y (2) la prenda que la compradora eligió de sus habituales (`orden_compra_items.producto_id`):
-- la tienda tenía que volver a buscarla para decir «estas poleras son esa».
--
-- QUÉ CAMBIA (todo con reemplazos ANCLADOS sobre la definición viva: si el texto no es el esperado, se detiene sin cambiar nada)
--   1. `fn_envio_detalle`: cada línea trae `producto` ({id, nombre, codigo}) cuando la compradora eligió una prenda del catálogo; y el envío
--      trae `papeles`: el papel de cada compra que viene en él (de quién, qué papel, su foto y quién compró). Sin montos: la tienda no ve el
--      dinero de Compras por tener Recibir.
--   2. `fn_puede_ver_foto_gasto_viaje` (la regla del depósito `retail-gastos-viaje`): quien tiene Recibir puede leer las fotos de la carpeta
--      `papeles/`. Solo esa carpeta: los vouchers de la plata (`plata/`) y los gastos (`gastos/`) siguen siendo de Compras.
--
-- DESCARTÉ
--   · Otra recepción para lo comprado desde el celular, con los tres pasos de la maqueta: ADR-0393 decidió una sola recepción, y la de hoy
--     ya tiene «¿Qué llegó? → Contar → Cerrar». Se le suma lo que faltaba, no se dibuja otra.
--   · Contar la prenda elegida sola, sin que la tienda lo confirme: lo que llegó lo certifica quien cuenta (decisión 17 de ADR-0362). La
--     pantalla la ofrece de un toque.
--   · Una política nueva en `storage.objects`: toma en exclusiva las tablas de `auth` y `storage` (ADR-0195). La regla vive en la función
--     que la política ya llama.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, después de 20261023114000). Una sola parte, sin tablas, políticas ni `drop trigger`:
-- solo reemplazos anclados de dos funciones, con `lock_timeout`. Idempotente (un reemplazo ya hecho se salta). Sin `select … into` dentro
-- de textos entre comillas (ADR-0288).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function pg_temp.reemplazar(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % apariciones de «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ---------- 1. El detalle del envío: la prenda elegida por línea y los papeles con su foto ----------
select pg_temp.reemplazar('retail.fn_envio_detalle(uuid)',
$v$                      'deuda_pendiente', retail.fn_nos_debe_pendiente(pr.id, di.categoria_id, di.marca_id, d.id)
$v$,
$n$                      'deuda_pendiente', retail.fn_nos_debe_pendiente(pr.id, di.categoria_id, di.marca_id, d.id),
                      -- ADR-0480 (actividad 6): la prenda del catálogo que eligió la compradora, para contarla sin buscarla.
                      'producto', (select jsonb_build_object('id', pp.id, 'nombre', pp.referencia, 'codigo', pp.codigo)
                                     from retail.productos pp where pp.id = i.producto_id)
$n$,
1);

select pg_temp.reemplazar('retail.fn_envio_detalle(uuid)',
$v$           'unidades', (select coalesce(sum(x.cantidad), 0)::integer from retail.despacho_items x where x.despacho_id = d.id),
$v$,
$n$           'unidades', (select coalesce(sum(x.cantidad), 0)::integer from retail.despacho_items x where x.despacho_id = d.id),
           -- ADR-0480 (actividad 6): el papel de cada compra anotada desde el celular que viene en el envío, con su foto. Sin montos.
           'papeles', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', cp.id, 'tipo', cp.tipo, 'foto_ruta', cp.foto_ruta, 'fecha', cp.fecha,
                      'proveedor', (select pr2.nombre from retail.proveedores pr2 where pr2.id = cp.proveedor_id),
                      'compradora', (select nullif(btrim(concat_ws(' ', pe.nombres, pe.apellidos)), '') from public.personas pe where pe.id = cp.persona_id))
                    order by cp.created_at)
               from retail.compra_papeles cp
              where cp.id in (select xo.papel_id
                                from retail.despacho_items x
                                join retail.orden_compra_items xi on xi.id = x.orden_compra_item_id
                                join retail.ordenes_compra xo on xo.id = xi.orden_compra_id
                               where x.despacho_id = d.id)
           ), '[]'::jsonb),
$n$,
1);

-- ---------- 2. La foto del papel la puede leer quien recibe ----------
select pg_temp.reemplazar('retail.fn_puede_ver_foto_gasto_viaje(text)',
$v$  if v_carpeta !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
$v$,
$n$  -- ADR-0480 (actividad 6): la foto del papel de una compra la mira la tienda que la recibe. Solo esa carpeta.
  if v_carpeta = 'papeles' and retail.fn_ve_modulo('recibir') then
    return true;
  end if;
  if v_carpeta !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
$n$,
1);
