-- ============================================================================
-- scripts/purga/purgar-producto-de-prueba.sql — ADR-0224
-- Deshace POR COMPLETO un producto de prueba y las ventas de prueba que lo tocaron. Se corre a mano, una vez por caso,
-- nunca desde la web: borra historia que el sistema declara inmutable (`movimientos`), y esa promesa solo se rompe
-- con una persona presente, un ensayo a la vista y un respaldo.
--
-- QUÉ HACE, en una sola transacción (todo o nada):
--   1. Comprueba que lo que va a borrar es EXACTAMENTE lo que Felipe dijo que era de prueba, y que nadie más lo cita.
--      Si algo no cuadra (una devolución sobre la venta, un comprobante ya transmitido a SUNAT, el producto en otra
--      venta, un traslado, una compra, un conteo…), aborta y dice qué: no se borra nada y se resuelve a mano.
--   2. Respalda cada fila que va a tocar, tal cual, en `respaldo_purgas.filas` (jsonb): es lo que permite volver atrás.
--   3. Devuelve a stock las prendas de OTROS productos que esas ventas sacaron (la venta «nunca ocurrió»).
--   4. Borra de hijos a padres: movimientos, comprobante, pagos, líneas, venta, y el producto con lo que nació con él
--      (stock, códigos de barras, etiquetas, fotos, variantes). El candado de historial de `movimientos` se apaga SOLO
--      dentro de esta transacción y se vuelve a encender en ALWAYS (D-22): si algo falla, vuelve a quedar como estaba.
--   5. Devuelve la serie del comprobante (NV01-000007 → el siguiente vuelve a ser el 7) SOLO si esa nota era la última:
--      una serie numerada no debe quedar con un hueco por una prueba. El contador de códigos de producto (TOP-0011) NO se
--      devuelve a propósito: un código que existió no se reutiliza (una etiqueta o un mensaje viejo no puede apuntar a
--      otra prenda).
--   6. Deja UNA línea en Actividad (el registro es inmutable: la línea de la venta se queda, y esta explica qué le pasó).
--   7. Demuestra el resultado antes de cerrar: nada de lo borrado sigue vivo; el libro de movimientos vuelve a cuadrar
--      con el stock en TODA la base (0 filas descuadradas antes y 0 después); el stock devuelto es exacto; los candados
--      están en ALWAYS.
--
-- CÓMO SE USA (los dos parámetros son obligatorios; van ANTES del script, en la misma sesión):
--     select set_config('cayla_purga.producto', 'TOP-0011', false);                               -- código del producto
--     select set_config('cayla_purga.ventas',   '269a926c-4091-4f84-9cde-04a4c60e953e', false);   -- ids, coma; '-' si no hay
--   ENSAYO (lo que corre si no se dice otra cosa): termina con una EXCEPCIÓN que trae el resumen. Nada queda escrito.
--   CORRIDA REAL: además   select set_config('cayla_purga.modo', 'definitivo', false);   y solo con el «dale» de Felipe.
--   Bloquea `movimientos` unos segundos (apagar un disparador toma el candado de la tabla): con `lock_timeout` de 5 s,
--   si la tienda está vendiendo en ese instante aborta sin dañar nada — se reintenta.
--
-- CÓMO SE VUELVE ATRÁS (si Felipe se arrepiente): `scripts/purga/restaurar-purga.sql`, con el nombre de la purga que trae
-- el resumen. Devuelve cada fila respaldada de padres a hijos —sin las columnas generadas, como `venta_items.subtotal`, que
-- reinsertadas a mano fallan—, el stock de las otras prendas a como estaba y la serie con su número, y comprueba que el
-- libro cuadre en TODA la base. `pruebas/purgar_producto_de_prueba.mjs` lo hace y compara fila por fila.
--
-- LO QUE NO TOCA: `actividad` (inmutable), `historial_producto_cambios` (inmutable, sin llave: si el producto se editó
-- antes, esas filas quedan inertes y este script lo dice), los archivos de fotos en Storage, ni ninguna otra venta.
-- Las líneas «begin»/«commit» llevan la marca [[transaccion]]: la prueba las quita para envolver el script en su propia
-- transacción; el resto es idéntico.
-- ============================================================================

