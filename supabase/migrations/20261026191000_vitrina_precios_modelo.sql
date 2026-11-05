-- ============================================================================
-- Tienda web ▸ Vitrina: con qué precio sale un modelo en cada tienda de la web (la hoja del modelo lo dice)
-- ============================================================================
-- POR QUÉ. La hoja de un modelo no traía ningún precio: quien quería saber «¿con cuánto lo ve la clienta?» tenía que salir a Catálogo ▸
-- Productos, y ahí ve el precio de la prenda, no el de cada tienda ni el que ya lleva campaña (/formidable, 2026-10-26: la colaboradora
-- que probó la Vitrina no pudo responderlo). La regla del precio de la tienda ya existe y es una sola (`fn_tienda_precios`, ADR-0408); lo
-- que faltaba es una puerta de LECTURA para el ERP, porque esa función es solo de la tienda online (`revoke … authenticated`).
--
-- CONTRATO
--   PROMETE: para un modelo, UNA lectura con lo que el cliente vería en cada tienda que se ve en la web, tal cual la dibuja la tarjeta de la
--            tienda: el precio de la talla más cara (`precio`), el que paga con la campaña de la caja (`precio_final`), si es «Desde»
--            (`desde`: la campaña no toca a todas las tallas por igual) y la campaña (`campana`: nombre, %, último día); y, aparte, lo que
--            ve quien NO elige tienda («Todas»: el mayor entre las tiendas de la web). Una tienda que no ofrece el modelo (sin precio ahí)
--            dice `se_ofrece = false` y no trae precio.
--   ASUME:   que `fn_tienda_precios` es la regla (no se copia aquí ninguna cuenta), que `fn_tienda_sedes_web()` son las tiendas que se ven en
--            la web y que quien llama tiene el módulo `vitrina_web`.
--   NO HACE: escribir nada, cambiar un precio, decidir si el modelo se ve en la web (eso es `fn_vitrina_publicable`) ni tocar una función viva.
--
-- DECIDÍ: una función nueva que llama a la regla existente, y no pasar la regla a TypeScript ni sumarla a `fn_vitrina_modelos`.
-- DESCARTÉ: armar el precio en la pantalla con `fn_precios_sede_producto` + `variantes.precio` (duplica la regla y se desalinea de lo que cobra
--   la tienda: no ve campañas ni el mayor de «Todas») y meterlo en `fn_vitrina_modelos` (la lista de ~300 modelos pagaría el cálculo de
--   cada uno por un dato que se mira en una sola hoja).
-- SE ROMPE SI: alguien le da a `fn_tienda_precios` otra firma o la vuelve a esconder de esta función (falla fuerte, no en silencio); o si se
--   pega en producción esta migración sin que estén `20261015012000` y `20261014225000` (no existe la regla o el módulo). Si la función no
--   está en producción todavía, la hoja dice «No se pudo leer el precio» y todo lo demás sigue igual.
--
-- PRODUCCIÓN. Una sola parte: una función nueva con `revoke`/`grant` (no toca tablas ni políticas ni disparadores: ADR-0195). Se pega con el OK
-- de Felipe. Todos los nombres llevan `retail.`.
-- ============================================================================
set lock_timeout = '3s';

create or replace function retail.fn_vitrina_precios_modelo(p_producto_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  perform retail.fn_exigir_modulo('vitrina_web');
  return jsonb_build_object(
    -- Una fila por tienda que se ve en la web, por nombre. `lateral … limit 1`: la función repite el resumen del modelo en cada talla.
    'sedes', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', u.id,
                 'nombre', u.nombre,
                 'se_ofrece', p.resumen_precio is not null,
                 'precio', p.resumen_precio,
                 'precio_final', p.resumen_final,
                 'desde', coalesce(p.resumen_desde, false),
                 'campana', p.resumen_campana)
               order by u.nombre)
        from unnest(retail.fn_tienda_sedes_web()) as s (id)
        join retail.ubicaciones u on u.id = s.id
        left join lateral (select x.* from retail.fn_tienda_precios(array[p_producto_id], s.id) x limit 1) p on true
    ), '[]'::jsonb),
    -- Lo que ve quien no elige tienda: «Todas» (`null`), el mayor entre las tiendas de la web.
    'todas', coalesce((
      select jsonb_build_object(
               'se_ofrece', p.resumen_precio is not null,
               'precio', p.resumen_precio,
               'precio_final', p.resumen_final,
               'desde', coalesce(p.resumen_desde, false),
               'campana', p.resumen_campana)
        from (select x.* from retail.fn_tienda_precios(array[p_producto_id], null) x limit 1) p
    ), jsonb_build_object('se_ofrece', false, 'precio', null, 'precio_final', null, 'desde', false, 'campana', null)
    ));
end;
$fn$;

comment on function retail.fn_vitrina_precios_modelo(uuid) is
  'Tienda web ▸ Vitrina: con qué precio sale un modelo en cada tienda de la web (precio de la talla más cara, precio final con campaña, «Desde» y campaña) y con «Todas». Solo lectura, módulo vitrina_web; la regla es fn_tienda_precios (una sola).';

revoke all on function retail.fn_vitrina_precios_modelo(uuid) from public, anon;
grant execute on function retail.fn_vitrina_precios_modelo(uuid) to authenticated;
