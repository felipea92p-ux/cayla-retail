-- ============================================================================
-- 0004_rls.sql — CAYLA V2
--
-- Mismo patrón que V1 (ver backups/cayla-v1/dump/retail-schema-only.sql):
-- catálogo = select para cualquier autenticado, escritura lider-only;
-- operación = acotada a fn_puede_operar_ubicacion(); las tablas de
-- movimiento de stock/dinero llevan ADEMÁS policy de INSERT como segunda
-- capa (la primera es la RPC security definer) — cinturón y tirantes, no
-- decoración: si alguien alguna vez intenta un insert directo saltándose
-- la función, esto lo frena igual.
--
-- No se sobredimensiona: no hay policies de UPDATE/DELETE donde el negocio
-- no las necesita (ej. nadie edita una venta ya hecha — se corrige con una
-- devolución, principio del propio laboratorio).
-- ============================================================================

-- ---------- personas ----------
alter table retail.personas enable row level security;
create policy personas_select_propia on retail.personas for select
  using (auth_user_id = auth.uid() or retail.fn_es_lider());

-- ---------- catálogo: select autenticado, escritura lider ----------
alter table retail.categorias enable row level security;
create policy categorias_select on retail.categorias for select using (auth.role() = 'authenticated');
create policy categorias_write_lider on retail.categorias for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.productos enable row level security;
create policy productos_select on retail.productos for select using (auth.role() = 'authenticated');
create policy productos_write_lider on retail.productos for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.colores enable row level security;
create policy colores_select on retail.colores for select using (auth.role() = 'authenticated');
create policy colores_write_lider on retail.colores for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.variantes enable row level security;
create policy variantes_select on retail.variantes for select using (auth.role() = 'authenticated');
create policy variantes_write_lider on retail.variantes for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.codigos_barras enable row level security;
create policy codigos_barras_select on retail.codigos_barras for select using (auth.role() = 'authenticated');
create policy codigos_barras_write_lider on retail.codigos_barras for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.proveedores enable row level security;
create policy proveedores_select on retail.proveedores for select using (auth.role() = 'authenticated');
create policy proveedores_write_lider on retail.proveedores for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.clientes enable row level security;
create policy clientes_select on retail.clientes for select using (auth.role() = 'authenticated');
create policy clientes_write_autenticado on retail.clientes for insert with check (auth.role() = 'authenticated');
-- Clientes lo puede dar de alta cualquier integrante durante una venta —
-- a diferencia del catálogo, no es una decisión que solo el líder tome.

alter table retail.ubicaciones enable row level security;
create policy ubicaciones_select on retail.ubicaciones for select using (auth.role() = 'authenticated');
create policy ubicaciones_write_lider on retail.ubicaciones for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

alter table retail.sububicaciones enable row level security;
create policy sububicaciones_select on retail.sububicaciones for select using (auth.role() = 'authenticated');
create policy sububicaciones_write_lider on retail.sububicaciones for all
  using (retail.fn_es_lider()) with check (retail.fn_es_lider());

-- ---------- inventario: acotado a la ubicación propia ----------
alter table retail.stock enable row level security;
create policy stock_select on retail.stock for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.movimientos enable row level security;
create policy movimientos_select on retail.movimientos for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id) or retail.fn_puede_operar_ubicacion(ubicacion_destino_id));
create policy movimientos_insert on retail.movimientos for insert
  with check (retail.fn_puede_operar_ubicacion(ubicacion_id));

-- ---------- compras ----------
alter table retail.ordenes_compra enable row level security;
create policy ordenes_compra_select on retail.ordenes_compra for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_destino_id));
create policy ordenes_compra_write on retail.ordenes_compra for all
  using (retail.fn_puede_operar_ubicacion(ubicacion_destino_id))
  with check (retail.fn_puede_operar_ubicacion(ubicacion_destino_id));