begin; -- [[transaccion]]
set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path to retail, public, extensions;

-- ---- 0. Parámetros ----
do $$
begin
  if coalesce(current_setting('cayla_purga.producto', true), '') = '' or coalesce(current_setting('cayla_purga.ventas', true), '') = '' then
    raise exception '[purga] Faltan parámetros: cayla_purga.producto (código del producto, ej. TOP-0011) y cayla_purga.ventas (ids de venta separados por coma; ''-'' si no hay ventas). Ver el encabezado.';
  end if;
end $$;

-- ---- 1. Alcance: todo lo que se va a borrar, calculado UNA vez ----
create temp table zz_prod on commit drop as
  select id, codigo, referencia from productos where codigo = current_setting('cayla_purga.producto');
create temp table zz_var on commit drop as
  select id, codigo from variantes where producto_id in (select id from zz_prod);
create temp table zz_venta on commit drop as
  select id, ubicacion_id from ventas
   where id = any (case when current_setting('cayla_purga.ventas') = '-' then '{}'::uuid[]
                        else string_to_array(current_setting('cayla_purga.ventas'), ',')::uuid[] end);
create temp table zz_item on commit drop as
  select id, venta_id, variante_id, cantidad from venta_items where venta_id in (select id from zz_venta);
create temp table zz_comp on commit drop as
  select id, tipo, serie, numero from comprobantes where venta_id in (select id from zz_venta);
create temp table zz_pago on commit drop as
  select id from venta_pagos where venta_id in (select id from zz_venta);
create temp table zz_mov on commit drop as
  select * from movimientos where variante_id in (select id from zz_var) or venta_item_id in (select id from zz_item);

-- El libro de movimientos contra el stock, en toda la base: cuántas filas de stock no coinciden con lo que dicen los
-- movimientos (entrada +, salida −, ajuste ±, traslado −origen +destino; apartar y liberar no mueven `cantidad`). Es la
-- prueba de que la purga no dejó nada a medias. Verificado en producción el 2026-09-26: 79 filas, 0 descuadres.
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

-- ---- 2. Candado: solo se borra lo que es de prueba y solo lo que este script entiende ----
do $$
declare
  r record; v_n bigint; v_pedidas int; v_malas text := ''; v_patron text;
  -- Lo que este script borra o restaura en el mismo acto, y lo inerte (sin llave) que solo se reporta.
  v_conocidas text[] := array['movimientos', 'venta_items', 'venta_pagos', 'comprobantes', 'ventas', 'productos', 'variantes',
                              'stock', 'codigos_barras', 'variante_etiquetas', 'producto_fotos', 'actividad',
                              'historial_producto_cambios'];
