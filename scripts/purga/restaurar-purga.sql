-- ============================================================================
-- scripts/purga/restaurar-purga.sql — ADR-0224
-- Deshace una purga hecha con `purgar-producto-de-prueba.sql`: devuelve, fila por fila, lo que quedó en
-- `respaldo_purgas.filas`. Solo se corre si Felipe se arrepiente.
--
-- CÓMO SE USA (antes del script, en la misma sesión; el nombre sale del resumen de la corrida real, «purga «…»»):
--     select set_config('cayla_purga.nombre', 'purga TOP-0011 2026-09-26 21:40', false);
--
-- QUÉ HACE, en una sola transacción:
--   · devuelve productos, variantes, códigos de barras, etiquetas, fotos, stock del producto, ventas, líneas, movimientos,
--     pagos y comprobantes, de padres a hijos, SIN sus columnas generadas (como `venta_items.subtotal`, que la base
--     recalcula sola: reinsertarla a mano falla);
--   · deja el stock de las otras prendas como estaba ANTES de que la purga les devolviera lo vendido, y la serie de
--     comprobantes con su número anterior;
--   · con `session_replication_role = replica` para que los disparadores no reescriban las filas al volver (por ejemplo,
--     no vuelven a firmar «propuesto por» ni a sellar la terminal): lo mismo que hace `pg_restore --disable-triggers`.
--     Por eso el orden de las tablas importa, porque las llaves foráneas tampoco se revisan durante la restauración;
--     al final se comprueba que el libro de movimientos cuadre con el stock en TODA la base (0 filas descuadradas);
--   · deja UNA línea en Actividad que cuenta que se restauró. La línea de la purga se queda: Actividad es inmutable.
--
-- NO devuelve el contador de códigos de producto (la purga tampoco lo bajó) ni el respaldo mismo: `respaldo_purgas.filas`
-- se conserva (una restauración a medias se puede repetir; se borra a mano cuando ya no haga falta).
-- Las líneas «begin»/«commit» llevan la marca [[transaccion]]: la prueba las quita para envolver el script.
-- ============================================================================

begin; -- [[transaccion]]
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path to retail, public, extensions;

do $$
begin
  if coalesce(current_setting('cayla_purga.nombre', true), '') = '' then
    raise exception '[restaurar] Falta el parámetro cayla_purga.nombre (el nombre de la purga, tal como salió en su resumen). Ver el encabezado.';
  end if;
  if not exists (select 1 from respaldo_purgas.filas where purga = current_setting('cayla_purga.nombre')) then
    raise exception '[restaurar] No hay respaldo con el nombre «%»: revisa `select distinct purga from respaldo_purgas.filas`.', current_setting('cayla_purga.nombre');
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
  for r in select t as tabla from unnest(array['productos', 'variantes', 'codigos_barras', 'variante_etiquetas', 'producto_fotos',
                                                'stock', 'ventas', 'venta_items', 'movimientos', 'venta_pagos', 'comprobantes']) t
  loop
    select string_agg(format('%I', c.column_name), ', ' order by c.ordinal_position) into v_cols
      from information_schema.columns c
     where c.table_schema = 'retail' and c.table_name = r.tabla and c.is_generated = 'NEVER';
    execute format(
      'insert into retail.%I (%s) select %s from jsonb_populate_recordset(null::retail.%I, (select coalesce(jsonb_agg(fila), ''[]''::jsonb) from respaldo_purgas.filas where purga = %L and tabla = %L))',
      r.tabla, v_cols, v_cols, r.tabla, v_nombre, r.tabla);
  end loop;

  -- El stock de las otras prendas: lo que tenían ANTES de que la purga les devolviera lo vendido.
  update retail.stock s set cantidad = (f.fila ->> 'antes')::int, updated_at = now()
    from respaldo_purgas.filas f
   where f.purga = v_nombre and f.tabla = 'stock_antes'
     and s.variante_id = (f.fila ->> 'variante_id')::uuid and s.ubicacion_id = (f.fila ->> 'ubicacion_id')::uuid
     and s.sububicacion_id is not distinct from nullif(f.fila ->> 'sububicacion_id', '')::uuid;

  -- La serie de comprobantes con el número que tenía.
  update retail.series_comprobantes s set siguiente_numero = (f.fila ->> 'siguiente_numero')::int
    from respaldo_purgas.filas f
   where f.purga = v_nombre and f.tabla = 'series_comprobantes' and s.tipo = f.fila ->> 'tipo' and s.serie = f.fila ->> 'serie';

  -- Una línea en Actividad: la de la purga se queda (inmutable) y esta cuenta que se deshizo.
  select f.fila ->> 'codigo' into v_producto from respaldo_purgas.filas f where f.purga = v_nombre and f.tabla = 'productos' limit 1;
  insert into retail.actividad (ocurrio_at, modulo, accion, descripcion, ubicacion_id, tabla, registro_id, detalle, origen)
    select now(), 'vender', 'purga_restaurada',
           'se restauró lo que se había purgado del producto ' || coalesce(v_producto, '?') || ' (' || v_nombre || ')',
           x.ubicacion_id, x.tabla, x.registro_id, jsonb_build_object('purga', v_nombre), 'vivo'
      from (select nullif(f.fila ->> 'ubicacion_id', '')::uuid as ubicacion_id, 'ventas' as tabla, f.fila ->> 'id' as registro_id
              from respaldo_purgas.filas f where f.purga = v_nombre and f.tabla = 'ventas'
            union all
            select null::uuid, 'productos', f.fila ->> 'id'
              from respaldo_purgas.filas f where f.purga = v_nombre and f.tabla = 'productos'
               and not exists (select 1 from respaldo_purgas.filas g where g.purga = v_nombre and g.tabla = 'ventas')) x;
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
