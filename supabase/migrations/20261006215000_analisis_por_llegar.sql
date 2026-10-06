-- ============================================================================
-- 20261006215000_analisis_por_llegar.sql — CAYLA V2 · ADR-0357 (Análisis v4, actividad 3: lo que viene en camino)
-- Una sola lectura, de solo lectura, con lo que viene en camino a UNA tienda, por prenda: de dónde viene, cuánto y cuándo llega.
--
-- EL PROBLEMA PRIMERO. En «Se está acabando» una prenda dice «Por llegar 7: compra 5 · llega el 15 oct, Taller 2». Hoy nadie lo da
-- por prenda: `fn_existencias_base` trae lo en camino por traslado, sin decir de dónde viene ni cuándo llega, y las compras abiertas
-- se leen factura por factura (`listar_compras_operativo` + `lineas_compra_operativo`), paginadas. Sin esto, la encargada vería
-- «comprar» algo que ya viene, y lo pediría dos veces.
--
-- QUÉ HACE. `retail.fn_analisis_por_llegar(p_ubicacion_id)` devuelve un jsonb: un arreglo de `{variante_id, de, cantidad, fecha}`,
-- una parte por prenda, origen y fecha (dos traslados de la misma tienda con la misma fecha se suman en una parte). Dos fuentes:
--   · TRASLADOS en camino a la tienda: los que ya salieron de su origen y todavía no se reciben (`estado = 'en_transito'`, la misma
--     definición que `fn_existencias_base` usa para «en camino»: un traslado recibido, aunque sea con diferencia, ya está en la
--     tienda). Por línea, lo enviado menos lo que ya entró al stock por su recepción (hoy es 0 mientras viaja: confirmar cambia el
--     estado en la misma transacción; se resta igual por si un día se recibe por partes). `de` es el tipo de la ubicación de
--     origen: 'taller', 'almacen' o 'tienda'. `fecha` es la llegada estimada que anotó quien envió, en día de Lima.
--     La producción del Taller cuenta SOLO cuando ya salió: entonces es un traslado desde el Taller (`de = 'taller'`). Una orden
--     en proceso no dice a qué tienda irá, y adivinarlo sería prometer prendas que nadie mandó.
--   · COMPRAS repartidas a la tienda que faltan recibir: `compra_item_reparto_resumen` (lo asignado a la tienda − lo recibido allí
--     − lo cerrado allí, la misma vista que usa Compras), de facturas vigentes de mercadería. `de = 'compra'`; `fecha` es la llegada
--     estimada de la factura (`compras.fecha_estimada_llegada`), o NULL si nadie la anotó. Una línea agrupada (sin talla ni color:
--     se desglosa al recibir, ADR-0035) no tiene prenda todavía y no sale aquí.
-- Sin la centinela de «sin registrar» ni productos de prueba. Sin dinero: unidades y fechas.
--
-- QUIÉN LA LEE. Las mismas dos puertas que `fn_analisis_sede` (20261006214000): la de todas las lecturas de retail
-- (`fn_tiene_acceso_retail()`) y la de Análisis (`fn_puede_analizar()`), sin pedir operar la sede (decisión 8 de Felipe,
-- 2026-10-06: la encargada y el líder ven lo mismo). Sin cualquiera de las dos devuelve NULL —no un arreglo vacío—: la web lo dice
-- como «no se pudo leer», nunca como «no viene nada». Las prendas que esta lectura nombra también salen como filas en
-- `fn_analisis_sede` (allí «en camino» es un traslado en tránsito o una compra con su prenda que falta recibir): la web cruza las dos.
--
-- NÚMEROS. Unos pocos traslados en tránsito y unas decenas de facturas abiertas por tienda: recorre los traslados con destino en la
-- tienda y el reparto de compras por `compra_item_destinos_ubicacion_idx`. Milisegundos.
--
-- CÓMO SE PEGA EN PRODUCCIÓN (con el OK de Felipe, ANTES de fusionar la web que la llama). Un solo `create or replace function` con
-- su `comment` y sus permisos: sin políticas ni `alter` de tablas (ADR-0195), en una sola parte, en el SQL Editor (ya trae
-- `retail.`). Se puede pegar dos veces. Después de pegar, solo lectura:
--   select md5(prosrc) from pg_proc where oid = 'retail.fn_analisis_por_llegar(uuid)'::regprocedure;
--     → `dad100ba80e9c00037b5251326237a0e` (el cuerpo de este archivo; medido en la base local con todas las migraciones).
--   select retail.fn_analisis_por_llegar((select id from retail.ubicaciones where tipo = 'tienda' order by nombre limit 1)) is null;
--     → `true` en el SQL Editor: ahí no hay sesión, y eso también es la prueba de la puerta.
--
-- SE ROMPE SI un traslado empieza a recibirse por partes dejando el estado en `en_transito` sin anotar `movimiento_id` en su
-- recepción (lo recibido seguiría «en camino»), o si Compras deja de repartir por tienda en `compra_item_destinos`. Prueba:
-- `scripts/pruebas/analisis_lecturas.mjs`.
-- SE DESHACE con: drop function retail.fn_analisis_por_llegar(uuid);
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- Guarda: lo que esta lectura asume tiene que estar en la base. Si falta, se detiene sin crear nada.
do $$
begin
  if to_regprocedure('retail.fn_tiene_acceso_retail()') is null or to_regprocedure('retail.fn_puede_analizar()') is null then
    raise exception 'Faltan las puertas retail.fn_tiene_acceso_retail() o retail.fn_puede_analizar(): pega antes 20260923130000_abrir_modulos_a_los_roles.sql.';
  end if;
  if to_regclass('retail.compra_item_reparto_resumen') is null then
    raise exception 'Falta la vista retail.compra_item_reparto_resumen: pega antes 20260919172000_reparto_compra_por_tienda.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'transferencias' and column_name = 'fecha_estimada_llegada')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'retail' and table_name = 'transferencia_recepciones' and column_name = 'movimiento_id') then
    raise exception 'Faltan los traslados en dos fases (transferencias.fecha_estimada_llegada, transferencia_recepciones.movimiento_id): pega antes 20260916150000_traslados_dos_fases.sql.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'retail' and table_name = 'compras' and column_name = 'fecha_estimada_llegada') then
    raise exception 'Falta retail.compras.fecha_estimada_llegada: pega antes 20260918130000_compras_atraso_recepcion.sql.';
  end if;
