-- Row Level Security: Líderes ven todo (todas las sedes, costos/precios); Integrantes
-- solo ven/operan su propia sede y no ven costo/margen (mismo principio que
-- CAYLA Inventario: roles validados en el servidor, no solo ocultos en la UI).

alter table sedes enable row level security;
alter table personas enable row level security;
alter table productos enable row level security;
alter table variantes enable row level security;
alter table stock enable row level security;
alter table movimientos enable row level security;
alter table ordenes_produccion enable row level security;
alter table bom_items enable row level security;
alter table ordenes_compra enable row level security;
alter table ordenes_compra_items enable row level security;

-- ==================== HELPERS ====================
create or replace function fn_persona_actual()
returns personas
language sql stable
as $$
  select * from personas where auth_user_id = auth.uid();
$$;

create or replace function fn_es_lider()
returns boolean
language sql stable
as $$
  select coalesce((select rol = 'lider' from personas where auth_user_id = auth.uid()), false);
$$;

create or replace function fn_sede_actual_persona()
returns uuid
language sql stable
as $$
  select sede_id from personas where auth_user_id = auth.uid();
$$;

-- ==================== SEDES: todos autenticados pueden leer la lista ====================
create policy sedes_select_autenticado on sedes for select
  using (auth.role() = 'authenticated');

-- ==================== PERSONAS ====================
create policy personas_select_lider on personas for select
  using (fn_es_lider());
create policy personas_select_propia on personas for select
  using (auth_user_id = auth.uid());
create policy personas_update_lider on personas for update
  using (fn_es_lider());

-- ==================== PRODUCTOS / VARIANTES: catálogo visible para todos, edición solo Líder ====================
create policy productos_select_autenticado on productos for select
  using (auth.role() = 'authenticated');
create policy productos_insert_lider on productos for insert
  with check (fn_es_lider());
create policy productos_update_lider on productos for update
  using (fn_es_lider());

create policy variantes_select_autenticado on variantes for select
  using (auth.role() = 'authenticated');
create policy variantes_insert_lider on variantes for insert
  with check (fn_es_lider());
create policy variantes_update_lider on variantes for update
  using (fn_es_lider());

-- ==================== STOCK: Líder ve todas las sedes; Integrante solo la suya ====================
create policy stock_select_lider on stock for select
  using (fn_es_lider());
create policy stock_select_propia_sede on stock for select
  using (sede_id = fn_sede_actual_persona());

-- ==================== MOVIMIENTOS: mismo criterio; la escritura real pasa por el RPC
-- registrar_movimiento() (security definer), no por insert directo. ====================
create policy movimientos_select_lider on movimientos for select
  using (fn_es_lider());
create policy movimientos_select_propia_sede on movimientos for select
  using (sede_id = fn_sede_actual_persona());
create policy movimientos_insert_propia_sede on movimientos for insert
  with check (sede_id = fn_sede_actual_persona() or fn_es_lider());

-- ==================== PRODUCCIÓN / COMPRAS: solo Líder (sin UI en Fase 1, pero ya protegido) ====================
create policy ordenes_produccion_all_lider on ordenes_produccion for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy bom_items_all_lider on bom_items for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy ordenes_compra_all_lider on ordenes_compra for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy ordenes_compra_items_all_lider on ordenes_compra_items for all
  using (fn_es_lider()) with check (fn_es_lider());
