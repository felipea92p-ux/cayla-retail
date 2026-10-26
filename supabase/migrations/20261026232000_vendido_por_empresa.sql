-- ============================================================================
-- 20261026232000 — Cuánto de lo vendido es de CAYLA y cuánto de CLAURE (ADR-0532)
--
-- EL PROBLEMA. En Tienda LIM conviven dos negocios (ADR-0463): CAYLA y CLAURE venden en la misma caja y con la misma boleta (el RUC
-- de CAYLA). Caja dice «Vendido hoy S/ 1.200» y el Historial «vendido S/ 18.000», pero nadie puede decir cuánto de eso es de cada
-- uno sin sumar boleta por boleta (Felipe, 2026-10-26).
--
-- LA REGLA (Felipe, 2026-10-26). Se reparte LO VENDIDO, prenda por prenda: cada línea de la venta suma a la empresa de su producto
-- (`productos.empresa_id`) por lo que se cobró de ella (`venta_items.subtotal`, con sus descuentos ya restados). Es exacto: en
-- producción, el 2026-10-26, las líneas suman lo pagado en todas las ventas (ninguna con descuento de ticket fuera de las líneas).
-- El dinero del cajón NO se parte por medio de pago: es un solo cajón y una sola boleta, y repartir el efectivo de una boleta mixta
-- sería una estimación. Una venta anulada deja de sumar y una devolución o un cambio no la resta, igual que el «vendido» de hoy:
-- las dos empresas se cuentan con la misma regla que ya tenían Caja e Historial.
--
-- LO QUE AGREGA (dos funciones de solo lectura, ninguna reescrita, sin tablas ni políticas)
--   1. `fn_vendido_por_empresa(...)`: los mismos filtros y la misma regla de lectura que `fn_totales_historial_ventas` (Historial),
--      para que la suma de las empresas sea EXACTAMENTE el «vendido» de la cabecera. Una fila por empresa.
--   2. `fn_vendido_por_empresa_de_cajas(uuid[])`: lo de cada turno de caja, con la regla de `fn_resumen_caja` (todas las ventas del
--      turno menos las anuladas, también las de prueba). Una fila por caja y empresa. Una caja que la cuenta no puede ver no sale
--      (no es un error: se pide en lote, como el Historial de cierres).
--   Las dos devuelven también la clave y el nombre de la empresa (la tabla `empresas` no se lee directo: ADR-0463) y su orden.
--
-- LO QUE NO HACE
--   · No parte los pagos (efectivo, Yape, tarjeta) por empresa, ni el esperado del cajón, ni la liquidación de lo que se le debe a
--     CLAURE (decisión de Felipe, 2026-10-26: solo lo vendido).
--   · No cambia `fn_totales_historial_ventas`, `fn_resumen_caja` ni `fn_ventas_del_dia`: la web pide esto aparte y, si la base aún
--     no lo tiene, la pantalla sale como antes.
--
-- CÓMO SE PEGA EN PRODUCCIÓN
--   Una sola ejecución: dos `create or replace function`, sin tablas tomadas, sin políticas ni `drop trigger` (no hay riesgo de
--   deadlock, CLAUDE.md «Políticas y deadlocks»). Idempotente. Antes que la web (con la web vieja no pasa nada).
-- ============================================================================

set lock_timeout = '3s';
set search_path = retail, public, extensions;