begin
  if (select count(*) from zz_prod) <> 1 then
    raise exception '[purga] No encuentro exactamente un producto con código «%».', current_setting('cayla_purga.producto');
  end if;
  v_pedidas := case when current_setting('cayla_purga.ventas') = '-' then 0
                    else cardinality(string_to_array(current_setting('cayla_purga.ventas'), ',')) end;
  if (select count(*) from zz_venta) <> v_pedidas then
    raise exception '[purga] Pedí % venta(s) y encontré %. Revisa los ids.', v_pedidas, (select count(*) from zz_venta);
  end if;

  -- El libro tiene que cuadrar ANTES: si ya no cuadraba, esta purga ni lo empeora ni lo arregla.
  if pg_temp.libro_descuadra() > 0 then
    v_malas := v_malas || format(E'\n  · el stock ya NO cuadraba con los movimientos antes de empezar (%s filas): eso se arregla primero', pg_temp.libro_descuadra());
  end if;

  -- (a) Comprobantes: solo notas internas. Un comprobante con validez ante SUNAT (boleta, factura, nota de crédito), o que
  -- llegó a transmitirse, no se borra jamás con un script.
  select count(*) into v_n from comprobantes c join zz_comp z on z.id = c.id
   where c.tipo <> 'nota_venta' or c.estado <> 'interna' or c.enviado_at is not null or c.respuesta_sunat is not null;
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s comprobante(s) de esas ventas no son notas internas sin transmitir (tienen validez ante SUNAT o ya se enviaron)', v_n); end if;

  -- (b) Quién más cita al producto o a sus variantes, además de lo que este script entiende (tablas derivadas + movimientos + líneas de venta).
  for r in
    select cl.relname as tabla, a.attname as col, (c.confrelid = 'retail.productos'::regclass) as por_producto
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and n.nspname = 'retail' and array_length(c.conkey, 1) = 1
       and c.confrelid in ('retail.productos'::regclass, 'retail.variantes'::regclass)
       and cl.relname <> all (array['variantes', 'stock', 'codigos_barras', 'variante_etiquetas', 'producto_fotos', 'movimientos', 'venta_items'])
  loop
    execute format('select count(*) from retail.%I where %I in (select id from %s)', r.tabla, r.col,
                   case when r.por_producto then 'zz_prod' else 'zz_var' end) into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de %s citan al producto o a sus variantes (compra, producción, traslado, apartado, conteo, cambio…)', v_n, r.tabla); end if;
  end loop;

  -- (c) El producto solo puede estar en las ventas pedidas, y solo con movimientos que el script sabe deshacer.
  select count(*) into v_n from venta_items where variante_id in (select id from zz_var) and venta_id not in (select id from zz_venta);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · el producto aparece en %s línea(s) de venta de OTRAS ventas que no pediste borrar', v_n); end if;

  select count(*) into v_n from zz_mov m
   where m.variante_id in (select id from zz_var) and m.venta_item_id is not null and m.venta_item_id not in (select id from zz_item);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s movimiento(s) del producto salen de una venta que no pediste borrar', v_n); end if;

  -- Los movimientos del producto sin venta tienen que ser ajustes «puros» (la reposición que cargó el stock); un traslado,
  -- una compra, un conteo o una devolución son historia con otros dueños y se resuelven a mano.
  select count(*) into v_n from zz_mov m
   where m.variante_id in (select id from zz_var) and m.venta_item_id is null
     and not (m.tipo = 'ajuste' and m.lote_id is null and m.cambio_id is null and m.produccion_id is null
              and m.compra_item_id is null and m.conteo_item_id is null and m.devolucion_item_id is null
              and m.transferencia_item_id is null and m.transferencia_recepcion_id is null and m.ubicacion_destino_id is null);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s movimiento(s) del producto no son ajustes simples (traslado, compra, conteo, devolución, apartado…)', v_n); end if;

  -- (d) Las prendas de otros productos que esas ventas sacaron: cada línea tiene que ser una salida por venta de la
  -- misma cantidad, para poder devolverla sin adivinar.
  select count(*) into v_n from zz_mov m join zz_item i on i.id = m.venta_item_id
   where m.variante_id not in (select id from zz_var)
     and not (m.tipo = 'salida' and m.variante_id = i.variante_id and m.cantidad = i.cantidad and m.ubicacion_destino_id is null);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s movimiento(s) de otras prendas de esas ventas no son una salida simple de la cantidad vendida', v_n); end if;

  select count(*) into v_n from (
    select m.variante_id, m.ubicacion_id, m.sububicacion_id from zz_mov m
     where m.venta_item_id is not null and m.variante_id not in (select id from zz_var) group by 1, 2, 3) g
   where not exists (select 1 from stock s where s.variante_id = g.variante_id and s.ubicacion_id = g.ubicacion_id
                       and s.sububicacion_id is not distinct from g.sububicacion_id);
  if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de stock donde hay que devolver prendas ya no existen', v_n); end if;

  -- (e) Quién más cita a las ventas, sus líneas, pagos, comprobantes o movimientos (devoluciones, proformas, separaciones,
  -- anulaciones, cambios, apartados, prendas por regularizar, conteos, costos…). Se excluyen las propias filas del script.
  for r in
    select cl.relname as tabla, a.attname as col, rf.relname as destino
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
      join pg_class rf on rf.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and n.nspname = 'retail' and array_length(c.conkey, 1) = 1
       and rf.relname in ('ventas', 'venta_items', 'comprobantes', 'venta_pagos', 'movimientos')
  loop
    execute format('select count(*) from retail.%I o where o.%I in (select id from %s)%s', r.tabla, r.col,
      case r.destino when 'ventas' then 'zz_venta' when 'venta_items' then 'zz_item' when 'comprobantes' then 'zz_comp'
                     when 'venta_pagos' then 'zz_pago' else 'zz_mov' end,
      case r.tabla when 'comprobantes' then ' and o.id not in (select id from zz_comp)'
                   when 'venta_items' then ' and o.id not in (select id from zz_item)'
                   when 'venta_pagos' then ' and o.id not in (select id from zz_pago)'
                   when 'movimientos' then ' and o.id not in (select id from zz_mov)'
                   else '' end) into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de %s citan a %s que se borrarían', v_n, r.tabla, r.destino); end if;
  end loop;

  -- (f) Menciones SIN llave foránea (una cola sin conexión, un registro suelto): la base no las frenaría, así que se
  -- buscan por id en el resto de las tablas. `actividad` e `historial_producto_cambios` son inmutables e inertes: se avisan.
  select string_agg(id::text, '|') into v_patron from (
    select id from zz_prod union all select id from zz_var union all select id from zz_venta union all select id from zz_item
    union all select id from zz_comp union all select id from zz_pago union all select id from zz_mov) x;
  for r in
    select cl.relname as tabla from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'retail' and cl.relkind = 'r' and cl.relname <> all (v_conocidas)
  loop
    execute format('select count(*) from retail.%I t where to_jsonb(t)::text ~ %L', r.tabla, v_patron) into v_n;
    if v_n > 0 then v_malas := v_malas || format(E'\n  · %s fila(s) de %s mencionan esos ids sin llave foránea: decide a mano qué hacer con ellas', v_n, r.tabla); end if;
  end loop;
  execute format('select count(*) from retail.historial_producto_cambios where entidad_id::text ~ %L', v_patron) into v_n;
  if v_n > 0 then raise notice '[purga] AVISO: % fila(s) de historial_producto_cambios quedarán apuntando a un producto que ya no existe (es inmutable e inerte).', v_n; end if;

  if v_malas <> '' then
    raise exception E'[purga] NO SE BORRA NADA. Lo que impide la purga (resuélvelo primero):%', v_malas;
  end if;
