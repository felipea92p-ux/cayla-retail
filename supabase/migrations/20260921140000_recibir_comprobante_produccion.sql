-- ============================================================================
-- 20260921140000_recibir_comprobante_produccion.sql — CAYLA V2 (ADR-0133, F4d; decisión D-H)
--
-- PROBLEMA. F4b registra la factura del proveedor de tela ("compré 100 m a S/ 20") y F4c la paga,
-- pero la tela todavía no existe en el estante: el saldo de insumos solo sube con `recibir_insumo`,
-- tecleado a mano, sin ningún vínculo con el papel. Falta el paso que en Compras hace `recibir_compras`:
-- «la factura dice qué se compró; el lote dice qué llegó». Y quien recibe la tela es quien trabaja en
-- el Taller —no el líder—, y NO debe ver cuánto costó (D-G): recibir es un acto físico, no de dinero.
--
-- QUÉ HACE.
--  1. `comprobantes_produccion_recepciones` — una recepción = una entrega física contra un comprobante
--     (la «guía»), con su token de idempotencia. Los lotes que abre cuelgan de ella.
--  2. `comprobantes_produccion_cierres` — lo que NO va a llegar de una línea, con su motivo (faltante,
--     devolución u otro). Cerrar una línea no borra nada: la deja sin pendiente y dice por qué.
--  3. `insumo_lotes.comprobante_item_id` y `.recepcion_id` — el vínculo lote ↔ línea que F4b anunció.
--  4. `recibir_comprobante_produccion(comprobante, ubicación, líneas, cierres, nota, token)` — abre **un lote
--     por línea recibida** (proveedor, documento «serie-número», costo unitario SIN IGV de la línea,
--     `origen = 'compra'`) y su movimiento de compra en el ledger. Lo puede llamar quien opera el Taller
--     (`fn_puede_operar_ubicacion`) —líder o colaborador del Taller—, no solo el líder. Reglas: lo recibido
--     de una línea nunca supera lo facturado menos lo ya recibido y cerrado; solo líneas con insumo del
--     catálogo (un flete o una maquila no abren lote); solo comprobantes vigentes; una línea no aparece
--     dos veces; idempotente por token; bloquea el comprobante para que dos recepciones simultáneas no
--     se pasen.
--  5. `fn_lineas_comprobantes_produccion(ubicación, comprobante?)` — las líneas con facturado / recibido /
--     cerrado / pendiente, **sin ningún importe**: es lo que ve quien recibe. Para el líder, las mismas
--     cantidades; los montos siguen en `fn_comprobantes_produccion` (solo líder).
--  6. `anular_comprobante_produccion` — ahora también se niega si ya hay mercadería recibida o líneas
--     cerradas (lo que F4b dejó anotado): anular dejaría stock sin respaldo.
--
-- QUÉ NO HACE. No cierra el candado del dinero sobre `insumo_lotes`/`movimientos_insumo` (eso es F4e:
-- hoy esas tablas aún dejan leer el costo por la API directa), y no recibe servicios (maquila, flete).
--
-- SE ROMPE SI: `recibir_insumo` cambia de forma de abrir un lote (esta función inserta el lote y su
-- movimiento por su cuenta, con el mismo criterio) o `fn_puede_operar_ubicacion` cambia de significado.
--
-- ESTADO: solo local hasta que Felipe la pegue en producción (prefijo `retail.` ya incluido).
-- Idempotente. Depende de F4b/F4c (ya en producción). Reescribe `anular_comprobante_produccion`
-- (misma firma, sin sobrecargas) partiendo de la definición de F4b, idéntica en producción.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1. recepciones y cierres ----------
create table if not exists retail.comprobantes_produccion_recepciones (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references retail.comprobantes_produccion (id),
  ubicacion_id   uuid not null references retail.ubicaciones (id),
  nota           text,
  usuario_id     uuid references public.personas (id),
  token_cliente  uuid unique,
  created_at     timestamptz not null default now()
);

comment on table retail.comprobantes_produccion_recepciones is
  'Una entrega física contra un comprobante de Producción. Los lotes que abre (`insumo_lotes.recepcion_id`) cuelgan de ella. Sin importes. Solo se agrega.';

create index if not exists comprobantes_produccion_recepciones_comprobante_idx on retail.comprobantes_produccion_recepciones (comprobante_id);

