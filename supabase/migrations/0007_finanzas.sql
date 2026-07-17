-- Fase 2 financiera: Diario de Caja, Gastos, Estado de Resultados.
-- Ver docs/adr/ para el porqué de cada decisión (apertura/cierre con conteo ciego,
-- mermas como COGS y no como gasto operativo, categorías de gasto estructuradas).

-- ==================== CAJAS (apertura/cierre por sede/día) ====================
create table cajas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  monto_apertura numeric(12, 2) not null,
  abierta_por uuid references personas (id),
  abierta_en timestamptz not null default now(),
  monto_cierre_contado numeric(12, 2),
  monto_cierre_esperado numeric(12, 2),
  diferencia numeric(12, 2),
  cerrada_por uuid references personas (id),
  cerrada_en timestamptz,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada'))
);

-- Una sede no puede tener dos cajas abiertas a la vez — se hace imposible en el
-- esquema, no se valida solo en el código (principio 2 del rol de arquitecto).
create unique index cajas_sede_abierta_unique on cajas (sede_id) where estado = 'abierta';
create index cajas_sede_id_idx on cajas (sede_id);

-- ==================== VENTAS (1 fila por checkout, no por prenda) ====================
create table ventas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  caja_id uuid not null references cajas (id),
  metodo_pago text not null check (metodo_pago in ('efectivo', 'pos', 'yape', 'transferencia')),
  monto_total numeric(12, 2) not null,
  usuario_id uuid references personas (id),
  nota text,
  created_at timestamptz not null default now()
);
create index ventas_caja_id_idx on ventas (caja_id);
create index ventas_sede_id_idx on ventas (sede_id);

-- ==================== GASTOS ====================
-- categoria es texto libre a nivel de esquema; la UI solo ofrece GASTO_CATEGORIAS
-- fijas (packages/shared/src/enums.ts). Todo gasto aquí es operativo por
-- definición — el COGS sale de variantes.costo × ventas, las mermas de
-- movimientos.motivo='merma'; nunca de una fila de Gastos.
create table gastos (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  categoria text not null,
  subtotal numeric(12, 2) not null default 0,
  igv numeric(12, 2) not null default 0,
  total numeric(12, 2) not null check (total > 0),
  especificacion text,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now()
);
create index gastos_sede_id_idx on gastos (sede_id);

-- ==================== RLS ====================
alter table cajas enable row level security;
alter table ventas enable row level security;
alter table gastos enable row level security;

create policy cajas_select_lider on cajas for select using (fn_es_lider());
create policy cajas_select_propia_sede on cajas for select using (sede_id = fn_sede_actual_persona());
create policy cajas_insert_propia_sede on cajas for insert
  with check (sede_id = fn_sede_actual_persona() or fn_es_lider());
create policy cajas_update_propia_sede on cajas for update
  using (sede_id = fn_sede_actual_persona() or fn_es_lider());

create policy ventas_select_lider on ventas for select using (fn_es_lider());
create policy ventas_select_propia_sede on ventas for select using (sede_id = fn_sede_actual_persona());
create policy ventas_insert_propia_sede on ventas for insert
  with check (sede_id = fn_sede_actual_persona() or fn_es_lider());

-- Gastos: solo Líder, igual que en CAYLA Inventario (Sheets) — mismo criterio que
-- ordenes_produccion_all_lider en 0003_rls.sql.
create policy gastos_all_lider on gastos for all
  using (fn_es_lider()) with check (fn_es_lider());

-- ==================== RPCs ====================

create or replace function abrir_caja(p_sede_id uuid, p_monto_apertura numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_caja_id uuid;
begin
  if exists (select 1 from cajas where sede_id = p_sede_id and estado = 'abierta') then
    raise exception 'Ya hay una caja abierta en esta sede — ciérrala antes de abrir otra';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into cajas (sede_id, monto_apertura, abierta_por)
    values (p_sede_id, p_monto_apertura, v_persona_id)
    returning id into v_caja_id;

  return v_caja_id;
end;
$$;

-- p_items: jsonb [{ "variante_id": uuid, "cantidad": int, "monto": numeric (precio unitario) }, ...]
-- Reutiliza fn_aplicar_movimiento (0002_functions.sql) para la validación de stock
-- suficiente y la actualización del snapshot — no se duplica esa lógica aquí.
create or replace function registrar_venta(
  p_caja_id uuid,
  p_metodo_pago text,
  p_items jsonb,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caja cajas%rowtype;
  v_persona_id uuid;
  v_venta_id uuid;
  v_movimiento_id uuid;
  v_monto_total numeric := 0;
  v_linea_total numeric;
  v_item jsonb;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada — no se pueden registrar más ventas ahí';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_monto_total := v_monto_total + (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
  end loop;

  insert into ventas (sede_id, caja_id, metodo_pago, monto_total, usuario_id, nota)
    values (v_caja.sede_id, p_caja_id, p_metodo_pago, v_monto_total, v_persona_id, p_nota)
    returning id into v_venta_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_linea_total := (v_item ->> 'monto')::numeric * (v_item ->> 'cantidad')::numeric;
    insert into movimientos (variante_id, sede_id, tipo, cantidad, motivo, canal, monto, venta_id, usuario_id)
      values (
        (v_item ->> 'variante_id')::uuid, v_caja.sede_id, 'salida',
        (v_item ->> 'cantidad')::integer, 'venta', 'tienda', v_linea_total, v_venta_id, v_persona_id
      )
      returning id into v_movimiento_id;
    perform fn_aplicar_movimiento(v_movimiento_id);
  end loop;

  return v_venta_id;
end;
$$;

-- Conteo ciego: el llamador manda p_monto_contado sin haber visto el esperado; el
-- esperado se calcula acá y recién en la respuesta se revela la diferencia.
create or replace function cerrar_caja(p_caja_id uuid, p_monto_contado numeric)
returns table (monto_esperado numeric, monto_contado numeric, diferencia numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_caja cajas%rowtype;
  v_esperado numeric;
begin
  select * into v_caja from cajas where id = p_caja_id;
  if not found then
    raise exception 'La caja % no existe', p_caja_id;
  end if;
  if v_caja.estado <> 'abierta' then
    raise exception 'Esta caja ya está cerrada';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- Solo el efectivo mueve el cajón físico; POS/Yape/Transferencia no afectan el conteo.
  select v_caja.monto_apertura + coalesce(sum(monto_total), 0) into v_esperado
    from ventas where caja_id = p_caja_id and metodo_pago = 'efectivo';

  update cajas set
    monto_cierre_contado = p_monto_contado,
    monto_cierre_esperado = v_esperado,
    diferencia = p_monto_contado - v_esperado,
    cerrada_por = v_persona_id,
    cerrada_en = now(),
    estado = 'cerrada'
  where id = p_caja_id;

  return query select v_esperado, p_monto_contado, p_monto_contado - v_esperado;
end;
$$;

create or replace function registrar_gasto(
  p_sede_id uuid,
  p_categoria text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_especificacion text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_gasto_id uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede registrar gastos';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into gastos (sede_id, categoria, subtotal, igv, total, especificacion, usuario_id)
    values (p_sede_id, p_categoria, p_subtotal, p_igv, p_total, p_especificacion, v_persona_id)
    returning id into v_gasto_id;

  return v_gasto_id;
end;
$$;
