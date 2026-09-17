-- ============================================================================
-- 0010_facturacion.sql — CAYLA V2
--
-- Rescate de Facturación/SUNAT desde producción (2026-09-12). No es una
-- reconstrucción desde cero: es el mismo modelo que ya emite documentos
-- reales ante SUNAT hoy (boletas B004 de Tienda Trujillo, Lucode como
-- PSE), consolidado en una sola migración en vez del historial de 7
-- migraciones incrementales de producción (0032, 0034, 0037-0041) —
-- misma filosofía de "baseline limpio" que 0001-0008. Cada regla de
-- negocio de abajo está verificada contra el código y los comentarios
-- reales de esas 7 migraciones, no reinventada.
--
-- CAMBIA respecto a producción: `sede_id` → `ubicacion_id` (retail sigue
-- siendo dueño de sus propias ubicaciones — ver 0009); `usuario_id`/
-- `anulado_por` → references public.personas(id) (igual que el resto del
-- esquema desde 0009: la identidad la resuelve Dynamic, no una copia
-- local); `sede_datos_fiscales` → `ubicacion_datos_fiscales` (consistencia
-- de nombres con el resto de V2). `configuracion_empresa` y
-- `sede_datos_fiscales` nunca tuvieron una migración propia en ningún
-- repo — existían solo creadas a mano en Supabase Studio; esta es su
-- primera definición real.
--
-- NO CAMBIA: nombres de tabla/función/columna, tipos de comprobante,
-- máquina de estados, ni ninguna restricción de negocio — se preservan
-- verbatim porque son las reglas que ya sostienen documentos legales
-- reales.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- series y correlativos ----------
create table retail.series_comprobantes (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  tipo text not null check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito')),
  serie text not null,
  siguiente_numero integer not null default 1 check (siguiente_numero > 0),
  unique (ubicacion_id, tipo)
);

-- ---------- comprobantes ----------
create table retail.comprobantes (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references retail.ventas(id),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  tipo text not null check (tipo in ('boleta', 'factura', 'nota_credito', 'nota_debito')),
  serie text not null,
  numero integer not null,
  cliente_tipo_doc text not null default 'sin_documento' check (cliente_tipo_doc in ('dni', 'ruc', 'sin_documento')),
  cliente_num_doc text,
  cliente_nombre text,
  moneda text not null default 'PEN',
  subtotal numeric(12,2) not null default 0,
  igv numeric(12,2) not null default 0,
  total numeric(12,2) not null check (total > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'aceptado', 'rechazado', 'anulado')),
  motivo_rechazo text,
  respuesta_sunat jsonb,
  usuario_id uuid references public.personas(id),
  created_at timestamptz not null default now(),
  enviado_at timestamptz,
  comprobante_original_id uuid references retail.comprobantes(id),
  motivo text,
  items jsonb,
  entorno_transmision text check (entorno_transmision in ('sandbox', 'produccion')),
  motivo_anulacion text,
  anulacion_solicitada_at timestamptz,
  anulado_at timestamptz,
  respuesta_anulacion jsonb,
  anulado_por uuid references public.personas(id),
  -- Una factura sin RUC es un estado imposible del esquema, no una
  -- validación de formulario (0032).
  constraint comprobantes_factura_requiere_ruc
    check (tipo <> 'factura' or (cliente_tipo_doc = 'ruc' and cliente_num_doc is not null)),
  -- Una NC/ND siempre referencia el comprobante que corrige, con motivo
  -- (0034) — la aceptación del original la valida el trigger de abajo,
  -- porque un CHECK no puede consultar otra fila.
  constraint comprobantes_nota_requiere_original
    check (tipo not in ('nota_credito', 'nota_debito') or (comprobante_original_id is not null and motivo is not null)),
  -- Nacida NOT VALID a propósito (0040): producción ya tenía una boleta
  -- transmitida antes de que esta columna existiera — su entorno es
  -- genuinamente desconocido, y la migración no adivina.
  constraint comprobantes_transmitido_tiene_entorno
    check (estado = 'pendiente' or entorno_transmision is not null) not valid,
  -- Igual de intencional (0041): ya había una anulación real antes de
  -- este constraint.
  constraint comprobantes_anulado_tiene_motivo
    check (estado <> 'anulado' or motivo_anulacion is not null) not valid,
  -- El correlativo es responsabilidad nuestra sin importar quién
  -- transmite — se reserva antes de intentar transmitir, nunca al revés
  -- (0032). Esto es lo que error-escritura.ts traduce como
  -- "Ese número de comprobante ya está usado."
  unique (tipo, serie, numero)
);
create index comprobantes_ubicacion_id_idx on retail.comprobantes (ubicacion_id);
create index comprobantes_venta_id_idx on retail.comprobantes (venta_id);
create index comprobantes_estado_idx on retail.comprobantes (estado);