create table if not exists retail.comprobantes_produccion_cierres (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references retail.comprobantes_produccion_items (id),
  recepcion_id  uuid references retail.comprobantes_produccion_recepciones (id),
  cantidad      numeric(12, 3) not null check (cantidad > 0),
  motivo        text not null check (motivo in ('faltante', 'devolucion', 'otro')),
  nota          text,
  usuario_id    uuid references public.personas (id),
  created_at    timestamptz not null default now()
);

comment on table retail.comprobantes_produccion_cierres is
  'Lo que NO va a llegar de una línea de un comprobante de Producción, con su motivo. Deja la línea sin pendiente sin borrar nada. Sin importes. Solo se agrega.';

create index if not exists comprobantes_produccion_cierres_item_idx on retail.comprobantes_produccion_cierres (item_id);

-- Recepciones y cierres son un libro: nadie los edita ni los borra.
create or replace function retail.fn_libro_recepcion_produccion_inmutable()
returns trigger
language plpgsql
set search_path = retail, public, extensions
as $$
begin
  raise exception 'Las recepciones y los cierres de un comprobante de Producción no se editan ni se borran' using errcode = '42501';
end;
$$;

drop trigger if exists comprobantes_produccion_recepciones_inmutable on retail.comprobantes_produccion_recepciones;
create trigger comprobantes_produccion_recepciones_inmutable
  before update or delete on retail.comprobantes_produccion_recepciones
  for each row execute function retail.fn_libro_recepcion_produccion_inmutable();

drop trigger if exists comprobantes_produccion_cierres_inmutable on retail.comprobantes_produccion_cierres;
create trigger comprobantes_produccion_cierres_inmutable
  before update or delete on retail.comprobantes_produccion_cierres
  for each row execute function retail.fn_libro_recepcion_produccion_inmutable();

-- RLS: sin importes, pero sin escritura directa. Una recepción la lee quien opera su ubicación; un cierre, solo el líder
-- (quien recibe ve lo cerrado por la función de líneas).
alter table retail.comprobantes_produccion_recepciones enable row level security;
alter table retail.comprobantes_produccion_cierres enable row level security;

drop policy if exists comprobantes_produccion_recepciones_select on retail.comprobantes_produccion_recepciones;
create policy comprobantes_produccion_recepciones_select on retail.comprobantes_produccion_recepciones
  for select using (retail.fn_puede_operar_ubicacion(ubicacion_id));
drop policy if exists comprobantes_produccion_cierres_select_lider on retail.comprobantes_produccion_cierres;
create policy comprobantes_produccion_cierres_select_lider on retail.comprobantes_produccion_cierres
  for select using (retail.fn_es_lider());

revoke all on retail.comprobantes_produccion_recepciones, retail.comprobantes_produccion_cierres from public, anon, authenticated;
grant select on retail.comprobantes_produccion_recepciones, retail.comprobantes_produccion_cierres to authenticated;
grant all on retail.comprobantes_produccion_recepciones, retail.comprobantes_produccion_cierres to service_role;

-- ---------- 2. el vínculo lote ↔ línea ----------
alter table retail.insumo_lotes add column if not exists comprobante_item_id uuid references retail.comprobantes_produccion_items (id);
alter table retail.insumo_lotes add column if not exists recepcion_id uuid references retail.comprobantes_produccion_recepciones (id);

comment on column retail.insumo_lotes.comprobante_item_id is 'La línea del comprobante de Producción de la que salió este lote (F4d). Nulo en los lotes ingresados a mano o como saldo inicial.';
comment on column retail.insumo_lotes.recepcion_id is 'La recepción (entrega física) que abrió este lote (F4d).';

create index if not exists insumo_lotes_comprobante_item_idx on retail.insumo_lotes (comprobante_item_id) where comprobante_item_id is not null;

-- ---------- 3. recibir ----------
create or replace function retail.recibir_comprobante_produccion(
  p_comprobante_id uuid,
  p_ubicacion_id uuid,
  p_lineas jsonb default '[]'::jsonb,
  p_cierres jsonb default '[]'::jsonb,
  p_nota text default null,
  p_token uuid default null
) returns uuid
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.comprobantes_produccion%rowtype;
  v_existente uuid;
  v_recepcion uuid;
  v_persona uuid;
  v_hoy date := retail.fn_hoy_lima();
  v_documento text;
  v_l jsonb; v_k jsonb;
  v_item retail.comprobantes_produccion_items%rowtype;
  v_cant numeric; v_pend numeric; v_recibido numeric; v_cerrado numeric; v_pedido numeric;
  v_codigo text; v_n integer; v_lote uuid;
  v_vistos uuid[] := '{}';
  v_motivo text;
