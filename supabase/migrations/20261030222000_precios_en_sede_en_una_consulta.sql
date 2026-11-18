-- ============================================================================
-- 20261030222000_precios_en_sede_en_una_consulta.sql — CAYLA V2 · rendimiento de la base (2026-10-30)
-- `fn_precios_en_sede(tienda)` arma la lista de una sola vez, en vez de preguntar el precio prenda por prenda.
--
-- EL PROBLEMA PRIMERO. El 2026-10-30 la base compartida con Dynamic llegó a «Memory commitment: SEVERE». Entre las funciones de retail,
-- `fn_precios_en_sede` era la que más tiempo pesaba por llamada: 93 ms de promedio y 36 171 llamadas desde el 17-oct (Vender la relee cada
-- 10 s con la caja abierta, `usePreciosEnVivo`; también Apartados, Cambios, Frescura y las etiquetas). Medido en producción como líder:
-- 121 a 147 ms para devolver solo 99 a 251 filas por tienda, y 115 ms en el Taller, que no tiene ninguna. Su consulta llamaba a
-- `fn_precio_en_sede(variante, tienda)` una vez por cada prenda candidata; esa función es `security definer`, así que Postgres no puede
-- fundirla en la consulta de afuera: la planifica y la corre otra vez en cada fila (~0,5 ms cada una). Es la misma forma del problema de
-- `public.marcajes` del mismo día (sus políticas corrían funciones en cada fila).
--
-- QUÉ HACE. La misma lista, con la regla de cobro escrita en la consulta (un `left join` a cada capa de precio de tienda) en vez de una
-- llamada por fila. La regla es la de `fn_precio_en_sede` (20261028230000), en el mismo orden:
--   1. la talla de OBSEQUIO (S/ 0 en la grilla, en una categoría que admite el 0) vale 0 en toda tienda;
--   2. si no, la excepción de ESA combinación en ESA tienda (`precios_sede_variante`);
--   3. si no, el precio de la prenda en esa tienda (`precios_sede_prenda`);
--   4. si no, la grilla.
-- Como antes, solo salen las combinaciones con alguna capa de tienda vigente cuyo precio queda distinto al de la grilla, y nada sin sesión.
--
-- POR QUÉ LA REGLA SE ESCRIBE DOS VECES (y cómo no se separan). `fn_precio_en_sede` sigue siendo la única regla de COBRO: la usan
-- `registrar_venta`, Apartar, Proformas y Cambios, y esta migración no la toca. Esta función solo MUESTRA. Es el mismo trato que ya tiene
-- `fn_productos_filtro` (20261028232000): la regla en línea por rendimiento, y una prueba que exige que las dos digan lo mismo en TODA
-- combinación de TODA tienda (`pnpm pruebas:precio-sede-variante`, caso 21, con su MUTANTE). Si mañana cambia la regla de cobro y nadie
-- cambia esta, la prueba se pone en rojo.
--
-- MEDIDO ANTES DE ESCRIBIR (producción, solo lectura, 2026-10-30, sesión de un líder): en las 4 ubicaciones activas la lista nueva y la vieja
-- son IGUALES fila por fila (0 diferencias, en los dos sentidos) y bajan de 115–141 ms a ~3,3 ms.
--
-- LO QUE NO CAMBIA: la firma, lo que devuelve, quién puede llamarla (`security definer`, `auth.uid() is not null`) y `fn_precio_en_sede`.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe): UNA parte, solo un `create or replace function` (sin políticas, sin `drop trigger`,
-- ADR-0195). Idempotente. Sin `select … into` (ADR-0288). Para volver atrás: pegar la definición de 20261028232000.
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

create or replace function retail.fn_precios_en_sede(p_ubicacion_id uuid)
returns table (variante_id uuid, precio numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Las variantes que en esta tienda valen OTRO precio que el de su grilla, con ese precio. La regla es la de fn_precio_en_sede, escrita
  -- en la consulta para no correr una función por fila (20261030222000); la prueba exige que digan lo mismo en toda combinación y tienda.
  select x.variante_id, x.precio
    from (select v.id as variante_id,
                 v.precio as de_la_grilla,
                 case when v.precio = 0 and retail.fn_categoria_admite_precio_cero(pr.categoria_id) then v.precio
                      else coalesce(pv.precio, ps.precio, v.precio) end as precio
            from retail.variantes v
            join retail.productos pr on pr.id = v.producto_id
            left join retail.precios_sede_variante pv
              on pv.variante_id = v.id and pv.ubicacion_id = p_ubicacion_id and pv.archivado_en is null
            left join retail.precios_sede_prenda ps
              on ps.producto_id = v.producto_id and ps.ubicacion_id = p_ubicacion_id and ps.archivado_en is null
           where auth.uid() is not null
             and (pv.variante_id is not null or ps.producto_id is not null)) x
   where x.precio <> x.de_la_grilla;
$$;

comment on function retail.fn_precios_en_sede(uuid) is
  'Las variantes que en la tienda valen otro precio que el de su grilla, con ese precio (la regla de fn_precio_en_sede, en una sola consulta: 20261030222000). Solo con sesión.';