-- Una NC/ND solo puede referenciar un comprobante ya aceptado — un CHECK
-- no puede consultar otra fila, así que es un trigger (0034).
create function retail.fn_valida_nota_referencia_aceptada() returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
declare v_estado text;
begin
  if new.tipo in ('nota_credito', 'nota_debito') then
    select estado into v_estado from comprobantes where id = new.comprobante_original_id;
    if v_estado is distinct from 'aceptado' then
      raise exception 'Solo se puede emitir una nota sobre un comprobante ya aceptado por SUNAT';
    end if;
  end if;
  return new;
end;
$$;
create trigger comprobantes_valida_nota_referencia before insert on retail.comprobantes
  for each row execute function retail.fn_valida_nota_referencia_aceptada();

-- ---------- proformas (cotización — nunca un comprobante tributario, 0034) ----------
create table retail.proformas (
  id uuid primary key default gen_random_uuid(),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  cliente_nombre text,
  cliente_num_doc text,
  items jsonb not null,
  subtotal numeric(12,2) not null default 0,
  igv numeric(12,2) not null default 0,
  total numeric(12,2) not null check (total > 0),
  estado text not null default 'vigente' check (estado in ('vigente', 'convertida', 'vencida', 'anulada')),
  comprobante_id uuid references retail.comprobantes(id),
  usuario_id uuid references public.personas(id),
  created_at timestamptz not null default now(),
  vence_at timestamptz
);
create index proformas_ubicacion_id_idx on retail.proformas (ubicacion_id);

-- ---------- identidad fiscal de CAYLA — primera vez con migración real ----------
create table retail.configuracion_empresa (
  id boolean primary key default true,
  ruc text not null,
  razon_social text not null,
  nombre_comercial text,
  email text,
  web text,
  telefono text,
  resolucion_autorizacion text,
  updated_at timestamptz not null default now(),
  constraint configuracion_empresa_id_check check (id)
);

create table retail.ubicacion_datos_fiscales (
  ubicacion_id uuid primary key references retail.ubicaciones(id),
  direccion text,
  ubigeo text,
  departamento text,
  provincia text,
  distrito text,
  telefono text,
  updated_at timestamptz not null default now()
);

-- ---------- RPCs ----------
create function retail.fn_reservar_numero_serie(p_ubicacion_id uuid, p_tipo text)
returns table (serie text, numero integer)
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_serie text; v_numero integer;
begin
  select sc.serie, sc.siguiente_numero into v_serie, v_numero
    from series_comprobantes sc where sc.ubicacion_id = p_ubicacion_id and sc.tipo = p_tipo
    for update;
  if not found then
    raise exception 'No hay una serie registrada para % en esta ubicación', p_tipo;
  end if;
  update series_comprobantes set siguiente_numero = v_numero + 1
    where ubicacion_id = p_ubicacion_id and tipo = p_tipo;
  return query select v_serie, v_numero;
end;
$$;

