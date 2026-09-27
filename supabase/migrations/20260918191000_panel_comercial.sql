-- ============================================================================
-- 20260918191000_panel_comercial.sql — CAYLA V2 · Gestión comercial (ADR-0110)
--
-- ESTADO: escrita y probada contra un Postgres desechable con datos que cruzan la medianoche de
--   Lima (scripts/pruebas/panel_comercial.mjs). NO en producción — la pega Felipe en el SQL
--   Editor. Ya va calificada con `retail.`: se pega tal cual. Solo LECTURA: no crea tablas, no
--   toca ninguna fila, no cambia ningún flujo de dinero. Se deshace con tres `drop function`.
--
-- PARA QUÉ. La pantalla `/comercial` (solo líder) responde "¿cómo va cada tienda hoy, esta
-- semana y este mes, y contra su meta?". Estas tres funciones son la ÚNICA casa de esas cuentas:
-- la pantalla no suma nada por su cuenta, así que dos pantallas nunca pueden decir dos cifras
-- distintas de lo vendido.
--
-- CONTRATO (Liskov), tres líneas por función:
--   fn_comercial_sedes(p_dia)         → una fila por tienda activa con lo vendido, los tickets, las
--                                       unidades y lo devuelto en hoy / semana / mes, más su meta.
--   fn_comercial_horas(p_dia)         → ventas y tickets del día por tienda y por hora de Lima.
--   fn_comercial_colaboradoras(p_dia) → por tienda y colaboradora: ventas del día y del mes, y lo
--                                       que se descontó, para que vender más no premie regalar.
--   Todas ASUMEN que quien llama es líder (si no, fallan con un mensaje claro) y NO modifican datos.
--
-- QUÉ ES UNA "VENTA" AQUÍ (decisiones de negocio, revertibles, ver ADR-0110):
--   · Lo que cobró el mostrador: `venta_items.subtotal` = (precio − descuento) × cantidad, CON
--     IGV incluido, igual que el cierre de caja. Un estado de resultados lo mostrará sin IGV.
--   · Solo `ventas.estado = 'completada'`. Una venta anulada no cuenta, en ningún período.
--   · Las DEVOLUCIONES aprobadas se muestran APARTE (columna `devuelto_*`), fechadas el día en
--     que se aprobaron, no el día de la venta original. Es lo mismo que hace la caja: la plata
--     sale el día que se devuelve. El panel no las resta solo: quien lee decide si quiere el neto.
--   · No incluye la diferencia de un CAMBIO (es un movimiento de caja, no una venta nueva).
--
-- LA HORA ES LA DE LIMA. `created_at` es timestamptz (UTC). Una venta a las 7:30 pm de Lima es
-- 00:30 UTC del día SIGUIENTE. Todos los límites de día se calculan con `at time zone
-- 'America/Lima'`; sin eso, las ventas de la noche caerían en el día equivocado. Lima no tiene
-- horario de verano, así que el desfase es fijo (UTC−5).
--   · Semana = lunes a domingo (date_trunc('week') de Postgres empieza el lunes).
--   · Mes = mes calendario, del 1 al día pedido.
--
-- NÚMEROS (Jeff Dean). Hoy ≈ 35 tickets al día entre las 3 tiendas; un mes ≈ 1.100 filas de
-- `ventas` y ≈ 2.000 de `venta_items`. Cada llamada lee UN mes con un solo recorrido, así que
-- sin índice sobre `ventas.created_at` es un recorrido completo de una tabla pequeña. A 3 años
-- (≈ 51 mil tickets, ver ADR-0109) sigue siendo un recorrido de decenas de miles de filas: del
-- orden de milisegundos a pocas decenas. NO se crea índice ahora; se crea cuando una llamada pase
-- de ~200 ms (regla: medir, no adivinar). El filtro por fecha ya está escrito para poder usarlo.
--
-- SEGURIDAD. security definer para poder leer todas las tiendas (RLS de `ventas` deja ver solo
-- las de tu ubicación) — por eso el candado propio: `fn_es_lider()`. Par revoke/grant de siempre:
-- sin el revoke, `anon` ejecuta (Postgres da EXECUTE a public al crear una función).
--
-- SE ROMPE SI: se agrega un estado de venta nuevo (p. ej. 'en_proceso') y nadie decide si cuenta;
-- si una tienda vende sin `venta_items` (no puede: son NOT NULL); o si `ventas.usuario_id` queda
-- nulo (sale como "sin colaboradora registrada", no se pierde).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Por tienda: hoy, semana y mes
-- ---------------------------------------------------------------------------
create or replace function retail.fn_comercial_sedes(p_dia date default null)
returns table (
  ubicacion_id uuid,
  nombre text,
  meta_venta_diaria numeric,
  ventas_hoy numeric,     tickets_hoy integer,     unidades_hoy integer,     devuelto_hoy numeric,
  ventas_semana numeric,  tickets_semana integer,  unidades_semana integer,  devuelto_semana numeric,
  ventas_mes numeric,     tickets_mes integer,     unidades_mes integer,     devuelto_mes numeric
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_ts_hoy timestamptz;
  v_ts_semana timestamptz;
  v_ts_mes timestamptz;
  v_ts_fin timestamptz;
  v_ts_desde timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver el panel comercial';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  v_ts_hoy := v_dia::timestamp at time zone 'America/Lima';
  v_ts_semana := date_trunc('week', v_dia::timestamp) at time zone 'America/Lima';
  v_ts_mes := date_trunc('month', v_dia::timestamp) at time zone 'America/Lima';
  v_ts_fin := (v_dia + 1)::timestamp at time zone 'America/Lima';
  v_ts_desde := least(v_ts_semana, v_ts_mes);

  return query
  with por_venta as (
    -- Una fila por venta completada del tramo: su monto y sus unidades ya sumados. Se agrega en
    -- dos pasos (venta, luego tienda) para que un ticket con 5 líneas cuente UN ticket, no cinco.
    select v.ubicacion_id, v.created_at,
           sum(vi.subtotal) as monto,
           sum(vi.cantidad)::integer as unidades
    from ventas v
    join venta_items vi on vi.venta_id = v.id
    where v.estado = 'completada'
      and v.created_at >= v_ts_desde
      and v.created_at <  v_ts_fin
    group by v.id, v.ubicacion_id, v.created_at
  ),
  vendido as (
    select pv.ubicacion_id,
           coalesce(sum(pv.monto)    filter (where pv.created_at >= v_ts_hoy), 0)    as ventas_hoy,
           count(*)                  filter (where pv.created_at >= v_ts_hoy)::integer as tickets_hoy,
           coalesce(sum(pv.unidades) filter (where pv.created_at >= v_ts_hoy), 0)::integer as unidades_hoy,
           coalesce(sum(pv.monto)    filter (where pv.created_at >= v_ts_semana), 0) as ventas_semana,
           count(*)                  filter (where pv.created_at >= v_ts_semana)::integer as tickets_semana,
           coalesce(sum(pv.unidades) filter (where pv.created_at >= v_ts_semana), 0)::integer as unidades_semana,
           coalesce(sum(pv.monto)    filter (where pv.created_at >= v_ts_mes), 0)    as ventas_mes,
           count(*)                  filter (where pv.created_at >= v_ts_mes)::integer as tickets_mes,
           coalesce(sum(pv.unidades) filter (where pv.created_at >= v_ts_mes), 0)::integer as unidades_mes
    from por_venta pv
    group by pv.ubicacion_id
  ),
  por_devolucion as (
    select d.ubicacion_id, d.aprobado_en,
           sum(di.cantidad * (vi.precio_unitario - vi.descuento_unitario)) as valor
    from devoluciones d
    join devolucion_items di on di.devolucion_id = d.id
    join venta_items vi on vi.id = di.venta_item_id
    where d.estado = 'aprobada'
      and d.aprobado_en >= v_ts_desde
      and d.aprobado_en <  v_ts_fin
    group by d.id, d.ubicacion_id, d.aprobado_en
  ),
  devuelto as (
    select pd.ubicacion_id,
           coalesce(sum(pd.valor) filter (where pd.aprobado_en >= v_ts_hoy), 0)    as devuelto_hoy,
           coalesce(sum(pd.valor) filter (where pd.aprobado_en >= v_ts_semana), 0) as devuelto_semana,
           coalesce(sum(pd.valor) filter (where pd.aprobado_en >= v_ts_mes), 0)    as devuelto_mes
    from por_devolucion pd
    group by pd.ubicacion_id
  )
  select u.id, u.nombre, u.meta_venta_diaria,
         coalesce(x.ventas_hoy, 0),    coalesce(x.tickets_hoy, 0),    coalesce(x.unidades_hoy, 0),    coalesce(y.devuelto_hoy, 0),
         coalesce(x.ventas_semana, 0), coalesce(x.tickets_semana, 0), coalesce(x.unidades_semana, 0), coalesce(y.devuelto_semana, 0),
         coalesce(x.ventas_mes, 0),    coalesce(x.tickets_mes, 0),    coalesce(x.unidades_mes, 0),    coalesce(y.devuelto_mes, 0)
  from ubicaciones u
  left join vendido x on x.ubicacion_id = u.id
  left join devuelto y on y.ubicacion_id = u.id
  where u.activo and u.tipo = 'tienda'
  order by u.nombre;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Por hora del día (hora de Lima)
-- ---------------------------------------------------------------------------
create or replace function retail.fn_comercial_horas(p_dia date default null)
returns table (ubicacion_id uuid, hora integer, ventas numeric, tickets integer)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_ts_hoy timestamptz;
  v_ts_fin timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver el panel comercial';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  v_ts_hoy := v_dia::timestamp at time zone 'America/Lima';
  v_ts_fin := (v_dia + 1)::timestamp at time zone 'America/Lima';

  return query
  select v.ubicacion_id,
         extract(hour from v.created_at at time zone 'America/Lima')::integer as hora,
         sum(vi.subtotal) as ventas,
         count(distinct v.id)::integer as tickets
  from ventas v
  join venta_items vi on vi.venta_id = v.id
  join ubicaciones u on u.id = v.ubicacion_id and u.activo and u.tipo = 'tienda'
  where v.estado = 'completada'
    and v.created_at >= v_ts_hoy
    and v.created_at <  v_ts_fin
  group by v.ubicacion_id, extract(hour from v.created_at at time zone 'America/Lima')
  order by v.ubicacion_id, hora;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Por colaboradora: del día y del mes, con lo que se descontó
-- ---------------------------------------------------------------------------
create or replace function retail.fn_comercial_colaboradoras(p_dia date default null)
returns table (
  ubicacion_id uuid,
  persona_id uuid,
  ventas_hoy numeric,   tickets_hoy integer,
  ventas_mes numeric,   tickets_mes integer,  unidades_mes integer,
  bruto_mes numeric,    descuento_mes numeric
)
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
#variable_conflict use_column
declare
  v_dia date;
  v_ts_hoy timestamptz;
  v_ts_mes timestamptz;
  v_ts_fin timestamptz;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede ver el panel comercial';
  end if;

  v_dia := coalesce(p_dia, (now() at time zone 'America/Lima')::date);
  v_ts_hoy := v_dia::timestamp at time zone 'America/Lima';
  v_ts_mes := date_trunc('month', v_dia::timestamp) at time zone 'America/Lima';
  v_ts_fin := (v_dia + 1)::timestamp at time zone 'America/Lima';

  return query
  with por_venta as (
    select v.ubicacion_id, v.usuario_id, v.created_at,
           sum(vi.subtotal) as monto,
           sum(vi.cantidad)::integer as unidades,
           sum(vi.precio_unitario * vi.cantidad) as bruto,
           sum(vi.descuento_unitario * vi.cantidad) as descuento
    from ventas v
    join venta_items vi on vi.venta_id = v.id
    where v.estado = 'completada'
      and v.created_at >= v_ts_mes
      and v.created_at <  v_ts_fin
    group by v.id, v.ubicacion_id, v.usuario_id, v.created_at
  )
  select pv.ubicacion_id, pv.usuario_id,
         coalesce(sum(pv.monto) filter (where pv.created_at >= v_ts_hoy), 0),
         count(*) filter (where pv.created_at >= v_ts_hoy)::integer,
         coalesce(sum(pv.monto), 0),
         count(*)::integer,
         coalesce(sum(pv.unidades), 0)::integer,
         coalesce(sum(pv.bruto), 0),
         coalesce(sum(pv.descuento), 0)
  from por_venta pv
  join ubicaciones u on u.id = pv.ubicacion_id and u.activo and u.tipo = 'tienda'
  group by pv.ubicacion_id, pv.usuario_id
  order by pv.ubicacion_id, 5 desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: sin el revoke, `anon` puede ejecutar (Postgres da EXECUTE a public).
-- ---------------------------------------------------------------------------
revoke all on function retail.fn_comercial_sedes(date) from public;
revoke all on function retail.fn_comercial_horas(date) from public;
revoke all on function retail.fn_comercial_colaboradoras(date) from public;
grant execute on function retail.fn_comercial_sedes(date) to authenticated;
grant execute on function retail.fn_comercial_horas(date) to authenticated;
grant execute on function retail.fn_comercial_colaboradoras(date) to authenticated;
