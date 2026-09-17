-- ============================================================================
-- 20260917220000 — Resumen de Inventario: cobertura, sell-through y estado
-- de rotación por producto, a nivel RED (todas las sedes juntas).
--
-- SOLO LOCAL — no aplicar a producción sin el ok puntual de Felipe (mismo
-- criterio que 20260916100000_punto_reorden.sql, que sigue igual de
-- pendiente hoy).
--
-- QUÉ ES Y QUÉ NO ES. Esto NO revive `apps/web/lib/inteligencia.ts` (V1,
-- borrado 2026-09-12): es una función nueva, chica, en el estilo RPC
-- security-definer que ya usa el resto de V2 — no un archivo único que
-- mezcle 6 responsabilidades (esa mezcla fue la razón real del corte a V2,
-- ver ADR-0097). Cobertura y sell-through se calculan ACÁ, aparte de
-- `fn_productos`, a propósito: `fn_productos` ya paga un costo por producto
-- (2 subconsultas LATERAL) en la pantalla de VENTA de catálogo, que se
-- recorre en cada carga de /productos; sumarle más cálculos ahí encarecería
-- una pantalla operativa con algo que solo importa para decidir reposición.
-- Ver ADR-0097.
--
-- FÓRMULAS (decisión tomada acá, documentada para no tener que adivinarla
-- después):
--   venta_neta       = ventas (tipo=salida, motivo=venta) − devoluciones
--                       (tipo=entrada, motivo=devolucion) en la ventana.
--                       Un traslado entre sedes NO resta ni suma: a nivel
--                       RED el stock total de la red no cambia con un
--                       traslado interno (ChatGPT lo señaló bien: "traslado,
--                       movimiento interno, conteo y ajuste no son venta").
--   demanda_diaria    = venta_neta / 30 (ventana fija por ahora — ver
--                       pregunta abierta en el ADR sobre ventana
--                       configurable 7/14/30/60/90).
--   merma_unidades    = unidades perdidas por merma (tipo=ajuste,
--                       motivo=merma, cantidad<0) en la ventana.
--   cobertura_dias    = stock_total / demanda_diaria. NULL si no hay
--                       demanda medible — nunca 0 ni infinito disfrazado.
--   en_camino         = unidades de esta prenda en traslados ya despachados
--                       hacia CUALQUIER sede, todavía no confirmados —
--                       mismo dato que ya usa Existencias por ubicación
--                       (`getExistencias`), acá sumado a nivel red.
--   sell_through_pct  = venta_neta / (stock_total + venta_neta +
--                       merma_unidades). Corrige el bug real de V1
--                       (inteligencia.ts:128): esa versión solo restaba
--                       venta del denominador, así que una merma o un
--                       ajuste dentro de la ventana quedaba invisible y el
--                       número salía inflado. Por conservación de
--                       unidades: stock_inicial + recibido = stock_actual +
--                       TODAS las salidas de la ventana — acá "todas las
--                       salidas" son venta_neta + merma (no traslados, que
--                       no salen de la red).
--
-- ESTADO (una sola prioridad, el primer `when` que calza gana — mismo
-- patrón de severidad estricta que ya usa `calcularEstado` en
-- inventario-reglas.ts, principio de integridad conceptual):
--   riesgo_quiebre — cobertura_dias <= 7 (con demanda real), o stock en 0
--                    con demanda > 0.
--   sobrestock     — cobertura_dias >= 90 con demanda real.
--   sin_movimiento — stock > 0 pero cero ventas netas en 30 días: no es
--                    "sobrestock" (eso mide EXCESO relativo a una demanda
--                    que existe) — acá no hay ninguna señal de demanda
--                    todavía, así que es una pregunta distinta ("¿por qué
--                    no se mueve esto?"), no la misma.
--   normal         — el resto.
-- Umbrales en `apps/web/lib/inventario-reglas.ts`
-- (UMBRAL_COBERTURA_RIESGO_DIAS / UMBRAL_COBERTURA_SOBRESTOCK_DIAS) — son un
-- primer número razonable, no medido con ventas reales todavía (a
-- diferencia de los umbrales de piso/almacén, que Felipe ya ajustó 3 veces
-- probando con datos reales). Se espera que se corrijan igual, con los 6
-- meses de datos simulados que se van a generar.
-- ============================================================================

create or replace function retail.fn_resumen_inventario()
returns table (
  producto_id uuid,
  referencia text,
  categoria_nombre text,
  stock_total integer,
  stock_minimo integer,
  venta_neta_30d integer,
  merma_30d integer,
  demanda_diaria numeric,
  cobertura_dias numeric,
  en_camino integer,
  cobertura_proyectada_dias numeric,
  sell_through_pct numeric,
  punto_reorden integer,
  reponer_de_proveedor boolean,
  estado text
)
language plpgsql
stable security definer
set search_path to 'retail', 'public', 'extensions'
as $$
declare
  c_cargo_especial constant uuid := '11111111-1111-4111-8111-111111111111';
begin
  return query
  with stock_red as (
    -- Cuarentena nunca cuenta como stock disponible (mismo criterio que
    -- `getStockPorUbicacion`, apps/web/lib/inventario-v2.ts): es mercadería
    -- dañada, no vendible.
    select v.producto_id, coalesce(sum(s.cantidad), 0)::integer as stock_total
    from variantes v
    join stock s on s.variante_id = v.id
    left join sububicaciones su on su.id = s.sububicacion_id
    where su.tipo is distinct from 'cuarentena'
    group by v.producto_id
  ),
  ventas as (
    select v.producto_id, sum(m.cantidad)::integer as unidades
    from movimientos m
    join variantes v on v.id = m.variante_id
    where m.tipo = 'salida' and m.motivo = 'venta'
      and m.created_at >= now() - interval '30 days'
    group by v.producto_id
  ),
  devoluciones as (
    select v.producto_id, sum(m.cantidad)::integer as unidades
    from movimientos m
    join variantes v on v.id = m.variante_id
    where m.tipo = 'entrada' and m.motivo = 'devolucion'
      and m.created_at >= now() - interval '30 days'
    group by v.producto_id
  ),
  mermas as (
    select v.producto_id, sum(abs(m.cantidad))::integer as unidades
    from movimientos m
    join variantes v on v.id = m.variante_id
    where m.tipo = 'ajuste' and m.motivo = 'merma' and m.cantidad < 0
      and m.created_at >= now() - interval '30 days'
    group by v.producto_id
  ),
  en_transito as (
    -- Mismo criterio que `getExistencias`: solo traslados ya despachados
    -- (en_transito o recibido_con_diferencia) — lo que todavía es borrador
    -- no es "en camino" de verdad.
    select v.producto_id, sum(ti.cantidad)::integer as unidades
    from transferencia_items ti
    join transferencias t on t.id = ti.transferencia_id
    join variantes v on v.id = ti.variante_id
    where t.estado in ('en_transito', 'recibido_con_diferencia')
    group by v.producto_id
  ),
  lead_time as (
    -- Mismo cálculo que `fn_productos` (20260916100000_punto_reorden.sql):
    -- proxy factura→recepción, 14 días si nunca hubo una recepción con
    -- factura. Se repite acá (no se llama a fn_productos) porque esa
    -- función pagina y arma filas por variante — pedirle un promedio por
    -- producto sería forzarla a un uso que no es el suyo.
    select p.id as producto_id,
      coalesce(
        (select avg(lo.fecha_recepcion::date - cm.fecha_emision)::numeric
         from movimientos m3
         join variantes v3 on v3.id = m3.variante_id
         join lotes lo on lo.id = m3.lote_id
         join compra_items ci on ci.id = m3.compra_item_id
         join compras cm on cm.id = ci.compra_id
         where v3.producto_id = p.id
           and m3.tipo = 'entrada' and m3.motivo = 'recepcion'),
        14
      ) as lead_time_dias
    from productos p
  )
  select
    p.id,
    p.referencia,
    c.nombre,
    coalesce(sr.stock_total, 0),
    p.stock_minimo,
    coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0) as venta_neta_30d,
    coalesce(mm.unidades, 0),
    (greatest(coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0), 0))::numeric / 30 as demanda_diaria,
    case when coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0) > 0
      then round(coalesce(sr.stock_total, 0)::numeric / ((coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0))::numeric / 30), 1)
      else null end as cobertura_dias,
    coalesce(et.unidades, 0),
    case when coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0) > 0
      then round((coalesce(sr.stock_total, 0) + coalesce(et.unidades, 0))::numeric / ((coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0))::numeric / 30), 1)
      else null end as cobertura_proyectada_dias,
    case when (coalesce(sr.stock_total, 0) + greatest(coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0), 0) + coalesce(mm.unidades, 0)) > 0
      then round(100.0 * greatest(coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0), 0)
        / (coalesce(sr.stock_total, 0) + greatest(coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0), 0) + coalesce(mm.unidades, 0)), 1)
      else null end as sell_through_pct,
    ceil((greatest(coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0), 0)::numeric / 30) * lt.lead_time_dias)::integer + coalesce(p.stock_minimo, 0) as punto_reorden,
    (coalesce(sr.stock_total, 0) <= ceil((greatest(coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0), 0)::numeric / 30) * lt.lead_time_dias)::integer + coalesce(p.stock_minimo, 0)
      and (coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0)) > 0) as reponer_de_proveedor,
    case
      when coalesce(sr.stock_total, 0) = 0 and (coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0)) > 0 then 'riesgo_quiebre'
      when (coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0)) > 0
        and coalesce(sr.stock_total, 0)::numeric / ((coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0))::numeric / 30) <= 7 then 'riesgo_quiebre'
      when (coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0)) > 0
        and coalesce(sr.stock_total, 0)::numeric / ((coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0))::numeric / 30) >= 90 then 'sobrestock'
      when (coalesce(vt.unidades, 0) - coalesce(dv.unidades, 0)) <= 0 and coalesce(sr.stock_total, 0) > 0 then 'sin_movimiento'
      else 'normal'
    end as estado
  from productos p
  left join categorias c on c.id = p.categoria_id
  left join stock_red sr on sr.producto_id = p.id
  left join ventas vt on vt.producto_id = p.id
  left join devoluciones dv on dv.producto_id = p.id
  left join mermas mm on mm.producto_id = p.id
  left join en_transito et on et.producto_id = p.id
  join lead_time lt on lt.producto_id = p.id
  where p.id <> c_cargo_especial and p.estado = 'activo';
end;
$$;

comment on function retail.fn_resumen_inventario() is
  'Cobertura, sell-through y estado de rotación por producto, a nivel red completa (todas las sedes). Alimenta /inventario/resumen. Ventana fija de 30 días. Ver ADR-0097.';

grant execute on function retail.fn_resumen_inventario() to authenticated;
