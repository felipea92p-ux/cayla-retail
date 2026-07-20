-- ⚠️ PROPUESTA — Fase F1 del núcleo financiero (jubilación de SINATRA, ver
-- docs/ANALISIS-SINATRA.md). Vive en docs/propuestas/ hasta que Felipe la corra;
-- luego pasa a supabase/migrations/0013_finanzas_nucleo.sql.
--
-- Decisiones confirmadas: corte limpio (sin migrar histórico transaccional),
-- proveedores central único (fin de las 3 copias desincronizadas), cuadre de
-- efectivo continuo por sede, comparativo año vs año con totales sembrados a mano.

-- ==================== PROVEEDORES (directorio único central) ====================
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  ruc text,
  categoria text,
  marca text,
  score numeric(3, 1),
  contacto text,
  telefono text,
  banco text,
  cuenta_bancaria text,
  direccion text,
  nota text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger proveedores_set_updated_at before update on proveedores
  for each row execute function fn_set_updated_at();

-- El lote recibido puede nacer de un proveedor del directorio (el texto libre
-- `lotes.proveedor` se mantiene como respaldo de lo ya registrado).
alter table lotes add column proveedor_id uuid references proveedores (id);

-- ==================== EFECTIVO: método de pago en gastos + depósitos + ajustes ====================
-- Para el cuadre continuo hay que saber qué gastos salieron del cajón físico.
alter table gastos add column metodo_pago text
  check (metodo_pago in ('efectivo', 'banco', 'yape', 'tarjeta'));

-- Depósitos de efectivo de la sede al banco (los "Depósito al banco" de las CAJA de SINATRA).
create table depositos_bancarios (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  fecha date not null default current_date,
  monto numeric(12, 2) not null check (monto > 0),
  nota text,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now()
);
create index depositos_bancarios_sede_idx on depositos_bancarios (sede_id);

-- Ajustes de efectivo: el saldo inicial del día del corte y correcciones puntuales
-- (con motivo, con autor — lo que el Excel nunca registró).
create table ajustes_efectivo (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  fecha date not null default current_date,
  monto numeric(12, 2) not null, -- con signo: +100 suma al teórico, -100 resta
  motivo text not null,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now()
);

-- ==================== COMPARATIVO AÑO VS AÑO (siembra manual, corte limpio) ====================
-- 12 números por sede por año, tomados de SINATRA una sola vez. El sistema llena
-- los meses nuevos solo, desde sus propias ventas.
create table ventas_historicas_mensuales (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  anio integer not null check (anio between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  monto numeric(14, 2) not null default 0,
  unique (sede_id, anio, mes)
);

-- ==================== PATRIMONIO v1 (partidas manuales) ====================
-- El efectivo teórico y el inventario a costo los calcula el sistema; el resto
-- (cuentas bancarias, deudas, activos fijos) lo mantiene el Líder aquí.
create table patrimonio_items (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('activo', 'pasivo')),
  monto numeric(14, 2) not null default 0,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger patrimonio_items_set_updated_at before update on patrimonio_items
  for each row execute function fn_set_updated_at();

-- ==================== RLS ====================
alter table proveedores enable row level security;
alter table depositos_bancarios enable row level security;
alter table ajustes_efectivo enable row level security;
alter table ventas_historicas_mensuales enable row level security;
alter table patrimonio_items enable row level security;

-- Proveedores: todas pueden ver el nombre al recibir mercadería; solo Líder edita.
create policy proveedores_select_autenticado on proveedores for select
  using (auth.role() = 'authenticated');
create policy proveedores_insert_lider on proveedores for insert with check (fn_es_lider());
create policy proveedores_update_lider on proveedores for update using (fn_es_lider());

-- Depósitos: mismo criterio sede-scoped que cajas.
create policy depositos_select_lider on depositos_bancarios for select using (fn_es_lider());
create policy depositos_select_propia_sede on depositos_bancarios for select
  using (sede_id = fn_sede_actual_persona());
create policy depositos_insert on depositos_bancarios for insert
  with check (fn_puede_operar_sede(sede_id));

-- Ajustes de efectivo, históricos y patrimonio: solo Líder.
create policy ajustes_efectivo_all_lider on ajustes_efectivo for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy ventas_historicas_all_lider on ventas_historicas_mensuales for all
  using (fn_es_lider()) with check (fn_es_lider());
create policy patrimonio_all_lider on patrimonio_items for all
  using (fn_es_lider()) with check (fn_es_lider());

-- ==================== RPC: registrar depósito al banco ====================
create or replace function registrar_deposito(
  p_sede_id uuid,
  p_monto numeric,
  p_nota text default null,
  p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para registrar depósitos de esa sede';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del depósito debe ser mayor a 0';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into depositos_bancarios (sede_id, fecha, monto, nota, usuario_id)
    values (p_sede_id, p_fecha, p_monto, p_nota, v_persona_id)
    returning id into v_id;

  return v_id;
end;
$$;