end $$;

-- ---- 3. Respaldo: cada fila, tal cual, antes de tocarla ----
create schema if not exists respaldo_purgas;
create table if not exists respaldo_purgas.filas (
  id bigserial primary key,
  purga text not null,
  tabla text not null,
  fila jsonb not null,
  respaldado_at timestamptz not null default now()
);
alter table respaldo_purgas.filas enable row level security;   -- sin políticas: nadie la lee por la API
revoke all on schema respaldo_purgas from public, anon, authenticated;
revoke all on respaldo_purgas.filas from public, anon, authenticated;
revoke all on sequence respaldo_purgas.filas_id_seq from public, anon, authenticated;

create temp table zz_purga on commit drop as
  select 'purga ' || (select codigo from zz_prod) || ' ' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') as nombre;

-- El stock de las OTRAS prendas que hay que devolver, con su cantidad de antes (para comprobar y para volver atrás).
create temp table zz_restaura on commit drop as
  select m.variante_id, m.ubicacion_id, m.sububicacion_id, sum(m.cantidad)::int as q,
         (select s.cantidad from stock s where s.variante_id = m.variante_id and s.ubicacion_id = m.ubicacion_id
             and s.sububicacion_id is not distinct from m.sububicacion_id) as antes,
         (select s.cantidad_apartada from stock s where s.variante_id = m.variante_id and s.ubicacion_id = m.ubicacion_id
             and s.sububicacion_id is not distinct from m.sububicacion_id) as apartada_antes
    from zz_mov m where m.venta_item_id is not null and m.variante_id not in (select id from zz_var)
   group by m.variante_id, m.ubicacion_id, m.sububicacion_id;

