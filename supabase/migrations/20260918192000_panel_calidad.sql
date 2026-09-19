-- ============================================================================
-- 20260918192000_panel_calidad.sql — CAYLA V2 · Gestión comercial: calidad (ADR-0113)
--
-- ESTADO: escrita y probada contra un Postgres desechable (scripts/pruebas/panel_calidad_aislado.sql).
--   NO en producción — la pega Felipe en el SQL Editor. Ya va calificada con `retail.`: se pega tal cual.
--   Solo LECTURA: no crea tablas, no toca filas, no cambia ninguna RPC de post-venta. Se deshace con dos
--   `drop function`.
--
-- PARA QUÉ. `/comercial/calidad` responde "¿qué talla, qué proveedor o qué producto genera devoluciones?".
-- Estas dos funciones son la ÚNICA casa de esas cuentas.
--   fn_calidad(p_dia, p_dias, p_plazo_dias) → tasa de devolución, prendas dañadas y cambios, agrupados por
--       producto, por talla, por origen (proveedor o Taller) y por categoría, más un total. Una sola pasada
--       (GROUPING SETS): las cuatro vistas suman exactamente lo mismo, porque salen de las mismas filas.
--   fn_calidad_danadas(p_dia, p_meses)     → prendas que volvieron dañadas, por tienda y por mes.
--   Ambas ASUMEN que quien llama es líder y NO modifican datos.
--
-- LA DECISIÓN QUE MÁS IMPORTA: LA COHORTE MADURA.
-- Tasa de devolución = unidades devueltas ÷ unidades vendidas. Pero una prenda vendida hace 3 días todavía
-- no tuvo tiempo de ser devuelta (el plazo de cambio es de 15 días, ver `DIAS_PLAZO_CAMBIO`): contarla como
-- "vendida y no devuelta" bajaría la tasa de los últimos días de forma falsa, y el mes en curso siempre
-- parecería el mejor. Por eso solo se cuentan ventas que YA cumplieron todo su plazo:
--     ventas entre (hoy − plazo − p_dias) y (hoy − plazo), sin incluir este último día.
-- Las devoluciones se cuentan sin importar cuándo se aprobaron: son las devoluciones DE esas ventas.
-- El precio: la pantalla no ve las últimas dos semanas. Se dice en voz alta en la pantalla.
--
-- A QUIÉN SE ATRIBUYE (decisión de Felipe, 2026-09-18): al proveedor de la COMPRA MÁS RECIENTE del producto
-- anterior a la venta ("comprar lo mismo a dos proveedores en la misma fecha casi no ocurre"). Una compra
-- posterior no puede explicar una prenda que ya se vendió, por eso se mira hacia atrás desde la fecha de la
-- venta. El Taller cuenta como otro posible origen: una producción terminada e inventariada (no muestra, no
-- anulada). Gana el origen más reciente. Sin ninguno: "Sin origen registrado", visible, nunca escondido.
-- Las compras anuladas no cuentan.
--
-- QUÉ ES UNA "DAÑADA": `danada_reparacion` o `danada_donar`. `devolver_proveedor` es otra cosa (la prenda
-- se manda de vuelta) y se muestra aparte. `vendible` es la prenda que volvió sana: es devolución, no falla.
--
-- HORA DE LIMA. Los límites de día y de mes usan `at time zone 'America/Lima'` (la misma razón que
-- ADR-0110): en UTC una venta de la noche cae en el día siguiente.
--
-- NÚMEROS (Jeff Dean). Una cohorte de 90 días son ≈ 3.000 líneas de venta. Por cada una, dos subconsultas
-- pequeñas para el origen. Del orden de decenas de milisegundos hoy; a 3 años (≈ 51 mil tickets, ADR-0109)
-- sigue en decenas de miles de filas. NO se crea índice ahora; se crea cuando una llamada pase de ~200 ms,
-- midiendo (candidato: compra_items(producto_id)).
--
-- SEGURIDAD. security definer para leer todas las tiendas (RLS deja ver solo la propia): por eso el candado
-- propio `fn_es_lider()`, más el par revoke/grant de siempre.
--
-- SE ROMPE SI: dos proveedores venden el mismo producto en fechas cercanas (la atribución sería la de la
-- última compra, sin avisar); una prenda se recibe sin compra ni producción (sale como "sin origen", no se
-- pierde); o se agrega una condición nueva de devolución sin decidir si es "dañada". Depende de
-- `variantes.talla_id` (la columna de texto `talla` ya no existe) y de `compras.estado` / `producciones.es_muestra`.
-- ============================================================================