begin
  if p_ubicacion_id is null or not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and tipo = 'taller' and activo) then
    raise exception 'Los insumos se reciben en el Taller.';
  end if;
  if not retail.fn_puede_operar_ubicacion(p_ubicacion_id) then
    raise exception 'No tienes permiso para recibir insumos en esa ubicación.' using errcode = '42501';
  end if;
  if p_token is not null then
    select id into v_existente from retail.comprobantes_produccion_recepciones where token_cliente = p_token;
    if found then return v_existente; end if;  -- reintento honesto: la primera vez sí llegó
  end if;
  if coalesce(jsonb_array_length(p_lineas), 0) = 0 and coalesce(jsonb_array_length(p_cierres), 0) = 0 then
    raise exception 'Indica qué llegó o qué no va a llegar.';
  end if;

  -- Se bloquea el comprobante: dos recepciones simultáneas se hacen la cola y la segunda ve lo pendiente real.
  select * into v_c from retail.comprobantes_produccion where id = p_comprobante_id for update;
  if not found then
    raise exception 'Ese comprobante no existe. Recarga la pantalla.';
  end if;
  if v_c.estado <> 'vigente' then
    raise exception 'Ese comprobante está anulado: no se recibe mercadería contra él.';
  end if;
  v_documento := v_c.serie || '-' || v_c.numero;
  select id into v_persona from public.personas where auth_user_id = auth.uid();

  insert into retail.comprobantes_produccion_recepciones (comprobante_id, ubicacion_id, nota, usuario_id, token_cliente)
  values (p_comprobante_id, p_ubicacion_id, retail.fn_texto_o_null(p_nota), v_persona, p_token)
  returning id into v_recepcion;

  -- Validar todo primero, escribir después: si una línea falla no queda una recepción a medias.
  for v_l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    select * into v_item from retail.comprobantes_produccion_items where id = (v_l ->> 'item_id')::uuid and comprobante_id = p_comprobante_id;
    if not found then
      raise exception 'Una de las líneas no pertenece a este comprobante.';
    end if;
    if v_item.insumo_id is null then
      raise exception 'La línea «%» es un concepto, no un insumo: no abre lote.', v_item.descripcion;
    end if;
    if v_item.id = any (v_vistos) then
      raise exception 'Una línea aparece dos veces en la misma recepción.';
    end if;
    v_vistos := v_vistos || v_item.id;
    v_cant := (v_l ->> 'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'La cantidad recibida tiene que ser mayor a cero.';
    end if;
    if v_cant <> round(v_cant, 3) then
      raise exception 'La cantidad admite como máximo 3 decimales (llegó %).', v_cant;
    end if;
    select coalesce(sum(cantidad_ingresada), 0) into v_recibido from retail.insumo_lotes where comprobante_item_id = v_item.id;
    select coalesce(sum(cantidad), 0) into v_cerrado from retail.comprobantes_produccion_cierres where item_id = v_item.id;
    v_pend := v_item.cantidad - v_recibido - v_cerrado;
    if v_cant > v_pend then
      raise exception 'De esa línea solo faltan % por recibir y llegó %.', trim_scale(v_pend), trim_scale(v_cant);
    end if;
  end loop;

  for v_k in select * from jsonb_array_elements(coalesce(p_cierres, '[]'::jsonb)) loop
    select * into v_item from retail.comprobantes_produccion_items where id = (v_k ->> 'item_id')::uuid and comprobante_id = p_comprobante_id;
    if not found then
      raise exception 'Una de las líneas a cerrar no pertenece a este comprobante.';
    end if;
    if v_item.insumo_id is null then
      raise exception 'La línea «%» es un concepto, no un insumo: no se cierra por faltante.', v_item.descripcion;
    end if;
    v_motivo := coalesce(v_k ->> 'motivo', '');
    if v_motivo not in ('faltante', 'devolucion', 'otro') then
      raise exception 'Indica por qué no llegará el resto: faltante, devolución u otro.';
    end if;
    v_cant := (v_k ->> 'cantidad')::numeric;
    if v_cant is null or v_cant <= 0 then
      raise exception 'La cantidad a cerrar tiene que ser mayor a cero.';
    end if;
    select coalesce(sum(cantidad_ingresada), 0) into v_recibido from retail.insumo_lotes where comprobante_item_id = v_item.id;
    select coalesce(sum(cantidad), 0) into v_cerrado from retail.comprobantes_produccion_cierres where item_id = v_item.id;
    -- Lo que esta misma recepción recibe de la línea también descuenta del pendiente.
    select coalesce(sum((x ->> 'cantidad')::numeric), 0) into v_pedido from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x where (x ->> 'item_id')::uuid = v_item.id;
    if v_cant > v_item.cantidad - v_recibido - v_cerrado - v_pedido then
      raise exception 'De esa línea solo faltan % por recibir y quieres cerrar %.', trim_scale(v_item.cantidad - v_recibido - v_cerrado - v_pedido), trim_scale(v_cant);
    end if;
  end loop;

  -- Escritura: un lote por línea recibida, con el costo unitario de la línea (sin IGV) y su movimiento de compra.
  for v_l in select * from jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) loop
    select * into v_item from retail.comprobantes_produccion_items where id = (v_l ->> 'item_id')::uuid;
    v_cant := (v_l ->> 'cantidad')::numeric;
    v_codigo := nullif(btrim(coalesce(v_l ->> 'codigo_lote', '')), '');
    if v_codigo is not null and exists (select 1 from retail.insumo_lotes where insumo_id = v_item.insumo_id and codigo_lote = v_codigo) then
      raise exception 'Ya hay un lote de ese insumo con el código «%». Usa otro o déjalo en blanco.', v_codigo;
    end if;
    if v_codigo is null then
      -- Sin código escrito: el documento, y «/2», «/3»… si ese insumo ya abrió lote con ese código.
      select count(*) into v_n from retail.insumo_lotes where insumo_id = v_item.insumo_id and (codigo_lote = v_documento or codigo_lote like v_documento || '/%');
      v_codigo := case when v_n = 0 then v_documento else v_documento || '/' || (v_n + 1) end;
    end if;
    insert into retail.insumo_lotes (insumo_id, ubicacion_id, codigo_lote, proveedor_id, cantidad_ingresada, costo_unitario, documento, fecha_ingreso, origen, nota, comprobante_item_id, recepcion_id)
    values (v_item.insumo_id, p_ubicacion_id, v_codigo, v_c.proveedor_id, v_cant, v_item.costo_unitario, v_documento, v_hoy, 'compra', retail.fn_texto_o_null(p_nota), v_item.id, v_recepcion)
    returning id into v_lote;
    insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id, nota)
    values (v_item.insumo_id, v_lote, p_ubicacion_id, 'compra', v_cant, v_item.costo_unitario, v_persona, 'Recepción de ' || v_documento);
  end loop;

  for v_k in select * from jsonb_array_elements(coalesce(p_cierres, '[]'::jsonb)) loop
    insert into retail.comprobantes_produccion_cierres (item_id, recepcion_id, cantidad, motivo, nota, usuario_id)
    values ((v_k ->> 'item_id')::uuid, v_recepcion, (v_k ->> 'cantidad')::numeric, v_k ->> 'motivo', retail.fn_texto_o_null(v_k ->> 'nota'), v_persona);
  end loop;

  return v_recepcion;
