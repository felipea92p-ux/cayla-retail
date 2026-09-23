-- ============================================================================
-- 20260923143700_rls_ventas_una_vez_por_consulta.sql — Historial de ventas caído por timeout (2026-09-22)
--
-- Síntoma: Ventas ▸ Historial mostraba «No se pudo cargar» (digest 575251889). Los logs de Vercel dicen
-- «canceling statement due to statement timeout»: `authenticated` tiene `statement_timeout = 8s` y la lista
-- no terminaba.
--
-- Causa: con el sembrado de 90 días (ADR-0150) `ventas` pasó de 16 a 7.001 filas, y la RLS de las cuatro
-- tablas de venta llamaba `fn_puede_operar_ubicacion(ubicacion_id)` FILA POR FILA. Esa función llama a
-- `fn_es_lider()` y `fn_ubicacion_actual_persona()`, que son SECURITY DEFINER: Postgres no puede incrustarlas,
-- así que ejecuta su consulta (personas ⨝ colaboradores) una vez por venta, otra por cada ítem, pago y
-- comprobante embebido. Medido en producción como líder: contar las ventas visibles tardaba 2.664 ms; con la
-- misma regla evaluada una vez por consulta, 1,6 ms.
--
-- Arreglo: ninguna de las dos funciones depende de la fila (solo de quién pregunta), así que se envuelven en
-- `(select …)` — Postgres las resuelve una sola vez como InitPlan y compara cada fila contra ese resultado.
-- Es la receta de Supabase para RLS («wrap functions in select»).
--
-- Equivalencia con la regla vieja, `coalesce(fn_es_lider() or ubicacion_id = fn_ubicacion_actual_persona(), false)`:
-- cuando la persona no es líder y no tiene ubicación, la nueva da NULL en vez de false, y para la RLS NULL
-- también es «no pasa». Mismas filas para todos; verificado contando fila por fila, antes y después, como el
-- líder y como una integrante de sede.
--
-- `comprobantes_select` repetía `fn_es_lider() OR fn_puede_operar_ubicacion(...)`, que ya incluye al líder:
-- queda la misma expresión que en las otras tres.
--
-- Solo se tocan las políticas de LECTURA de estas cuatro tablas (opción A). Las 92 políticas restantes con el
-- mismo patrón (stock, movimientos, cajas, transferencias…) son la opción B, en su propia migración.
--
-- Índice: la lista pide «las más recientes» (`order by created_at desc, id desc limit 51`) y `ventas` no tenía
-- índice por fecha: recorría y ordenaba todas las ventas en cada página.
-- ============================================================================

alter policy ventas_select on retail.ventas
  using ((select retail.fn_es_lider()) or ubicacion_id = (select retail.fn_ubicacion_actual_persona()));

alter policy venta_items_select on retail.venta_items
  using (exists (
    select 1 from retail.ventas v
    where v.id = venta_items.venta_id
      and ((select retail.fn_es_lider()) or v.ubicacion_id = (select retail.fn_ubicacion_actual_persona()))
  ));

alter policy venta_pagos_select on retail.venta_pagos
  using (exists (
    select 1 from retail.ventas v
    where v.id = venta_pagos.venta_id
      and ((select retail.fn_es_lider()) or v.ubicacion_id = (select retail.fn_ubicacion_actual_persona()))
  ));

alter policy comprobantes_select on retail.comprobantes
  using ((select retail.fn_es_lider()) or ubicacion_id = (select retail.fn_ubicacion_actual_persona()));

create index if not exists ventas_created_at_id_idx on retail.ventas (created_at desc, id desc);