insert into respaldo_purgas.filas (purga, tabla, fila)
  select (select nombre from zz_purga), 'productos', to_jsonb(t) from productos t where id in (select id from zz_prod)
  union all select (select nombre from zz_purga), 'variantes', to_jsonb(t) from variantes t where id in (select id from zz_var)
  union all select (select nombre from zz_purga), 'codigos_barras', to_jsonb(t) from codigos_barras t where variante_id in (select id from zz_var)
  union all select (select nombre from zz_purga), 'variante_etiquetas', to_jsonb(t) from variante_etiquetas t where variante_id in (select id from zz_var)
  union all select (select nombre from zz_purga), 'producto_fotos', to_jsonb(t) from producto_fotos t where producto_id in (select id from zz_prod)
  union all select (select nombre from zz_purga), 'stock', to_jsonb(t) from stock t where variante_id in (select id from zz_var)
  union all select (select nombre from zz_purga), 'stock_antes', to_jsonb(t) from zz_restaura t
  union all select (select nombre from zz_purga), 'movimientos', to_jsonb(t) from zz_mov t
  union all select (select nombre from zz_purga), 'ventas', to_jsonb(t) from ventas t where id in (select id from zz_venta)
  union all select (select nombre from zz_purga), 'venta_items', to_jsonb(t) from venta_items t where id in (select id from zz_item)
  union all select (select nombre from zz_purga), 'venta_pagos', to_jsonb(t) from venta_pagos t where id in (select id from zz_pago)
  union all select (select nombre from zz_purga), 'comprobantes', to_jsonb(t) from comprobantes t where id in (select id from zz_comp)
  union all select (select nombre from zz_purga), 'series_comprobantes', to_jsonb(s) from series_comprobantes s
             where (s.tipo, s.serie) in (select tipo, serie from zz_comp);

-- ---- 4. Borrado, de hijos a padres ----
-- Apaga SOLO el candado de historial de `movimientos`, dentro de esta transacción (DDL transaccional: si algo falla, vuelve).
alter table movimientos disable trigger movimientos_inmutables;

-- 4a. La venta nunca ocurrió: lo que sacó de otras prendas vuelve a su fila de stock (la misma sububicación de la salida).
update stock s set cantidad = s.cantidad + r.q, updated_at = now()
  from zz_restaura r
 where s.variante_id = r.variante_id and s.ubicacion_id = r.ubicacion_id and s.sububicacion_id is not distinct from r.sububicacion_id;

-- 4b. El resto, de hijos a padres.
delete from movimientos where id in (select id from zz_mov);
delete from comprobantes where id in (select id from zz_comp);
delete from venta_pagos where id in (select id from zz_pago);
delete from venta_items where id in (select id from zz_item);
delete from ventas where id in (select id from zz_venta);
delete from stock where variante_id in (select id from zz_var);
delete from codigos_barras where variante_id in (select id from zz_var);
delete from variante_etiquetas where variante_id in (select id from zz_var);
delete from producto_fotos where producto_id in (select id from zz_prod);
delete from variantes where id in (select id from zz_var);
delete from productos where id in (select id from zz_prod);

-- ALWAYS, no `enable trigger` a secas: ese lo deja en modo normal y el candado deja de valer en modo réplica (D-22).
alter table movimientos enable always trigger movimientos_inmutables;

-- 4c. La serie de comprobantes vuelve a su número SOLO si lo borrado era el final de la serie (nada quedó con número ≥).
update series_comprobantes s set siguiente_numero = z.minimo
  from (select tipo, serie, min(numero) as minimo from zz_comp group by 1, 2) z
 where s.tipo = z.tipo and s.serie = z.serie and s.siguiente_numero > z.minimo
   and not exists (select 1 from comprobantes c where c.tipo = z.tipo and c.serie = z.serie and c.numero >= z.minimo);

-- 4d. Una línea en Actividad: el registro es inmutable, así que la de la venta se queda y esta cuenta qué le pasó.
insert into actividad (ocurrio_at, modulo, accion, descripcion, ubicacion_id, tabla, registro_id, detalle, origen)
  select now(), 'vender', 'prueba_deshecha',
         'se deshizo la venta de prueba ' || coalesce((select string_agg(serie || '-' || lpad(numero::text, 6, '0'), ', ') from zz_comp), 'sin comprobante')
           || ' y se eliminó el producto de prueba ' || (select codigo from zz_prod) || ' (' || (select referencia from zz_prod) || ')',
         x.ubicacion_id, x.tabla, x.registro_id,
         jsonb_build_object('purga', (select nombre from zz_purga), 'producto', (select codigo from zz_prod)), 'vivo'
    from (select ubicacion_id, 'ventas' as tabla, id::text as registro_id from zz_venta
          union all
          select null::uuid, 'productos', id::text from zz_prod where not exists (select 1 from zz_venta)) x;

