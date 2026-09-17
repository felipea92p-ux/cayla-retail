-- ============================================================================
-- 20260917173000_compras_candado_de_sede.sql — CAYLA V2
--
-- EL PROBLEMA. `compras`, `compra_items`, `compra_pagos` y `compra_adjuntos`
-- nacieron (compras_desde_factura, compras_adjuntos) con RLS de lectura
-- `auth.role() = 'authenticated'` — "cualquiera con sesión", sin mirar sede
-- ni rol. A diferencia de `ventas`/`movimientos` (0004_rls.sql), nunca se
-- conectó con `fn_puede_operar_ubicacion`. Verificado el 2026-09-17 contra
-- una transacción de prueba en local (Micaela, integrante de Tienda
-- Trujillo, sin compras propias): veía las 3 facturas de Taller y Tienda
-- Lima por `listar_compras`, `resumen_compras` y la vista `compras_resumen`
-- — el RUC, el monto y la condición de pago del proveedor de una factura
-- que no era de su sede. Decisión de Felipe (protocolo /decide, 2026-09-17):
-- acotar TODO al mismo candado que ya usan ventas y movimientos, no dejarlo
-- abierto ni partir lectura/escritura.
--
-- QUÉ NO CAMBIA. El registro de una factura (`registrar_compra`,
-- `registrar_pago_compra`, `anular_compra`, adjuntos) sigue detrás de
-- `fn_puede_registrar_compras()` (solo líder, cualquier sede) — verificado
-- que hoy YA es así: `0013`/`0016` reemplazaron el bypass temporal de
-- `0012_control_total_temporal.sql`, ese bypass ya no está vigente ni en
-- local ni en producción. Y `recibir_compras`/`recibir_lote` ya usaban
-- `fn_puede_operar_ubicacion` desde que nacieron. Este archivo solo cierra
-- la LECTURA.
--
-- POR QUÉ `resumen_compras` necesita el filtro escrito a mano, no le basta
-- con arreglar la política de RLS: es `security definer` y consulta
-- `compras` directo (no la vista) — sin `force row level security` en la
-- tabla (no la tiene, verificado en local y en producción), una función
-- `security definer` no pasa por RLS en absoluto. `listar_compras` sí queda
-- cubierta por la política nueva porque consulta la vista `compras_resumen`,
-- que es `security_invoker = true`.
--
-- SE ROMPE SI: alguien agrega una RPC nueva que lea `compras`/`compra_items`
-- /`compra_pagos`/`compra_adjuntos` directo (no por la vista) sin repetir el
-- chequeo de `fn_puede_operar_ubicacion` a mano — RLS no la protege ahí.
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. RLS: candado de sede en vez de "cualquiera con sesión" ====================
drop policy compras_select on compras;
create policy compras_select on compras for select
  using (fn_puede_operar_ubicacion(ubicacion_destino_id));

drop policy compra_items_select on compra_items;
create policy compra_items_select on compra_items for select
  using (exists (
    select 1 from compras c where c.id = compra_id and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  ));

drop policy compra_pagos_select on compra_pagos;
create policy compra_pagos_select on compra_pagos for select
  using (exists (
    select 1 from compras c where c.id = compra_id and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  ));

drop policy compra_adjuntos_select on compra_adjuntos;
create policy compra_adjuntos_select on compra_adjuntos for select
  using (exists (
    select 1 from compras c where c.id = compra_id and fn_puede_operar_ubicacion(c.ubicacion_destino_id)
  ));

-- ==================== 2. resumen_compras: el candado a mano que RLS no le da ====================
create or replace function retail.resumen_compras()
returns table (
  registradas bigint, vigentes bigint, por_recibir bigint,
  deuda numeric, con_saldo bigint, vencido numeric, vencidas bigint,
  por_vencer bigint, por_vencer_monto numeric
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    (select count(*) from compras where fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and estado_recepcion in ('sin_recibir', 'parcial') and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento < current_date and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select count(*) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between current_date and current_date + 7 and fn_puede_operar_ubicacion(ubicacion_destino_id)),
    (select coalesce(sum(saldo), 0) from compras where estado = 'vigente' and saldo > 0 and fecha_vencimiento between current_date and current_date + 7 and fn_puede_operar_ubicacion(ubicacion_destino_id))
  where auth.uid() is not null;
$$;