end $$;

create or replace function retail.fn_analisis_por_llegar(p_ubicacion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- El producto de la prenda centinela de las ventas «sin registrar» (ADR-0179): no es una prenda que llegue.
  c_producto_centinela constant uuid := '11111111-1111-4111-8111-111111111111';
begin
  if p_ubicacion_id is null then
    raise exception 'fn_analisis_por_llegar: falta la tienda' using errcode = '22004';
  end if;
  -- Las mismas dos puertas que fn_analisis_sede (decisión 8: sin pedir operar la sede). Sin cualquiera, NULL.
  if not retail.fn_tiene_acceso_retail() or not retail.fn_puede_analizar() then
    return null;
  end if;

  return (
    with traslados as (
      -- Lo que ya salió hacia esta tienda y todavía no se recibe: lo enviado menos lo que ya entró por su recepción.
      select ti.variante_id,
             case uo.tipo when 'taller' then 'taller' when 'almacen' then 'almacen' else 'tienda' end as de,
             ti.cantidad - coalesce((
               select sum(m.cantidad)
               from retail.transferencia_recepciones tr
               join retail.movimientos m on m.id = tr.movimiento_id
               where tr.transferencia_id = t.id
                 and tr.variante_id = ti.variante_id), 0) as cantidad,
             (t.fecha_estimada_llegada at time zone 'America/Lima')::date as fecha
      from retail.transferencias t
      join retail.transferencia_items ti on ti.transferencia_id = t.id
      join retail.ubicaciones uo on uo.id = t.ubicacion_origen_id
      where t.ubicacion_destino_id = p_ubicacion_id
        and t.estado = 'en_transito'
    ),
    compras as (
      -- Lo repartido a esta tienda en una factura vigente de mercadería que falta recibir, de una línea con su talla y color.
      select i.variante_id,
             'compra'::text as de,
             r.pendiente as cantidad,
             c.fecha_estimada_llegada as fecha
      from retail.compra_item_reparto_resumen r
      join retail.compra_items i on i.id = r.compra_item_id
      join retail.compras c on c.id = r.compra_id
      where r.ubicacion_id = p_ubicacion_id
        and r.pendiente > 0
        and c.estado = 'vigente'
        and c.naturaleza = 'mercaderia'
        and i.variante_id is not null
    ),
    partes as (
      -- Una parte por prenda, origen y fecha.
      select x.variante_id, x.de, x.fecha, sum(x.cantidad)::integer as cantidad
      from (select t.variante_id, t.de, t.cantidad, t.fecha from traslados t
            union all
            select c.variante_id, c.de, c.cantidad, c.fecha from compras c) x
      join retail.variantes va on va.id = x.variante_id
      join retail.productos pr on pr.id = va.producto_id
      where x.cantidad > 0
        and not pr.es_prueba
        and pr.id <> c_producto_centinela
      group by x.variante_id, x.de, x.fecha
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'variante_id', p.variante_id,
             'de', p.de,
             'cantidad', p.cantidad,
             'fecha', p.fecha)
           order by p.variante_id, p.fecha nulls last, p.de), '[]'::jsonb)
    from partes p
  );
end;
$$;

comment on function retail.fn_analisis_por_llegar(uuid) is
  'ADR-0357 (Análisis v4): lo que viene en camino a UNA tienda, por prenda, en un jsonb (arreglo de {variante_id, de, cantidad, '
  'fecha}): traslados en tránsito hacia ella (de = tipo del origen: taller, almacen o tienda; fecha = llegada estimada en día de '
  'Lima) y compras repartidas a ella que faltan recibir (de = compra; compra_item_reparto_resumen; fecha = llegada estimada de la '
  'factura). La producción del Taller cuenta solo cuando ya salió (es un traslado). Sin dinero. Puertas: fn_tiene_acceso_retail() '
  'y fn_puede_analizar(), sin pedir operar la sede (decisión 8). Sin ellas, NULL. Solo lectura.';

revoke all on function retail.fn_analisis_por_llegar(uuid) from public, anon;
grant execute on function retail.fn_analisis_por_llegar(uuid) to authenticated, service_role;

reset lock_timeout;