create function retail.registrar_serie_comprobante(
  p_ubicacion_id uuid, p_tipo text, p_serie text, p_siguiente_numero integer default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_actual integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede registrar una serie de comprobantes';
  end if;
  select siguiente_numero into v_actual from series_comprobantes
    where ubicacion_id = p_ubicacion_id and tipo = p_tipo;
  if v_actual is not null and p_siguiente_numero is not null and p_siguiente_numero < v_actual then
    raise exception 'No puedes retroceder el correlativo: va en % y pediste %', v_actual, p_siguiente_numero;
  end if;
  insert into series_comprobantes (ubicacion_id, tipo, serie, siguiente_numero)
    values (p_ubicacion_id, p_tipo, p_serie, coalesce(p_siguiente_numero, 1))
    on conflict (ubicacion_id, tipo) do update
      set serie = excluded.serie, siguiente_numero = coalesce(p_siguiente_numero, series_comprobantes.siguiente_numero)
    returning id into v_id;
  return v_id;
end;
$$;

create function retail.emitir_comprobante(
  p_ubicacion_id uuid, p_tipo text, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_venta_id uuid default null, p_cliente_tipo_doc text default 'sin_documento',
  p_cliente_num_doc text default null, p_cliente_nombre text default null,
  p_items jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_serie text; v_numero integer; v_id uuid; v_persona uuid; v_items jsonb;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para emitir comprobantes en esa ubicación';
  end if;
  select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(p_ubicacion_id, p_tipo);
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  -- Lucode necesita el detalle por línea; si no llega, se sintetiza UNA
  -- línea genérica con el subtotal real — sigue siendo verdad contable,
  -- solo no desglosada por SKU (0037).
  v_items := coalesce(p_items, jsonb_build_array(jsonb_build_object('descripcion', 'Venta de mercadería', 'cantidad', 1, 'precio_unitario', p_subtotal)));
  insert into comprobantes (venta_id, ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc,
    cliente_nombre, subtotal, igv, total, usuario_id, items)
    values (p_venta_id, p_ubicacion_id, p_tipo, v_serie, v_numero, p_cliente_tipo_doc, p_cliente_num_doc,
      p_cliente_nombre, p_subtotal, p_igv, p_total, v_persona, v_items)
    returning id into v_id;
  return v_id;
end;
$$;

create function retail.emitir_nota(
  p_comprobante_original_id uuid, p_tipo text, p_motivo text,
  p_subtotal numeric, p_igv numeric, p_total numeric, p_items jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_original comprobantes%rowtype; v_serie text; v_numero integer; v_id uuid; v_persona uuid; v_items jsonb;
begin
  select * into v_original from comprobantes where id = p_comprobante_original_id;
  if not found then
    raise exception 'El comprobante original % no existe', p_comprobante_original_id;
  end if;
  if not fn_puede_operar_ubicacion(v_original.ubicacion_id) then
    raise exception 'No tienes permiso para emitir notas en esa ubicación';
  end if;
  select serie, numero into v_serie, v_numero from fn_reservar_numero_serie(v_original.ubicacion_id, p_tipo);
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  v_items := coalesce(p_items, v_original.items);
  insert into comprobantes (ubicacion_id, tipo, serie, numero, cliente_tipo_doc, cliente_num_doc, cliente_nombre,
    subtotal, igv, total, usuario_id, comprobante_original_id, motivo, items)
    values (v_original.ubicacion_id, p_tipo, v_serie, v_numero, v_original.cliente_tipo_doc, v_original.cliente_num_doc,
      v_original.cliente_nombre, p_subtotal, p_igv, p_total, v_persona, p_comprobante_original_id, p_motivo, v_items)
    returning id into v_id;
  return v_id;
end;
$$;

create function retail.actualizar_transmision_comprobante(
  p_comprobante_id uuid, p_estado text, p_entorno text,
  p_respuesta_sunat jsonb default null, p_motivo_rechazo text default null
) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_ubicacion_id uuid;
begin
  select ubicacion_id into v_ubicacion_id from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if not fn_puede_operar_ubicacion(v_ubicacion_id) then
    raise exception 'No tienes permiso para actualizar ese comprobante';
  end if;
  if p_estado not in ('enviado', 'aceptado', 'rechazado') then
    raise exception 'actualizar_transmision_comprobante no maneja el estado % — anular_comprobante() es aparte', p_estado;
  end if;
  update comprobantes set
    estado = p_estado,
    entorno_transmision = p_entorno,
    respuesta_sunat = coalesce(p_respuesta_sunat, respuesta_sunat),
    motivo_rechazo = p_motivo_rechazo,
    enviado_at = coalesce(enviado_at, now())
  where id = p_comprobante_id;
end;
$$;

create function retail.anular_comprobante(
  p_comprobante_id uuid, p_motivo text, p_confirmada boolean, p_respuesta jsonb default null
) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_comp comprobantes%rowtype; v_persona uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede anular un comprobante — es irreversible ante SUNAT';
  end if;
  select * into v_comp from comprobantes where id = p_comprobante_id;
  if not found then
    raise exception 'El comprobante % no existe', p_comprobante_id;
  end if;
  if v_comp.estado <> 'aceptado' then
    raise exception 'Solo se puede anular un comprobante aceptado por SUNAT (este está %)', v_comp.estado;
  end if;
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'El motivo de anulación es obligatorio';
  end if;
  if exists (
    select 1 from comprobantes where comprobante_original_id = p_comprobante_id and estado <> 'anulado'
  ) then
    raise exception 'Este comprobante tiene una nota de crédito/débito vigente — resuélvela antes de anularlo';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  update comprobantes set
    motivo_anulacion = p_motivo,
    anulacion_solicitada_at = coalesce(anulacion_solicitada_at, now()),
    respuesta_anulacion = coalesce(p_respuesta, respuesta_anulacion),
    anulado_por = v_persona,
    estado = case when p_confirmada then 'anulado' else estado end,
    anulado_at = case when p_confirmada then now() else anulado_at end
  where id = p_comprobante_id;
end;
$$;

create function retail.crear_proforma(
  p_ubicacion_id uuid, p_items jsonb, p_subtotal numeric, p_igv numeric, p_total numeric,
  p_cliente_nombre text default null, p_cliente_num_doc text default null, p_vence_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_id uuid; v_persona uuid;
begin
  if not fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para crear proformas en esa ubicación';
  end if;
  select id into v_persona from public.personas where auth_user_id = auth.uid();
  insert into proformas (ubicacion_id, items, subtotal, igv, total, cliente_nombre, cliente_num_doc, usuario_id, vence_at)
    values (p_ubicacion_id, p_items, p_subtotal, p_igv, p_total, p_cliente_nombre, p_cliente_num_doc, v_persona, p_vence_at)
    returning id into v_id;
  return v_id;
end;
$$;

create function retail.convertir_proforma_a_comprobante(
  p_proforma_id uuid, p_tipo text, p_venta_id uuid default null,
  p_cliente_tipo_doc text default 'sin_documento', p_cliente_num_doc text default null,
  p_cliente_nombre text default null
) returns uuid
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_proforma proformas%rowtype; v_comprobante_id uuid;
begin
  select * into v_proforma from proformas where id = p_proforma_id;
  if not found then
    raise exception 'La proforma % no existe', p_proforma_id;
  end if;
  if not fn_puede_operar_ubicacion(v_proforma.ubicacion_id) then
    raise exception 'No tienes permiso para convertir proformas en esa ubicación';
  end if;
  if v_proforma.estado <> 'vigente' then
    raise exception 'Esta proforma ya no está vigente (%)', v_proforma.estado;
  end if;
  -- Nunca se hace UPDATE del estado tributario de la proforma en sí — una
  -- proforma no es un comprobante (Art. 2, RS 007-99/SUNAT); convertir
  -- siempre INSERTA un comprobante nuevo con su propia serie/número
  -- (0034). Se reenvían los items reales de la proforma — a diferencia
  -- de producción, que los perdía y caía siempre al genérico (bug
  -- confirmado leyendo el código real; se corrige acá de una vez).
  v_comprobante_id := emitir_comprobante(
    v_proforma.ubicacion_id, p_tipo, v_proforma.subtotal, v_proforma.igv, v_proforma.total,
    p_venta_id, p_cliente_tipo_doc, p_cliente_num_doc, p_cliente_nombre, v_proforma.items
  );
  update proformas set estado = 'convertida', comprobante_id = v_comprobante_id where id = p_proforma_id;
  return v_comprobante_id;
end;
$$;

-- ---------- RLS: solo lectura, toda escritura pasa por las RPC de arriba ----------
alter table retail.series_comprobantes enable row level security;
create policy series_comprobantes_select on retail.series_comprobantes for select
  using (retail.fn_es_lider() or retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.comprobantes enable row level security;
create policy comprobantes_select on retail.comprobantes for select
  using (retail.fn_es_lider() or retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.proformas enable row level security;
create policy proformas_select on retail.proformas for select
  using (retail.fn_es_lider() or retail.fn_puede_operar_ubicacion(ubicacion_id));

alter table retail.configuracion_empresa enable row level security;
create policy configuracion_empresa_select on retail.configuracion_empresa for select
  using (auth.role() = 'authenticated');

alter table retail.ubicacion_datos_fiscales enable row level security;
create policy ubicacion_datos_fiscales_select on retail.ubicacion_datos_fiscales for select
  using (auth.role() = 'authenticated');

-- ---------- grants ----------
grant select on retail.series_comprobantes, retail.comprobantes, retail.proformas,
  retail.configuracion_empresa, retail.ubicacion_datos_fiscales to authenticated;
grant execute on function retail.fn_reservar_numero_serie to authenticated;
grant execute on function retail.registrar_serie_comprobante to authenticated;
grant execute on function retail.emitir_comprobante to authenticated;
grant execute on function retail.emitir_nota to authenticated;
grant execute on function retail.actualizar_transmision_comprobante to authenticated;
grant execute on function retail.anular_comprobante to authenticated;
grant execute on function retail.crear_proforma to authenticated;
grant execute on function retail.convertir_proforma_a_comprobante to authenticated;