create or replace function retail.fn_calidad(
  p_dia date default null,
  p_dias integer default 90,
  p_plazo_dias integer default 15
)
returns table (
  nivel text,
  clave text,
  etiqueta text,
  unidades_vendidas integer,
  unidades_devueltas integer,
  devueltas_vendibles integer,
  devueltas_danadas integer,
  devueltas_a_proveedor integer,
  unidades_cambiadas integer,
  cohorte_desde date,
  cohorte_hasta date
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_hasta date;
  v_desde date;
  v_ts_desde timestamptz;
  v_ts_hasta timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la calidad de las ventas';
  end if;
  if p_dias < 1 or p_plazo_dias < 0 then
    raise exception 'Parámetros fuera de rango (p_dias >= 1, p_plazo_dias >= 0)';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  -- Primer día que YA NO entra (exclusivo): las ventas de ese día aún no cumplieron su plazo completo.
  v_hasta := v_dia - p_plazo_dias;
  v_desde := v_hasta - p_dias;
  v_ts_desde := v_desde::timestamp at time zone 'America/Lima';
  v_ts_hasta := v_hasta::timestamp at time zone 'America/Lima';

  return query
  with items as (
    select vi.id as item_id, vi.cantidad, va.producto_id, ta.valor as talla, p.categoria_id,
           o.tipo as origen_tipo, o.origen_id
    from ventas ve
    join venta_items vi on vi.venta_id = ve.id
    join variantes va on va.id = vi.variante_id
    join productos p on p.id = va.producto_id
    left join tallas ta on ta.id = va.talla_id
    left join lateral (
      -- El origen más reciente ANTERIOR (o igual) al día de la venta. Empate de fecha: orden fijo.
      select x.tipo, x.origen_id
      from (
        select 'proveedor'::text as tipo, c.proveedor_id as origen_id, c.fecha_emision as fecha
        from compra_items ci
        join compras c on c.id = ci.compra_id
        where ci.producto_id = p.id
          and c.estado = 'vigente'
          and c.fecha_emision <= (ve.created_at at time zone 'America/Lima')::date
        union all
        select 'taller'::text, null::uuid, (pr.inventariado_at at time zone 'America/Lima')::date
        from producciones pr
        where pr.producto_id = p.id
          and pr.estado = 'terminada'
          and not pr.es_muestra
          and pr.inventariado_at is not null
          and (pr.inventariado_at at time zone 'America/Lima')::date <= (ve.created_at at time zone 'America/Lima')::date
      ) x
      order by x.fecha desc, x.tipo, x.origen_id
      limit 1
    ) o on true
    where ve.estado = 'completada'
      and ve.created_at >= v_ts_desde
      and ve.created_at <  v_ts_hasta
  ),
  devuelto as (
    -- Una fila por línea de venta: cuánto volvió y en qué condición. Solo devoluciones APROBADAS.
    select di.venta_item_id,
           sum(di.cantidad) filter (where di.condicion = 'vendible') as vendibles,
           sum(di.cantidad) filter (where di.condicion in ('danada_reparacion', 'danada_donar')) as danadas,
           sum(di.cantidad) filter (where di.condicion = 'devolver_proveedor') as a_proveedor
    from devolucion_items di
    join devoluciones d on d.id = di.devolucion_id and d.estado = 'aprobada'
    group by di.venta_item_id
  ),
  cambiado as (
    select c.venta_item_id, sum(c.cantidad) as cantidad
    from cambios c
    group by c.venta_item_id
  ),
  base as (
    select it.item_id, it.cantidad, it.producto_id, it.talla, it.categoria_id, it.origen_tipo, it.origen_id,
           coalesce(dv.vendibles, 0) as vendibles,
           coalesce(dv.danadas, 0) as danadas,
           coalesce(dv.a_proveedor, 0) as a_proveedor,
           coalesce(cb.cantidad, 0) as cambiadas
    from items it
    left join devuelto dv on dv.venta_item_id = it.item_id
    left join cambiado cb on cb.venta_item_id = it.item_id
  )
  select
    case when grouping(b.producto_id) = 0 then 'producto'
         when grouping(b.talla) = 0 then 'talla'
         when grouping(b.origen_tipo) = 0 then 'origen'
         when grouping(b.categoria_id) = 0 then 'categoria'
         else 'total' end,
    case when grouping(b.producto_id) = 0 then b.producto_id::text
         when grouping(b.talla) = 0 then coalesce(b.talla, '')
         when grouping(b.origen_tipo) = 0 then coalesce(b.origen_tipo, 'sin') || ':' || coalesce(b.origen_id::text, '')
         when grouping(b.categoria_id) = 0 then coalesce(b.categoria_id::text, '')
         else '' end,
    case when grouping(b.producto_id) = 0 then (select pr.referencia from productos pr where pr.id = b.producto_id)
         when grouping(b.talla) = 0 then coalesce(b.talla, 'Sin talla')
         when grouping(b.origen_tipo) = 0 then
           case b.origen_tipo
             when 'proveedor' then coalesce((select pv.nombre from proveedores pv where pv.id = b.origen_id), 'Proveedor sin nombre')
             when 'taller' then 'Taller'
             else 'Sin origen registrado' end
         when grouping(b.categoria_id) = 0 then coalesce((select ca.nombre from categorias ca where ca.id = b.categoria_id), 'Sin categoría')
         else 'Total' end,
    -- coalesce: sobre CERO filas, el total `()` sigue devolviendo una fila y un SUM de nada es NULL, no 0.
    coalesce(sum(b.cantidad), 0)::integer,
    coalesce(sum(b.vendibles + b.danadas + b.a_proveedor), 0)::integer,
    coalesce(sum(b.vendibles), 0)::integer,
    coalesce(sum(b.danadas), 0)::integer,
    coalesce(sum(b.a_proveedor), 0)::integer,
    coalesce(sum(b.cambiadas), 0)::integer,
    v_desde,
    v_hasta - 1
  from base b
  group by grouping sets ((b.producto_id), (b.talla), (b.origen_tipo, b.origen_id), (b.categoria_id), ())
  order by 1, 4 desc, 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prendas que volvieron dañadas, por tienda y por mes
-- ---------------------------------------------------------------------------
create or replace function retail.fn_calidad_danadas(p_dia date default null, p_meses integer default 6)
returns table (ubicacion_id uuid, mes date, condicion text, origen text, unidades integer)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_ts_desde timestamptz;
  v_ts_hasta timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver la calidad de las ventas';
  end if;
  if p_meses < 1 or p_meses > 36 then
    raise exception 'p_meses debe estar entre 1 y 36';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  v_ts_desde := (date_trunc('month', v_dia::timestamp) - make_interval(months => p_meses - 1)) at time zone 'America/Lima';
  v_ts_hasta := (v_dia + 1)::timestamp at time zone 'America/Lima';

  return query
  select x.ubicacion_id,
         date_trunc('month', x.cuando at time zone 'America/Lima')::date as mes,
         x.condicion,
         x.origen,
         sum(x.unidades)::integer
  from (
    -- Devoluciones aprobadas cuya prenda NO volvió sana. Fechadas el día en que se aprobaron.
    select d.ubicacion_id, d.aprobado_en as cuando, di.condicion, 'devolucion'::text as origen, di.cantidad as unidades
    from devolucion_items di
    join devoluciones d on d.id = di.devolucion_id
    where d.estado = 'aprobada'
      and di.condicion <> 'vendible'
      and d.aprobado_en >= v_ts_desde
      and d.aprobado_en <  v_ts_hasta
    union all
    -- Ventas anuladas cuya prenda NO volvió sana (anular_venta pide la condición de cada línea).
    select ve.ubicacion_id, ai.created_at, ai.condicion, 'anulacion'::text, vi.cantidad
    from venta_anulacion_items ai
    join ventas ve on ve.id = ai.venta_id
    join venta_items vi on vi.id = ai.venta_item_id
    where ai.condicion <> 'vendible'
      and ai.created_at >= v_ts_desde
      and ai.created_at <  v_ts_hasta
  ) x
  join ubicaciones u on u.id = x.ubicacion_id and u.activo and u.tipo = 'tienda'
  group by x.ubicacion_id, date_trunc('month', x.cuando at time zone 'America/Lima')::date, x.condicion, x.origen
  order by 2 desc, 1, 3, 4;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: sin el revoke, `anon` puede ejecutar (Postgres da EXECUTE a public).
-- ---------------------------------------------------------------------------
revoke all on function retail.fn_calidad(date, integer, integer) from public;
revoke all on function retail.fn_calidad_danadas(date, integer) from public;
grant execute on function retail.fn_calidad(date, integer, integer) to authenticated;
grant execute on function retail.fn_calidad_danadas(date, integer) to authenticated;
