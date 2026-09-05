-- ============================================================================
-- FACTURACIÓN COMPLETA · base (0032) + proforma + NC/ND + nota_debito
-- Correr en cayla-DYNAMIC. Solo toca `retail`.
--
-- Autocontenido a propósito: no se encontró evidencia de que
-- `0032_comprobantes.sql` (Parte 1 del ADR-0005) se haya pegado antes en
-- producción — ningún archivo de `supabase/unificacion/` crea
-- `retail.comprobantes`/`retail.series_comprobantes`. Todo usa
-- `if not exists`/`create or replace`, así que este script es seguro de
-- correr sin importar si esa base ya estaba o no: si estaba, solo agrega lo
-- nuevo; si no estaba, la crea completa de una vez.
--
-- Ver docs/adr/0005-facturacion-electronica-parte-en-dos.md (la base) y
-- docs/adr/0007-facturacion-esquema-legal-completo.md (proforma + NC/ND) para
-- el razonamiento completo.
-- ============================================================================

-- ==================== SERIES (una por sede + tipo) ====================
create table if not exists retail.series_comprobantes (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  tipo text not null check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito')),
  serie text not null,
  siguiente_numero integer not null default 1 check (siguiente_numero > 0),
  unique (sede_id, tipo)
);

-- ==================== COMPROBANTES ====================
create table if not exists retail.comprobantes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references retail.ventas (id),
  sede_id uuid not null references public.sedes (id),
  tipo text not null,
  serie text not null,
  numero integer not null,
  cliente_tipo_doc text not null default 'sin_documento' check (cliente_tipo_doc in ('dni', 'ruc', 'sin_documento')),
  cliente_num_doc text,
  cliente_nombre text,
  moneda text not null default 'PEN',
  subtotal numeric(12, 2) not null default 0,
  igv numeric(12, 2) not null default 0,
  total numeric(12, 2) not null check (total > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado')),
  motivo_rechazo text,
  respuesta_sunat jsonb,
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  -- Estado imposible por diseño: una factura sin RUC no puede existir en la
  -- base, no solo se valida en el formulario.
  comprobante_original_id uuid references retail.comprobantes (id),
  motivo text,
  unique (tipo, serie, numero)
);
create index if not exists comprobantes_sede_id_idx on retail.comprobantes (sede_id);
create index if not exists comprobantes_venta_id_idx on retail.comprobantes (venta_id);
create index if not exists comprobantes_estado_idx on retail.comprobantes (estado);

-- Se agregan/rehacen como constraints separadas (no en el CREATE) para que el
-- script sea el mismo sin importar si la tabla ya existía con una versión
-- vieja del check (0032 solo admitía boleta/factura/nota_credito).
alter table retail.comprobantes drop constraint if exists comprobantes_tipo_check;
alter table retail.comprobantes add constraint comprobantes_tipo_check
  check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito'));

alter table retail.series_comprobantes drop constraint if exists series_comprobantes_tipo_check;
alter table retail.series_comprobantes add constraint series_comprobantes_tipo_check
  check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito'));

alter table retail.comprobantes drop constraint if exists comprobantes_factura_requiere_ruc;
alter table retail.comprobantes add constraint comprobantes_factura_requiere_ruc
  check (tipo <> 'factura' or (cliente_tipo_doc = 'ruc' and cliente_num_doc is not null));

-- Estado imposible por diseño (misma fila): una nota sin su comprobante
-- original y su motivo no puede existir en la base.
alter table retail.comprobantes drop constraint if exists comprobantes_nota_requiere_original;
alter table retail.comprobantes add constraint comprobantes_nota_requiere_original
  check (tipo not in ('nota_credito', 'nota_debito')
    or (comprobante_original_id is not null and motivo is not null));

-- ==================== RLS ====================
alter table retail.series_comprobantes enable row level security;
alter table retail.comprobantes enable row level security;

drop policy if exists series_comprobantes_select on retail.series_comprobantes;
create policy series_comprobantes_select on retail.series_comprobantes
  for select using (retail.es_lider() or retail.puede_operar_sede(sede_id));

drop policy if exists comprobantes_select on retail.comprobantes;
create policy comprobantes_select on retail.comprobantes
  for select using (retail.es_lider() or retail.puede_operar_sede(sede_id));

-- Sin política insert/update/delete para clientes: el único camino de
-- escritura es la RPC security definer de abajo.