-- ---- 5. Demostración: si algo de esto falla, la transacción entera se deshace ----
create temp table zz_resumen on commit drop as
  select 1 as orden, 'productos' as concepto, 1::bigint as n
  union all select 2, 'variantes', (select count(*) from zz_var)
  union all select 3, 'movimientos', (select count(*) from zz_mov)
  union all select 4, 'ventas', (select count(*) from zz_venta)
  union all select 5, 'líneas de venta', (select count(*) from zz_item)
  union all select 6, 'pagos', (select count(*) from zz_pago)
  union all select 7, 'comprobantes', (select count(*) from zz_comp)
  union all select 8, 'prendas devueltas a stock (en ' || (select count(*) from zz_restaura) || ' filas)', (select coalesce(sum(q), 0) from zz_restaura);

do $$
declare v_n bigint; v_resumen text; v_libro bigint;
begin
  -- 5a. Nada de lo borrado sigue vivo.
  select (select count(*) from productos where id in (select id from zz_prod))
       + (select count(*) from variantes where id in (select id from zz_var))
       + (select count(*) from movimientos where id in (select id from zz_mov))
       + (select count(*) from ventas where id in (select id from zz_venta))
       + (select count(*) from venta_items where id in (select id from zz_item))
       + (select count(*) from venta_pagos where id in (select id from zz_pago))
       + (select count(*) from comprobantes where id in (select id from zz_comp))
       + (select count(*) from stock where variante_id in (select id from zz_var))
       + (select count(*) from codigos_barras where variante_id in (select id from zz_var)) into v_n;
  if v_n > 0 then raise exception '[purga] Quedaron % filas que debían haberse borrado', v_n; end if;

  -- 5b. El stock devuelto es exacto (antes + lo vendido) y lo apartado no se movió.
  select count(*) into v_n from zz_restaura r join stock s
    on s.variante_id = r.variante_id and s.ubicacion_id = r.ubicacion_id and s.sububicacion_id is not distinct from r.sububicacion_id
   where s.cantidad <> r.antes + r.q or s.cantidad_apartada is distinct from r.apartada_antes;
  if v_n > 0 then raise exception '[purga] El stock devuelto no coincide en % fila(s)', v_n; end if;

  -- 5c. El libro vuelve a cuadrar con el stock en TODA la base.
  v_libro := pg_temp.libro_descuadra();
  if v_libro <> 0 then raise exception '[purga] Después de purgar, % fila(s) de stock no cuadran con los movimientos', v_libro; end if;

  -- 5d. Los dos candados de movimientos quedaron en ALWAYS.
  select count(*) into v_n from pg_trigger
   where tgrelid = 'retail.movimientos'::regclass and tgname in ('movimientos_inmutables', 'movimientos_sin_truncate') and tgenabled <> 'A';
  if v_n > 0 then raise exception '[purga] % candado(s) de movimientos no quedaron en ALWAYS', v_n; end if;

  select string_agg(concepto || ' ' || n, ' · ' order by orden) into v_resumen from zz_resumen;
  v_resumen := v_resumen || E'\nlibro de movimientos vs stock: 0 filas descuadradas antes y 0 después'
    || E'\nrespaldo: respaldo_purgas.filas, purga «' || (select nombre from zz_purga) || '» (' ||
       (select count(*) from respaldo_purgas.filas where purga = (select nombre from zz_purga)) || ' filas)';

  -- Sin «definitivo», esto es un ENSAYO: la excepción deshace todo, incluido el respaldo, y trae el resumen.
  if coalesce(current_setting('cayla_purga.modo', true), 'ensayo') <> 'definitivo' then
    raise exception E'[purga] ENSAYO OK — no quedó nada escrito. Para la corrida real: cayla_purga.modo = definitivo.\n%', v_resumen;
  end if;
  raise notice E'[purga] HECHO.\n%', v_resumen;
end $$;

commit; -- [[transaccion]]

-- [[resumen-final]]
-- Solo llega aquí en la corrida real: lo que quedó respaldado, por tabla.
select tabla, count(*) as filas_respaldadas
  from respaldo_purgas.filas
 where purga like 'purga ' || current_setting('cayla_purga.producto') || ' %'
 group by tabla order by tabla;