-- 1. Historial: lo vendido por empresa con los filtros de la pantalla --------------------------------------------------------
create or replace function retail.fn_vendido_por_empresa(
  p_desde timestamptz default null,
  p_hasta timestamptz default null,
  p_sede_id uuid default null,
  p_vendedor_id uuid default null,
  p_estado text default 'todas',
  p_pago text default null,
  p_comprobante text default 'todos',
  p_incluir_prueba boolean default false
)
returns table (empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
declare
  -- La misma regla de lectura que `fn_totales_historial_ventas` y la política `ventas_select`: el líder todas, cada quien su sede.
  v_lider boolean := coalesce(fn_es_lider(), false);
  v_ubicacion uuid := fn_ubicacion_actual_persona();
begin
  if p_estado not in ('todas', 'completada', 'anulada') then
    raise exception 'Estado de venta desconocido: %', p_estado using errcode = '22023';
  end if;
  if p_comprobante not in ('todos', 'con', 'sin') then
    raise exception 'Filtro de comprobante desconocido: %', p_comprobante using errcode = '22023';
  end if;

  -- Los filtros son copia de los de `fn_totales_historial_ventas`: si una cambia, cambia la otra (la prueba
  -- `pruebas:vendido-por-empresa` compara las dos sumas con los mismos filtros).
  return query
  with filtradas as (
    select v.id
    from ventas v
    where (v_lider or v.ubicacion_id = v_ubicacion)
      and v.estado <> 'anulada'
      and (p_desde is null or v.created_at >= p_desde)
      and (p_hasta is null or v.created_at < p_hasta)
      and (p_sede_id is null or v.ubicacion_id = p_sede_id)
      and (p_vendedor_id is null or v.asesora_id = p_vendedor_id or (v.asesora_id is null and v.usuario_id = p_vendedor_id))
      and (p_estado = 'todas' or v.estado = p_estado)
      and (p_incluir_prueba or not v.es_prueba)
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
  )
  select e.id, e.clave, e.nombre, e.orden,
         count(distinct i.venta_id)::integer,
         sum(i.cantidad)::integer,
         round(sum(coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2))), 2)
  from venta_items i
  join filtradas f on f.id = i.venta_id
  join variantes va on va.id = i.variante_id
  join productos p on p.id = va.producto_id
  join empresas e on e.id = p.empresa_id
  group by e.id, e.clave, e.nombre, e.orden
  order by e.orden, e.nombre;
end;
$$;

comment on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) is
  'ADR-0532: cuánto de lo vendido es de cada empresa (CAYLA, CLAURE), prenda por prenda, con los mismos filtros y la misma regla de lectura que fn_totales_historial_ventas: su suma es el «vendido» del Historial. Sin anuladas. Solo lectura.';

-- 2. Caja: lo vendido por empresa en cada turno -------------------------------------------------------------------------------
create or replace function retail.fn_vendido_por_empresa_de_cajas(p_cajas uuid[])
returns table (caja_id uuid, empresa_id uuid, clave text, nombre text, orden integer, ventas integer, unidades integer, total numeric)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Lo vendido del turno es lo de `fn_resumen_caja`: todas las ventas de la caja menos las anuladas (las de prueba también, porque
  -- su dinero estuvo en el cajón). Solo las cajas que la cuenta puede ver (la regla de `cajas_select`); las demás no salen.
  with vistas as (
    select c.id
    from cajas c
    where c.id = any (p_cajas)
      and coalesce(fn_es_lider() or c.ubicacion_id = fn_ubicacion_actual_persona(), false)
  )
  select v.caja_id, e.id, e.clave, e.nombre, e.orden,
         count(distinct i.venta_id)::integer,
         sum(i.cantidad)::integer,
         round(sum(coalesce(i.subtotal, round((i.precio_unitario - i.descuento_unitario) * i.cantidad, 2))), 2)
  from ventas v
  join vistas cv on cv.id = v.caja_id
  join venta_items i on i.venta_id = v.id
  join variantes va on va.id = i.variante_id
  join productos p on p.id = va.producto_id
  join empresas e on e.id = p.empresa_id
  where v.estado <> 'anulada'
  group by v.caja_id, e.id, e.clave, e.nombre, e.orden
  order by v.caja_id, e.orden, e.nombre
$$;

comment on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) is
  'ADR-0532: cuánto de lo vendido en cada turno de caja es de cada empresa (CAYLA, CLAURE), prenda por prenda, con la regla de fn_resumen_caja (sin anuladas). Solo las cajas que la cuenta puede ver. Solo lectura.';

revoke all on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) from public, anon;
revoke all on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) from public, anon;
grant execute on function retail.fn_vendido_por_empresa(timestamptz, timestamptz, uuid, uuid, text, text, text, boolean) to authenticated, service_role;
grant execute on function retail.fn_vendido_por_empresa_de_cajas(uuid[]) to authenticated, service_role;