-- ==================== helper: reserva atómica de número de serie ====================
create or replace function retail.fn_reservar_numero_serie(p_sede_id uuid, p_tipo text)
returns table(serie text, numero integer)
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_serie_id uuid;
  v_serie text;
  v_numero integer;
begin
  select id, series_comprobantes.serie into v_serie_id, v_serie
    from series_comprobantes
    where sede_id = p_sede_id and tipo = p_tipo
    for update;

  if v_serie_id is null then
    raise exception 'Esta sede no tiene serie asignada para %. Regístrala en Finanzas > Facturación.', p_tipo;
  end if;

  update series_comprobantes set siguiente_numero = siguiente_numero + 1
    where id = v_serie_id
    returning siguiente_numero - 1 into v_numero;

  return query select v_serie, v_numero;
end;
$$;

-- ==================== RPC: reserva el comprobante (no llama a SUNAT todavía) ====================
create or replace function retail.emitir_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_venta_id uuid default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null
)
returns uuid
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para emitir comprobantes de esa sede';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total del comprobante debe ser mayor a 0';
  end if;
  if p_tipo = 'factura' and (p_cliente_tipo_doc <> 'ruc' or p_cliente_num_doc is null) then
    raise exception 'Una factura requiere el RUC del cliente';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from retail.fn_reservar_numero_serie(p_sede_id, p_tipo) r;

  insert into comprobantes (
    venta_id, sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
    cliente_nombre, subtotal, igv, total, usuario_id
  ) values (
    p_venta_id, p_sede_id, p_tipo, v_serie, v_numero, p_cliente_tipo_doc, p_cliente_num_doc,
    p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona_id
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ==================== RPC: registrar/actualizar la serie de una sede (solo Líder) ====================
create or replace function retail.registrar_serie_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_serie text
)
returns uuid
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_id uuid;
begin
  if not retail.es_lider() then
    raise exception 'Solo un Líder puede registrar series de comprobantes';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito', 'nota_debito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;

  insert into series_comprobantes (sede_id, tipo, serie)
    values (p_sede_id, p_tipo, upper(p_serie))
  on conflict (sede_id, tipo) do update set serie = excluded.serie
  returning id into v_id;

  return v_id;
end;
$$;

-- ==================== notas de crédito/débito ====================
-- Estado imposible por diseño (otra fila): una CHECK constraint no puede leer
-- otra fila, así que esto se hace cumplir con un trigger — no con la RPC
-- solamente, para que ningún camino de escritura futuro pueda saltárselo.
create or replace function retail.fn_valida_nota_referencia_aceptada()
returns trigger
language plpgsql set search_path = retail, public
as $$
declare
  v_estado_original text;
begin
  if new.tipo in ('nota_credito', 'nota_debito') then
    select estado into v_estado_original from comprobantes where id = new.comprobante_original_id;
    if v_estado_original is distinct from 'aceptado' then
      raise exception 'No se puede emitir una nota sobre un comprobante que no está aceptado por SUNAT (estado: %)',
        coalesce(v_estado_original, 'no existe');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comprobantes_valida_nota_referencia on retail.comprobantes;
create trigger comprobantes_valida_nota_referencia
  before insert on retail.comprobantes
  for each row execute function retail.fn_valida_nota_referencia_aceptada();

create or replace function retail.emitir_nota(
  p_comprobante_original_id uuid,
  p_tipo text,
  p_motivo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric
)
returns uuid
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_original comprobantes%rowtype;
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
begin
  if p_tipo not in ('nota_credito', 'nota_debito') then
    raise exception 'Tipo de nota inválido: %', p_tipo;
  end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'La nota requiere un motivo';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total de la nota debe ser mayor a 0';
  end if;

  select * into v_original from comprobantes where id = p_comprobante_original_id;
  if not found then
    raise exception 'El comprobante original % no existe', p_comprobante_original_id;
  end if;
  if v_original.estado <> 'aceptado' then
    raise exception 'El comprobante original debe estar aceptado por SUNAT (estado actual: %)', v_original.estado;
  end if;
  if not retail.puede_operar_sede(v_original.sede_id) then
    raise exception 'No tienes permiso para emitir notas de esa sede';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from retail.fn_reservar_numero_serie(v_original.sede_id, p_tipo) r;

  insert into comprobantes (
    venta_id, sede_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
    subtotal, igv, total, usuario_id, comprobante_original_id, motivo
  ) values (
    v_original.venta_id, v_original.sede_id, p_tipo, v_serie, v_numero,
    v_original.cliente_tipo_doc, v_original.cliente_num_doc, v_original.cliente_nombre,
    p_subtotal, p_igv, p_total, v_persona_id, p_comprobante_original_id, p_motivo
  ) returning id into v_id;

  return v_id;
