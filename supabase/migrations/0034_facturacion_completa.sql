-- Fase 0 del plan de reemplazo de Alegra: cierra tres huecos legales que
-- 0032_comprobantes.sql dejó abiertos a propósito (esa migración solo cubría
-- boleta/factura). Confirmado con fuente primaria (Art. 2, RS 007-99/SUNAT y
-- Reglamento de Notas de Crédito/Débito, cpe.sunat.gob.pe):
--
-- 1. La proforma/nota de venta NO es un comprobante de pago — no está en la
--    lista taxativa del Art. 2. Vive en su propia tabla, nunca se "promociona"
--    con un UPDATE de estado: convertirla crea un comprobante NUEVO con su
--    propio número de serie, y la proforma solo queda anotada con cuál.
-- 2. Nota de Crédito/Débito solo puede emitirse referenciando un comprobante
--    original ACEPTADO por SUNAT — nunca uno pendiente, rechazado o inexistente.
--    Se hace cumplir con un trigger (no una CHECK constraint: Postgres no
--    permite subconsultas ahí) para que sea imposible incluso si algún día se
--    abre otro camino de escritura además de las RPC.
-- 3. Falta el tipo `nota_debito` en el check de `comprobantes.tipo` — hoy solo
--    admite boleta/factura/nota_credito.
--
-- Antes de agregar `emitir_nota`, se extrae a `fn_reservar_numero_serie` el
-- candado `for update` que ya usaba `emitir_comprobante` — la misma lógica
-- crítica (dos emisiones simultáneas no pueden llevarse el mismo número) se
-- iba a repetir en la función nueva, y una copia que se desincroniza de la
-- original es exactamente la clase de bug que costó ADR-0004 y ADR-0006. Se
-- refactoriza `emitir_comprobante` para usar el helper — mismo comportamiento,
-- una sola fuente de verdad.
--
-- CÓMO SE REVIERTE: `drop function crear_proforma, convertir_proforma_a_comprobante,
-- emitir_nota, fn_valida_nota_referencia_aceptada, fn_reservar_numero_serie;
-- drop trigger comprobantes_valida_nota_referencia on comprobantes; drop table
-- proformas; alter table comprobantes drop column comprobante_original_id, drop
-- column motivo;` y restaurar `emitir_comprobante`/el check de `tipo` a como
-- estaban en 0032. No hay borrado de datos reales: proforma y las columnas
-- nuevas nacen vacías.

-- ==================== helper: reserva atómica de número de serie ====================
create or replace function fn_reservar_numero_serie(p_sede_id uuid, p_tipo text)
returns table(serie text, numero integer)
language plpgsql
security definer
set search_path = public
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

-- ==================== emitir_comprobante: refactor sin cambio de comportamiento ====================
create or replace function emitir_comprobante(
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
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

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from fn_reservar_numero_serie(p_sede_id, p_tipo) r;

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

-- ==================== notas de crédito/débito ====================
alter table comprobantes drop constraint if exists comprobantes_tipo_check;
alter table comprobantes add constraint comprobantes_tipo_check
  check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito'));

-- `series_comprobantes` tiene su PROPIO check de tipo (0032) — se desincroniza
-- del de `comprobantes` si no se actualiza también: sin esto, una sede nunca
-- podría registrar una serie para nota_debito aunque `comprobantes` ya la
-- acepte. Encontrado probando esta migración en local antes de entregarla.
alter table series_comprobantes drop constraint if exists series_comprobantes_tipo_check;
alter table series_comprobantes add constraint series_comprobantes_tipo_check
  check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito'));

alter table comprobantes add column comprobante_original_id uuid references comprobantes (id);
alter table comprobantes add column motivo text;

-- Estado imposible por diseño (misma fila): una nota sin su comprobante
-- original y su motivo no puede existir en la base.
alter table comprobantes add constraint comprobantes_nota_requiere_original
  check (tipo not in ('nota_credito', 'nota_debito')
    or (comprobante_original_id is not null and motivo is not null));

-- Estado imposible por diseño (otra fila): una CHECK constraint no puede leer
-- otra fila, así que esto se hace cumplir con un trigger — no con la RPC
-- solamente, para que ningún camino de escritura futuro pueda saltárselo.
create or replace function fn_valida_nota_referencia_aceptada()
returns trigger
language plpgsql
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

drop trigger if exists comprobantes_valida_nota_referencia on comprobantes;
create trigger comprobantes_valida_nota_referencia
  before insert on comprobantes
  for each row execute function fn_valida_nota_referencia_aceptada();

create or replace function emitir_nota(
  p_comprobante_original_id uuid,
  p_tipo text,
  p_motivo text,
  p_subtotal numeric,
  p_igv numeric,
  p_total numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
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
  if not fn_puede_operar_sede(v_original.sede_id) then
    raise exception 'No tienes permiso para emitir notas de esa sede';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  select r.serie, r.numero into v_serie, v_numero from fn_reservar_numero_serie(v_original.sede_id, p_tipo) r;

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
create table proformas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  cliente_nombre text,
  cliente_num_doc text,
  items jsonb not null,
  subtotal numeric(12, 2) not null default 0,
  igv numeric(12, 2) not null default 0,
  total numeric(12, 2) not null check (total > 0),
  estado text not null default 'vigente' check (estado in ('vigente', 'convertida', 'vencida', 'anulada')),
  -- Se llena SOLO al convertir (trazabilidad), nunca a mano: la proforma nunca
  -- "se vuelve" un comprobante por UPDATE, esto solo anota cuál nació de ella.
  comprobante_id uuid references comprobantes (id),
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now(),
  vence_at timestamptz
);
create index proformas_sede_id_idx on proformas (sede_id);

alter table proformas enable row level security;
create policy proformas_select on proformas
  for select using (fn_es_lider() or fn_puede_operar_sede(sede_id));

create or replace function crear_proforma(
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_persona_id uuid;
  v_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para crear proformas en esa sede';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total de la proforma debe ser mayor a 0';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La proforma no tiene ítems';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  insert into proformas (sede_id, cliente_nombre, cliente_num_doc, items, subtotal, igv, total, usuario_id, vence_at)
    values (p_sede_id, p_cliente_nombre, p_cliente_num_doc, p_items, p_subtotal, p_igv, p_total, v_persona_id, p_vence_at)
    returning id into v_id;

  return v_id;
end;
$$;

create or replace function convertir_proforma_a_comprobante(
  p_proforma_id uuid,
  p_tipo text,
  p_venta_id uuid default null,
  p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null,
  p_cliente_nombre text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
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
  if not fn_puede_operar_sede(v_proforma.sede_id) then
    raise exception 'No tienes permiso para convertir proformas de esa sede';
  end if;

  v_comprobante_id := emitir_comprobante(
    v_proforma.sede_id, p_tipo, v_proforma.subtotal, v_proforma.igv, v_proforma.total,
    p_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, coalesce(p_cliente_nombre, v_proforma.cliente_nombre)
  );

  update proformas set estado = 'convertida', comprobante_id = v_comprobante_id where id = p_proforma_id;

  return v_comprobante_id;
end;
$$;
