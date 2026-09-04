-- Fase F3 (parte 1 de 2): estructura de comprobantes electrónicos (boleta/factura).
--
-- Deliberadamente NO incluye el envío a SUNAT (firma XML UBL 2.1, SOAP, CDR):
-- esa parte depende de una decisión pendiente con Felipe — SEE del Contribuyente
-- (hablarle directo al webservice de SUNAT, requiere certificado digital propio y
-- homologación) vs. un OSE ya homologado (Nubefact y similares, integración por
-- REST). Lo de aquí es la parte que NO cambia sin importar esa decisión: el
-- correlativo por serie es responsabilidad nuestra siempre, lo transmita quien lo
-- transmita — por eso se construye ya, y se degrada bien si SUNAT no responde
-- (principio 9): el comprobante queda reservado con su número ANTES de intentar
-- transmitirlo, nunca al revés.

-- ==================== SERIES (una por sede + tipo, la asigna SUNAT al Líder) ====================
create table series_comprobantes (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references sedes (id),
  tipo text not null check (tipo in ('boleta', 'factura', 'nota_credito')),
  serie text not null,
  siguiente_numero integer not null default 1 check (siguiente_numero > 0),
  unique (sede_id, tipo)
);

-- ==================== COMPROBANTES ====================
create table comprobantes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references ventas (id),
  sede_id uuid not null references sedes (id),
  tipo text not null check (tipo in ('boleta', 'factura', 'nota_credito')),
  serie text not null,
  numero integer not null,
  cliente_tipo_doc text not null default 'sin_documento' check (cliente_tipo_doc in ('dni', 'ruc', 'sin_documento')),
  cliente_num_doc text,
  cliente_nombre text,
  moneda text not null default 'PEN',
  subtotal numeric(12, 2) not null default 0,
  igv numeric(12, 2) not null default 0,
  total numeric(12, 2) not null check (total > 0),
  -- Estado imposible por diseño: una factura sin RUC no puede existir en la
  -- base, no solo se valida en el formulario (principio 2 / principio 4).
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado')),
  motivo_rechazo text,
  respuesta_sunat jsonb,
  usuario_id uuid references personas (id),
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  constraint comprobantes_factura_requiere_ruc
    check (tipo <> 'factura' or (cliente_tipo_doc = 'ruc' and cliente_num_doc is not null)),
  unique (tipo, serie, numero)
);
create index comprobantes_sede_id_idx on comprobantes (sede_id);
create index comprobantes_venta_id_idx on comprobantes (venta_id);
create index comprobantes_estado_idx on comprobantes (estado);

-- ==================== RLS ====================
alter table series_comprobantes enable row level security;
alter table comprobantes enable row level security;

create policy series_comprobantes_select on series_comprobantes
  for select using (fn_es_lider() or fn_puede_operar_sede(sede_id));

create policy comprobantes_select on comprobantes
  for select using (fn_es_lider() or fn_puede_operar_sede(sede_id));

-- Sin política insert/update/delete para clientes: igual que `asientos`, el
-- único camino de escritura es la RPC security definer de abajo.

-- ==================== RPC: reserva el comprobante (no llama a SUNAT todavía) ====================
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
  v_serie_id uuid;
  v_serie text;
  v_numero integer;
  v_id uuid;
begin
  if not fn_puede_operar_sede(p_sede_id) then
    raise exception 'No tienes permiso para emitir comprobantes de esa sede';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;
  if p_total is null or p_total <= 0 then
    raise exception 'El total del comprobante debe ser mayor a 0';
  end if;
  if p_tipo = 'factura' and (p_cliente_tipo_doc <> 'ruc' or p_cliente_num_doc is null) then
    raise exception 'Una factura requiere el RUC del cliente';
  end if;

  select id into v_persona_id from personas where auth_user_id = auth.uid();

  -- `for update`: dos emisiones simultáneas en la misma sede+tipo no pueden
  -- llevarse el mismo número — mismo candado que usa fn_aplicar_movimiento
  -- contra la condición de carrera del stock.
  select id, serie into v_serie_id, v_serie
    from series_comprobantes
    where sede_id = p_sede_id and tipo = p_tipo
    for update;

  if v_serie_id is null then
    raise exception 'Esta sede no tiene serie asignada para %. Regístrala en Finanzas > Facturación.', p_tipo;
  end if;

  update series_comprobantes set siguiente_numero = siguiente_numero + 1
    where id = v_serie_id
    returning siguiente_numero - 1 into v_numero;

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
create or replace function registrar_serie_comprobante(
  p_sede_id uuid,
  p_tipo text,
  p_serie text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un Líder puede registrar series de comprobantes';
  end if;
  if p_tipo not in ('boleta', 'factura', 'nota_credito') then
    raise exception 'Tipo de comprobante inválido: %', p_tipo;
  end if;

  insert into series_comprobantes (sede_id, tipo, serie)
    values (p_sede_id, p_tipo, upper(p_serie))
  on conflict (sede_id, tipo) do update set serie = excluded.serie
  returning id into v_id;

  return v_id;
end;
$$;