exception
  when unique_violation then
    -- Dos envíos con el mismo token que llegaron a la vez: el segundo devuelve la recepción del primero.
    if p_token is not null then
      select id into v_existente from retail.comprobantes_produccion_recepciones where token_cliente = p_token;
      if found then return v_existente; end if;
    end if;
    raise;
end;
$$;

comment on function retail.recibir_comprobante_produccion(uuid, uuid, jsonb, jsonb, text, uuid) is
  'Recibe insumos contra un comprobante de Producción: un lote por línea (costo unitario de la línea, sin IGV), lo que no llegará se cierra con motivo. Lo llama quien opera el Taller, sin ver montos. Idempotente por token.';

-- ---------- 4. las líneas, sin importes ----------
create or replace function retail.fn_lineas_comprobantes_produccion(p_ubicacion_id uuid, p_comprobante_id uuid default null)
returns table (
  comprobante_id uuid, proveedor text, tipo text, serie text, numero text, fecha_emision date,
  item_id uuid, insumo_id uuid, insumo text, unidad text,
  facturado numeric, recibido numeric, cerrado numeric, pendiente numeric
)
language sql stable security definer set search_path = retail, public, extensions as $$
  select c.id, p.nombre, c.tipo, c.serie, c.numero, c.fecha_emision,
         i.id, i.insumo_id, n.nombre, n.unidad_medida,
         i.cantidad,
         coalesce((select sum(l.cantidad_ingresada) from retail.insumo_lotes l where l.comprobante_item_id = i.id), 0),
         coalesce((select sum(k.cantidad) from retail.comprobantes_produccion_cierres k where k.item_id = i.id), 0),
         i.cantidad
           - coalesce((select sum(l.cantidad_ingresada) from retail.insumo_lotes l where l.comprobante_item_id = i.id), 0)
           - coalesce((select sum(k.cantidad) from retail.comprobantes_produccion_cierres k where k.item_id = i.id), 0)
  from retail.comprobantes_produccion c
  join retail.proveedores_produccion p on p.id = c.proveedor_id
  join retail.comprobantes_produccion_items i on i.comprobante_id = c.id and i.insumo_id is not null
  join retail.insumos n on n.id = i.insumo_id
  where retail.fn_puede_operar_ubicacion(p_ubicacion_id)
    and c.estado = 'vigente'
    and (p_comprobante_id is null or c.id = p_comprobante_id)
  order by c.fecha_emision, c.serie, c.numero, n.nombre;