end;
$$;

-- ==================== proformas: documento pre-fiscal, separado a propósito ====================
create table if not exists retail.proformas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  cliente_nombre text,
  cliente_num_doc text,
  items jsonb not null,
  subtotal numeric(12, 2) not null default 0,
  igv numeric(12, 2) not null default 0,
  total numeric(12, 2) not null check (total > 0),
  estado text not null default 'vigente' check (estado in ('vigente', 'convertida', 'vencida', 'anulada')),
  -- Se llena SOLO al convertir (trazabilidad), nunca a mano: la proforma nunca
  -- "se vuelve" un comprobante por UPDATE, esto solo anota cuál nació de ella.
  comprobante_id uuid references retail.comprobantes (id),
  usuario_id uuid references public.personas (id),
  created_at timestamptz not null default now(),
  vence_at timestamptz
);
create index if not exists proformas_sede_id_idx on retail.proformas (sede_id);

alter table retail.proformas enable row level security;
drop policy if exists proformas_select on retail.proformas;
create policy proformas_select on retail.proformas
  for select using (retail.es_lider() or retail.puede_operar_sede(sede_id));

create or replace function retail.crear_proforma(
  p_sede_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric,
  p_cliente_nombre text default null,
  p_cliente_num_doc text default null,
  p_vence_at timestamptz default null
)
returns uuid
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_persona_id uuid;
  v_id uuid;
begin
  if not retail.puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para crear proformas en esa sede';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total de la proforma debe ser mayor a 0';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La proforma no tiene ítems';
  end if;

  select id into v_persona_id from public.personas where auth_user_id = auth.uid();

  insert into proformas (sede_id, cliente_nombre, cliente_num_doc, items, subtotal, igv, total, usuario_id, vence_at)
    values (p_sede_id, p_cliente_nombre, p_cliente_num_doc, p_items, p_subtotal, p_igv, p_total, v_persona_id, p_vence_at)
    returning id into v_id;

  return v_id;
end;
$$;

create or replace function retail.convertir_proforma_a_comprobante(
  p_proforma_id uuid,
  p_tipo text,
  p_venta_id uuid default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null
)
returns uuid
language plpgsql security definer set search_path = retail, public
as $$
declare
  v_proforma proformas%rowtype;
  v_comprobante_id uuid;
begin
  select * into v_proforma from proformas where id = p_proforma_id for update;
  if not found then
    raise exception 'La proforma % no existe', p_proforma_id;
  end if;
  if v_proforma.estado <> 'vigente' then
    raise exception 'Esta proforma ya no está vigente (estado: %)', v_proforma.estado;
  end if;
  if not retail.puede_operar_sede(v_proforma.sede_id) then
    raise exception 'No tienes permiso para convertir proformas de esa sede';
  end if;

  v_comprobante_id := retail.emitir_comprobante(
    v_proforma.sede_id, p_tipo, v_proforma.subtotal, v_proforma.igv, v_proforma.total,
    p_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, coalesce(p_cliente_nombre, v_proforma.cliente_nombre)
  );

  update proformas set estado = 'convertida', comprobante_id = v_comprobante_id where id = p_proforma_id;

  return v_comprobante_id;
end;
$$;

-- ============================================================================
-- VERIFICACIÓN (correr a mano después de pegar todo lo de arriba)
-- ============================================================================
-- 1. select proname from pg_proc where pronamespace = 'retail'::regnamespace
--      and proname in ('emitir_comprobante','emitir_nota','crear_proforma',
--        'convertir_proforma_a_comprobante','fn_reservar_numero_serie',
--        'registrar_serie_comprobante');
--    -- deben salir las 6.
-- 2. select table_name from information_schema.tables where table_schema='retail'
--      and table_name in ('comprobantes','series_comprobantes','proformas');
--    -- deben salir las 3.
-- 3. Registrar al menos una serie de prueba y emitir una boleta de prueba
--    (reemplaza <sede_id> por un id real de TRU/AQP/LIM):
--    select retail.registrar_serie_comprobante('<sede_id>', 'boleta', 'B001');
--    select retail.emitir_comprobante('<sede_id>', 'boleta', 100, 18, 118);
-- ============================================================================
