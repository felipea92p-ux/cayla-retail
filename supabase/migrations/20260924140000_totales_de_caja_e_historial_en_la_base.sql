-- Totales de Caja y del Historial de ventas calculados en la base (ADR-0191, auditoría de escalabilidad, etapa 3).
--
-- EL PROBLEMA. Tres lecturas traían FILAS a la web para sumarlas en JavaScript:
--  · Historial de ventas (`totalesVentasHistorial`, lib/ventas-historial.ts): traía cada venta del rango con sus
--    prendas y pagos, con un tope de 1.000 (PostgREST corta ahí). Con ~2.300 ventas al mes, cualquier rango de más
--    de ~2 semanas salía «parcial»: sin totales, sin trazo por día y sin reparto por forma de pago.
--  · Tablero de Caja (`getResumenCaja` + `getSeriesVentasCaja`, lib/caja.ts): leían las ventas de la caja, luego
--    sus pagos con `.in("venta_id", [todos los ids])` —una caja abierta varios días arma una URL que revienta— y
--    rehacían en JS las mismas cuentas que `fn_calcular_esperado_caja` (ADR-0186): dos fórmulas del mismo dinero.
--  · Caja en vivo (`useCajaEnVivo`): dos `count exact` cada 5 s por pestaña, y un conteo que no cambia cuando se
--    ANULA una venta (la fila sigue ahí), así que el tablero no se enteraba de una anulación.
--
-- LA SALIDA. Tres funciones de solo lectura que devuelven UNA fila (jsonb o texto):
--  · `fn_totales_historial_ventas(filtros…)`: los mismos filtros que `consulta()` de la web, SUM/GROUP BY.
--  · `fn_resumen_caja(caja)`: toma los montos del cajón de `fn_calcular_esperado_caja` (una sola fórmula) y suma
--    aparte solo lo que esa función no da: el reparto por forma de pago y la serie por hora de Lima.
--  · `fn_sello_caja(caja)`: un «sello» corto que cambia cuando entra, se anula o se mueve algo en la caja.
--
-- PERMISOS. Son SECURITY DEFINER (así no pagan la RLS fila por fila) y por eso aplican a mano EXACTAMENTE la regla
-- de lectura que hoy aplica la RLS a la web: `fn_es_lider() OR ubicacion_id = fn_ubicacion_actual_persona()` sobre
-- `ventas`/`cajas` (y sobre `comprobantes` para el filtro «con / sin comprobante», que en PostgREST pasa por la RLS
-- de esa tabla). `venta_items` y `venta_pagos` se ven cuando se ve su venta, igual que su política. El único dato
-- nuevo que viaja —el esperado del cajón— lleva el candado de `fn_esperado_caja` (`fn_puede_gestionar_caja()`); sin
-- él sale `null`. `anon` no ejecuta ninguna.
--
-- Nada de esto escribe ni cambia una tabla: aplicar o quitar la migración no mueve un sol.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Historial de ventas: totales del rango filtrado.
-- ---------------------------------------------------------------------------------------------------------------
-- Cada parámetro es un filtro de `consulta()` (lib/ventas-historial.ts) y se aplica igual:
--  · p_desde / p_hasta: intervalo [desde, hasta) en UTC; la web ya los traduce desde días de Lima (`limitesUTC`).
--  · p_sede_id: `ubicacion_id`. p_vendedor_id: quien atendió (`asesora_id`) o, sin asesora, la sesión que cobró.
--  · p_estado: 'todas' | 'completada' | 'anulada'. p_incluir_prueba: si false, fuera `es_prueba`.
--  · p_pago: la venta tiene al menos un pago con ese método (no recorta los otros pagos de la venta).
--  · p_comprobante: 'todos' | 'con' | 'sin' boleta, factura o nota de venta (una nota de crédito no ampara, ADR-0164).
--  · p_ids: si viene, solo esas ventas (para una búsqueda ya resuelta a ids; la web hoy no lo usa).
-- Qué cuenta: una venta anulada se cuenta aparte y NUNCA suma a lo vendido, a las unidades, al trazo por día ni al
-- reparto por forma de pago (`resumir`, `serieDiaria`, `mezclaDePagos`). El total de cada venta es la suma de sus
-- `subtotal` (o (precio − descuento) × cantidad si faltara), redondeada a céntimos venta por venta, como en la web.
create or replace function retail.fn_totales_historial_ventas(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_sede_id uuid default null,
  p_vendedor_id uuid default null,
  p_estado text default 'todas',
  p_pago text default null,
  p_comprobante text default 'todos',
  p_incluir_prueba boolean default false,
  p_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_lider boolean := coalesce(fn_es_lider(), false);
  v_ubicacion uuid := fn_ubicacion_actual_persona();
  v_resultado jsonb;
begin
  if p_estado not in ('todas', 'completada', 'anulada') then
    raise exception 'Estado de venta desconocido: %', p_estado using errcode = '22023';
  end if;
  if p_comprobante not in ('todos', 'con', 'sin') then
    raise exception 'Filtro de comprobante desconocido: %', p_comprobante using errcode = '22023';
  end if;

  with filtradas as (
    select v.id, v.estado = 'anulada' as anulada, (v.created_at at time zone 'America/Lima')::date as dia
    from ventas v
    where (v_lider or v.ubicacion_id = v_ubicacion)
      and (p_desde is null or v.created_at >= p_desde)
      and (p_hasta is null or v.created_at < p_hasta)
      and (p_sede_id is null or v.ubicacion_id = p_sede_id)
      and (p_vendedor_id is null or v.asesora_id = p_vendedor_id or (v.asesora_id is null and v.usuario_id = p_vendedor_id))
      and (p_estado = 'todas' or v.estado = p_estado)
      and (p_incluir_prueba or not v.es_prueba)
      and (p_ids is null or v.id = any (p_ids))
      and (p_pago is null or exists (select 1 from venta_pagos vp where vp.venta_id = v.id and vp.metodo = p_pago))
      and (
        p_comprobante = 'todos'
        or exists (
          select 1 from comprobantes c
          where c.venta_id = v.id
            and c.tipo in ('boleta', 'factura', 'nota_venta')
            and (v_lider or c.ubicacion_id = v_ubicacion)
        ) = (p_comprobante = 'con')
      )
  ),
  items as (
    select i.venta_id,
           round(sum(coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2))), 2) as total,
           sum(i.cantidad) as unidades
    from venta_items i
    join filtradas f on f.id = i.venta_id
    group by i.venta_id
  ),
  por_venta as (
    select f.anulada, f.dia, coalesce(it.total, 0) as total, coalesce(it.unidades, 0) as unidades
    from filtradas f
    left join items it on it.venta_id = f.id
  ),
  por_dia as (
    select dia, count(*) as ventas, sum(total) as total
    from por_venta
    where not anulada
    group by dia
  ),
  por_metodo as (
    select vp.metodo, sum(vp.monto) as monto
    from venta_pagos vp
    join filtradas f on f.id = vp.venta_id
    where not f.anulada
    group by vp.metodo
  )
  select jsonb_build_object(
    'ventas', (select count(*) from por_venta where not anulada),
    'anuladas', (select count(*) from por_venta where anulada),
    'unidades', (select coalesce(sum(unidades), 0) from por_venta where not anulada),
    'total', (select coalesce(sum(total), 0) from por_venta where not anulada),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('fecha', to_char(dia, 'YYYY-MM-DD'), 'ventas', ventas, 'total', total) order by dia), '[]'::jsonb) from por_dia),
    'por_metodo', (select coalesce(jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto) order by monto desc, metodo), '[]'::jsonb) from por_metodo)
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function retail.fn_totales_historial_ventas(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean, uuid[]) is
  'Totales del Historial de ventas con los mismos filtros de la pantalla, sin tope de filas (ADR-0191). Regla de lectura = RLS de ventas.';

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Tablero de Caja: lo del cajón, el reparto por forma de pago y la serie por hora, en una fila.
-- ---------------------------------------------------------------------------------------------------------------
-- Los montos del cajón (ventas en efectivo, entradas, salidas, reembolsos, cambios) salen de
-- `fn_calcular_esperado_caja`: la misma función que usan `fn_esperado_caja` y `cerrar_caja`. Aquí no se repite esa
-- fórmula. Lo que se suma aparte —y ella no da— es el reparto por método (efectivo, tarjeta, Yape…) y la serie por
-- hora de Lima, ambos sin ventas anuladas, igual que ella.
create or replace function retail.fn_resumen_caja(p_caja_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_ubicacion uuid;
  r record;
  v_por_metodo jsonb;
  v_por_hora jsonb;
  v_otros numeric;
begin
  select c.ubicacion_id into v_ubicacion from cajas c where c.id = p_caja_id;
  -- Misma regla que la política `cajas_select`: el líder todas, cada quien la de su sede.
  if not found or not coalesce(fn_es_lider() or v_ubicacion = fn_ubicacion_actual_persona(), false) then
    raise exception 'No tienes permiso sobre esa caja' using errcode = '42501';
  end if;

  select * into r from fn_calcular_esperado_caja(p_caja_id);

  with pagos as (
    select vp.metodo, vp.monto, extract(hour from v.created_at at time zone 'America/Lima')::int as hora
    from venta_pagos vp
    join ventas v on v.id = vp.venta_id
    where v.caja_id = p_caja_id and v.estado <> 'anulada'
  )
  select
    (select coalesce(jsonb_object_agg(metodo, monto), '{}'::jsonb)
       from (select metodo, sum(monto) as monto from pagos group by metodo) m),
    (select coalesce(jsonb_agg(jsonb_build_object('hora', hora, 'efectivo', efectivo, 'otros', otros) order by hora), '[]'::jsonb)
       from (select hora,
                    coalesce(sum(monto) filter (where metodo = 'efectivo'), 0) as efectivo,
                    coalesce(sum(monto) filter (where metodo <> 'efectivo'), 0) as otros
               from pagos group by hora) h),
    (select coalesce(sum(monto), 0) from pagos where metodo <> 'efectivo')
  into v_por_metodo, v_por_hora, v_otros;

  return jsonb_build_object(
    'ventas_efectivo', r.ventas_efectivo,
    'ventas_otros', v_otros,
    'ingresos', r.ingresos,
    'egresos', r.egresos,
    'reembolsos_efectivo', r.reembolsos_efectivo,
    'cambios_efectivo', r.cambios_efectivo,
    -- El total esperado en el cajón, con el mismo candado que `fn_esperado_caja`: sin permiso de cerrar, `null`.
    'esperado', case when fn_puede_gestionar_caja() then r.esperado end,
    'por_metodo', v_por_metodo,
    'por_hora', v_por_hora
  );
end;
$$;

comment on function retail.fn_resumen_caja(uuid) is
  'Tablero de Caja en una fila: montos de fn_calcular_esperado_caja + reparto por método y serie por hora de Lima (ADR-0191).';

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Caja en vivo: un sello que cambia cuando la caja cambia.
-- ---------------------------------------------------------------------------------------------------------------
-- «ventas:anuladas:movimientos:devoluciones:cambios» de ESTA caja. Una sola ida a la base en vez de dos, y cambia
-- también cuando se anula una venta (antes el conteo seguía igual y el tablero no se enteraba). Todo por índices
-- de `caja_id` (ventas_caja_idx, caja_movimientos_caja_idx, devoluciones_caja_idx, cambios_caja_idx).
create or replace function retail.fn_sello_caja(p_caja_id uuid)
returns text
language plpgsql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  v_ubicacion uuid;
begin
  select c.ubicacion_id into v_ubicacion from cajas c where c.id = p_caja_id;
  if not found or not coalesce(fn_es_lider() or v_ubicacion = fn_ubicacion_actual_persona(), false) then
    raise exception 'No tienes permiso sobre esa caja' using errcode = '42501';
  end if;
  return concat_ws(':',
    (select count(*) from ventas v where v.caja_id = p_caja_id),
    (select count(*) from ventas v where v.caja_id = p_caja_id and v.estado = 'anulada'),
    (select count(*) from caja_movimientos m where m.caja_id = p_caja_id),
    (select count(*) from devoluciones d where d.caja_id = p_caja_id),
    (select count(*) from cambios cb where cb.caja_id = p_caja_id)
  );
end;
$$;

comment on function retail.fn_sello_caja(uuid) is
  'Sello corto de una caja para el tablero en vivo: cambia al entrar, anularse o moverse algo (ADR-0191).';

revoke all on function retail.fn_totales_historial_ventas(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean, uuid[]) from public, anon;
revoke all on function retail.fn_resumen_caja(uuid) from public, anon;
revoke all on function retail.fn_sello_caja(uuid) from public, anon;
grant execute on function retail.fn_totales_historial_ventas(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean, uuid[]) to authenticated;
grant execute on function retail.fn_resumen_caja(uuid) to authenticated;
grant execute on function retail.fn_sello_caja(uuid) to authenticated;