$$;

comment on function retail.fn_lineas_comprobantes_produccion(uuid, uuid) is
  'Líneas de insumo de los comprobantes vigentes de Producción con facturado / recibido / cerrado / pendiente. SIN ningún importe: es lo que ve quien recibe en el Taller.';

-- ---------- 5. anular: ya no con mercadería recibida ----------
create or replace function retail.anular_comprobante_produccion(p_comprobante_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = retail, public, extensions as $$
declare
  v_c retail.comprobantes_produccion%rowtype;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede anular comprobantes de Producción.' using errcode = '42501';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Anular un comprobante necesita un motivo.';
  end if;
  select * into v_c from retail.comprobantes_produccion where id = p_comprobante_id for update;
  if not found then
    raise exception 'Ese comprobante no existe. Recarga la pantalla.';
  end if;
  if v_c.estado = 'anulada' then
    return;
  end if;
  -- Con pagos, anular dejaría dinero sin respaldo.
  if exists (select 1 from retail.comprobantes_produccion_pagos where comprobante_id = p_comprobante_id) then
    raise exception 'El comprobante tiene pagos registrados: no se puede anular.';
  end if;
  -- Con mercadería recibida, anular dejaría stock sin respaldo (F4d).
  if exists (select 1 from retail.insumo_lotes l join retail.comprobantes_produccion_items i on i.id = l.comprobante_item_id where i.comprobante_id = p_comprobante_id) then
    raise exception 'El comprobante ya tiene mercadería recibida: no se puede anular.';
  end if;
  if exists (select 1 from retail.comprobantes_produccion_cierres k join retail.comprobantes_produccion_items i on i.id = k.item_id where i.comprobante_id = p_comprobante_id) then
    raise exception 'El comprobante tiene líneas cerradas por faltante: no se puede anular.';
  end if;
  update retail.comprobantes_produccion set estado = 'anulada', motivo_anulacion = btrim(p_motivo) where id = p_comprobante_id;
end;
$$;

-- ---------- 6. permisos ----------
revoke all on function retail.fn_libro_recepcion_produccion_inmutable() from public, anon, authenticated;
revoke all on function retail.recibir_comprobante_produccion(uuid, uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function retail.recibir_comprobante_produccion(uuid, uuid, jsonb, jsonb, text, uuid) to authenticated;
revoke all on function retail.fn_lineas_comprobantes_produccion(uuid, uuid) from public, anon;
grant execute on function retail.fn_lineas_comprobantes_produccion(uuid, uuid) to authenticated;
revoke all on function retail.anular_comprobante_produccion(uuid, text) from public, anon;
grant execute on function retail.anular_comprobante_produccion(uuid, text) to authenticated;
