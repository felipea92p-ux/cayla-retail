-- ============================================================================
-- scripts/purga/restaurar-purga.sql — ADR-0224
-- Deshace una purga hecha con `purgar-producto-de-prueba.sql`, o un «Eliminar con su historia» hecho por un Admin desde
-- Productos (ADR-0252, respaldo «eliminado CÓDIGO fecha»): devuelve, fila por fila, lo que quedó en `respaldo_purgas.filas`.
-- Solo se corre si Felipe se arrepiente.
--
-- CÓMO SE USA (antes del script, en la misma sesión; el nombre sale del resumen de la corrida real, «purga «…»»):
--     select set_config('cayla_purga.nombre', 'purga TOP-0011 2026-09-26 21:40', false);
--
-- QUÉ HACE, en una sola transacción:
--   · devuelve cada tabla del respaldo —el producto con sus variantes, códigos, etiquetas, fotos, temporadas por color y
--     stock; ventas, líneas, pagos y comprobantes; separaciones con sus líneas, pagos y apartados; compras con sus líneas,
--     reparto, reasignaciones, cierres, ingresos (lotes), envíos y costos; movimientos, líneas de conteo, bajadas al piso
--     (con su marca «La tengo en la mano», después de su corrección), marcas de reintento y pedidos no atendidos—, de padres a hijos, SIN sus columnas generadas (como
--     `venta_items.subtotal`, que la base recalcula sola: reinsertarla a mano falla). Si el respaldo trae una tabla que este
--     script no sabe devolver, no devuelve nada: una restauración a medias es peor que ninguna;
--   · a las otras prendas les quita lo que la purga les había devuelto (lo vendido), y ninguna serie de comprobantes
--     retrocede: vuelve al número que tenía solo si hoy va por detrás (si ya se emitió otro, sigue donde está);
--   · con `session_replication_role = replica` para que los disparadores no reescriban las filas al volver (por ejemplo,
--     no vuelven a firmar «propuesto por» ni a sellar la terminal): lo mismo que hace `pg_restore --disable-triggers`.
--     Por eso el orden de las tablas importa, porque las llaves foráneas tampoco se revisan durante la restauración;
--     al final se comprueba que el libro de movimientos cuadre con el stock en TODA la base (0 filas descuadradas);
--   · deja una línea en Actividad por cada documento y otra por el producto, que cuentan que se restauró. Las de la purga
--     se quedan: Actividad es inmutable.
--
-- NO devuelve los contadores de códigos (la purga tampoco los bajó) ni el respaldo mismo: `respaldo_purgas.filas`
-- se conserva (se borra a mano cuando ya no haga falta).
-- Las líneas «begin»/«commit» llevan la marca [[transaccion]]: la prueba las quita para envolver el script.
-- ============================================================================

begin; -- [[transaccion]]
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path to retail, public, extensions;

-- Padres antes que hijos: el orden en que se devuelven las tablas. Lo que no esté aquí (ni sea `stock_antes` o
-- `series_comprobantes`, que se aplican aparte) frena la restauración.
create function pg_temp.tablas_en_orden() returns text[] language sql immutable as $f$
  select array['productos', 'producto_origen', 'variantes', 'codigos_barras', 'variante_etiquetas', 'producto_fotos', 'producto_color_temporadas',
               'stock', 'compras', 'compra_items', 'compra_item_destinos', 'compra_reasignaciones', 'compra_item_cierres',
               'envios', 'lotes', 'ventas', 'venta_items', 'venta_pagos', 'separaciones', 'separacion_items', 'separacion_pagos',
               'comprobantes', 'comprobante_anticipos', 'movimientos', 'costo_historial', 'conteo_items', 'bajada_piso_items',
               'bajadas_en_mano', 'apartados', 'pedidos_no_atendidos', 'movimientos_internos_intentos', 'frescura_decisiones']
$f$;

do $$
declare v_txt text;
begin
  if coalesce(current_setting('cayla_purga.nombre', true), '') = '' then
    raise exception '[restaurar] Falta el parámetro cayla_purga.nombre (el nombre de la purga, tal como salió en su resumen). Ver el encabezado.';
  end if;
  if not exists (select 1 from respaldo_purgas.filas where purga = current_setting('cayla_purga.nombre')) then
    raise exception '[restaurar] No hay respaldo con el nombre «%»: revisa `select distinct purga from respaldo_purgas.filas`.', current_setting('cayla_purga.nombre');
  end if;
  select string_agg(distinct f.tabla, ', ') into v_txt from respaldo_purgas.filas f
   where f.purga = current_setting('cayla_purga.nombre')
     and f.tabla <> all (pg_temp.tablas_en_orden() || array['stock_antes', 'series_comprobantes']);
  if v_txt is not null then
    raise exception '[restaurar] El respaldo trae tablas que este script no sabe devolver (%): no se restaura nada.', v_txt;
  end if;
  -- La purga devolvió la serie de notas; si después se emitió una nota con ese número, ya es de otra venta.
  select string_agg(f.fila ->> 'serie' || '-' || (f.fila ->> 'numero'), ', ') into v_txt from respaldo_purgas.filas f
   where f.purga = current_setting('cayla_purga.nombre') and f.tabla = 'comprobantes'
     and exists (select 1 from retail.comprobantes c where c.tipo = f.fila ->> 'tipo' and c.serie = f.fila ->> 'serie'
                    and c.numero = (f.fila ->> 'numero')::int and c.id <> (f.fila ->> 'id')::uuid);
  if v_txt is not null then
    raise exception '[restaurar] Esos números ya los tiene otro comprobante (%): después de la purga la serie los volvió a usar. No se restaura nada.', v_txt;
  end if;