alter table retail.ordenes_compra_items enable row level security;
create policy ordenes_compra_items_select on retail.ordenes_compra_items for select
  using (exists (select 1 from retail.ordenes_compra o where o.id = orden_id and retail.fn_puede_operar_ubicacion(o.ubicacion_destino_id)));
create policy ordenes_compra_items_write on retail.ordenes_compra_items for all
  using (exists (select 1 from retail.ordenes_compra o where o.id = orden_id and retail.fn_puede_operar_ubicacion(o.ubicacion_destino_id)))
  with check (exists (select 1 from retail.ordenes_compra o where o.id = orden_id and retail.fn_puede_operar_ubicacion(o.ubicacion_destino_id)));

alter table retail.lotes enable row level security;
create policy lotes_select on retail.lotes for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
create policy lotes_insert on retail.lotes for insert
  with check (retail.fn_puede_operar_ubicacion(ubicacion_id));

-- ---------- ventas ----------
alter table retail.ventas enable row level security;
create policy ventas_select on retail.ventas for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
create policy ventas_insert on retail.ventas for insert
  with check (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.venta_items enable row level security;
create policy venta_items_select on retail.venta_items for select
  using (exists (select 1 from retail.ventas v where v.id = venta_id and retail.fn_puede_operar_ubicacion(v.ubicacion_id)));
create policy venta_items_insert on retail.venta_items for insert
  with check (exists (select 1 from retail.ventas v where v.id = venta_id and retail.fn_puede_operar_ubicacion(v.ubicacion_id)));

-- ---------- devoluciones ----------
alter table retail.devoluciones enable row level security;
create policy devoluciones_select on retail.devoluciones for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
create policy devoluciones_write on retail.devoluciones for all
  using (retail.fn_puede_operar_ubicacion(ubicacion_id))
  with check (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.devolucion_items enable row level security;
create policy devolucion_items_select on retail.devolucion_items for select
  using (exists (select 1 from retail.devoluciones d where d.id = devolucion_id and retail.fn_puede_operar_ubicacion(d.ubicacion_id)));
create policy devolucion_items_write on retail.devolucion_items for all
  using (exists (select 1 from retail.devoluciones d where d.id = devolucion_id and retail.fn_puede_operar_ubicacion(d.ubicacion_id)))
  with check (exists (select 1 from retail.devoluciones d where d.id = devolucion_id and retail.fn_puede_operar_ubicacion(d.ubicacion_id)));

-- ---------- conteos ----------
alter table retail.conteos enable row level security;
create policy conteos_select on retail.conteos for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_id));
create policy conteos_write on retail.conteos for all
  using (retail.fn_puede_operar_ubicacion(ubicacion_id))
  with check (retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.conteo_items enable row level security;
create policy conteo_items_select on retail.conteo_items for select
  using (exists (select 1 from retail.conteos c where c.id = conteo_id and retail.fn_puede_operar_ubicacion(c.ubicacion_id)));
-- Sin policy de escritura directa: conteo_items solo se escribe vía
-- conteo_contar()/cerrar_conteo() (security definer) — igual que
-- movimientos/stock, es lo que hace imposible contar sin dejar rastro.

-- ---------- transferencias ----------
alter table retail.transferencias enable row level security;
create policy transferencias_select on retail.transferencias for select
  using (retail.fn_puede_operar_ubicacion(ubicacion_origen_id) or retail.fn_puede_operar_ubicacion(ubicacion_destino_id));
create policy transferencias_insert on retail.transferencias for insert
  with check (retail.fn_puede_operar_ubicacion(ubicacion_origen_id));

alter table retail.transferencia_items enable row level security;
create policy transferencia_items_select on retail.transferencia_items for select
  using (exists (select 1 from retail.transferencias t where t.id = transferencia_id
    and (retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id) or retail.fn_puede_operar_ubicacion(t.ubicacion_destino_id))));
create policy transferencia_items_insert on retail.transferencia_items for insert
  with check (exists (select 1 from retail.transferencias t where t.id = transferencia_id and retail.fn_puede_operar_ubicacion(t.ubicacion_origen_id)));