end $$;

create function pg_temp.libro_descuadra() returns bigint language sql as $f$
  with efecto as (
    select variante_id, ubicacion_id, sububicacion_id,
           case tipo when 'entrada' then cantidad when 'ajuste' then cantidad when 'salida' then -cantidad
                     when 'traslado' then -cantidad else 0 end as d
      from retail.movimientos
    union all
    select variante_id, ubicacion_destino_id, sububicacion_destino_id, cantidad from retail.movimientos where tipo = 'traslado'
  ), libro as (
    select variante_id, ubicacion_id, sububicacion_id, sum(d) as esperado from efecto group by 1, 2, 3
  )
  select count(*) filter (where coalesce(l.esperado, 0) <> coalesce(s.cantidad, 0))
    from libro l full join retail.stock s
      on s.variante_id = l.variante_id and s.ubicacion_id = l.ubicacion_id and s.sububicacion_id is not distinct from l.sububicacion_id
$f$;

-- Sin disparadores (ni revisión de llaves) mientras se devuelven las filas; se vuelve a `origin` antes de terminar.
set local session_replication_role = replica;

do $$
declare
  r record; v_cols text; v_nombre text := current_setting('cayla_purga.nombre'); v_producto text;
begin
  -- Padres antes que hijos. Cada tabla se devuelve con TODAS sus columnas menos las generadas.
  for r in select t as tabla from unnest(pg_temp.tablas_en_orden()) with ordinality as x(t, n) order by n
  loop
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_cols
      from information_schema.columns c
     where c.table_schema = 'retail' and c.table_name = r.tabla and c.is_generated = 'NEVER';
    execute format(
      'insert into retail.%I (%s) select %s from jsonb_populate_recordset(null::retail.%I, (select coalesce(jsonb_agg(fila), ''[]''::jsonb) from respaldo_purgas.filas where purga = %L and tabla = %L))',
      r.tabla, v_cols, v_cols, r.tabla, v_nombre, r.tabla);
  end loop;

  -- El stock de las otras prendas: se les quita lo que la purga les devolvió (lo vendido). Restar y no copiar el número de
  -- antes: si después de la purga esa prenda se movió, su movimiento sigue contando.
  update retail.stock s set cantidad = s.cantidad - (f.fila ->> 'q')::int, updated_at = now()
    from respaldo_purgas.filas f
   where f.purga = v_nombre and f.tabla = 'stock_antes'
     and s.variante_id = (f.fila ->> 'variante_id')::uuid and s.ubicacion_id = (f.fila ->> 'ubicacion_id')::uuid
     and s.sububicacion_id is not distinct from nullif(f.fila ->> 'sububicacion_id', '')::uuid;

  -- La serie de comprobantes vuelve al número que tenía, pero nunca hacia atrás: si después de la purga ya se emitió otro
  -- comprobante, el contador sigue donde está (volver atrás repetiría un número).
  update retail.series_comprobantes s set siguiente_numero = greatest(s.siguiente_numero, (f.fila ->> 'siguiente_numero')::int)
    from respaldo_purgas.filas f
   where f.purga = v_nombre and f.tabla = 'series_comprobantes' and s.id = (f.fila ->> 'id')::uuid;

  -- Una línea en Actividad por documento y otra por el producto: las de la purga se quedan (inmutables) y estas cuentan
  -- que se deshizo.
  select f.fila ->> 'codigo' into v_producto from respaldo_purgas.filas f where f.purga = v_nombre and f.tabla = 'productos' limit 1;
  insert into retail.actividad (ocurrio_at, modulo, accion, descripcion, ubicacion_id, tabla, registro_id, detalle, origen)
    select now(), case x.tabla when 'ventas' then 'vender' when 'separaciones' then 'apartados' when 'compras' then 'facturas_compra' else 'productos' end,
           'purga_restaurada',
           'se restauró lo que se había purgado del producto ' || coalesce(v_producto, '?') || ' (' || v_nombre || ')',
           x.ubicacion_id, x.tabla, x.registro_id, jsonb_build_object('purga', v_nombre), 'vivo'
      from (select case when f.tabla in ('ventas', 'separaciones') then nullif(f.fila ->> 'ubicacion_id', '')::uuid end as ubicacion_id,
                   f.tabla, f.fila ->> 'id' as registro_id
              from respaldo_purgas.filas f
             where f.purga = v_nombre and f.tabla in ('ventas', 'separaciones', 'compras', 'productos')) x;
end $$;

set local session_replication_role = origin;

-- El libro tiene que cuadrar con el stock en toda la base; si no, todo se deshace.
do $$
declare v_libro bigint := pg_temp.libro_descuadra();
begin
  if v_libro <> 0 then
    raise exception '[restaurar] Después de restaurar, % fila(s) de stock no cuadran con los movimientos: no se guarda nada.', v_libro;
  end if;
  raise notice '[restaurar] HECHO — el libro de movimientos cuadra con el stock (0 filas descuadradas).';
end $$;

commit; -- [[transaccion]]
