-- ============================================================================
-- 20260922120000_compras_compradores_de_tienda.sql — CAYLA V2 · ADR-0150 (F1, paso 1: el permiso)
--
-- PROBLEMA. Hoy el dinero de Compras es solo del líder (ADR-0126) y `fn_es_lider()` no mira la tienda: un líder
-- de Trujillo ve, registra y paga lo de Arequipa. El negocio dijo (ADR-0150) que cada tienda tiene su comprador,
-- un integrante que ve y paga lo de SU tienda. Falta dónde escribir «esta persona compra para esta tienda».
--
-- QUÉ HACE (solo agrega; con la tabla vacía nada cambia para nadie):
--   1. `compradores_de_tienda (persona_id, ubicacion_id)`: una fila por persona y tienda. Una persona puede tener
--      varias tiendas (la persona de Compras de R-10 no es líder y compra para varias). Se escribe SOLO por RPC.
--   2. `agregar_comprador_de_tienda` / `quitar_comprador_de_tienda`: solo el líder; dicen la verdad (fallan si la
--      fila ya existía / no existía), como `agregar_colaborador` (ADR-0145 de colaboradores).
--   3. `fn_compras_ubicaciones()`: las tiendas cuyas compras puede gestionar quien consulta — TODAS si es líder,
--      las suyas si es comprador, ninguna si no. Es la pieza que las fases siguientes usan para filtrar.
--   4. `fn_puede_comprar_en(ubicacion)`: lo mismo para UNA tienda.
--
-- QUÉ NO HACE, A PROPÓSITO. NO toca `fn_puede_registrar_compras()` ni `fn_puede_ver_dinero_de_compras()` (las dos
-- puertas de ADR-0126), NI las políticas de `compras`/`compra_*`, NI las funciones de indicadores. Abrir la puerta a
-- los compradores ANTES de filtrar cada lectura por tienda dejaría a un comprador leer el dinero de todas las
-- tiendas: `compras_select` y las funciones `security definer` responden «¿es de Compras?», no «¿de qué tienda?».
-- Por eso el cambio de las puertas y los filtros por tienda viajan juntos en el paso siguiente de F1, y esta
-- migración solo deja lista la pieza con la que se filtran (principio 2: cero estados inconsistentes).
--
-- QUIÉN ES COMPRADOR NO EXIGE SER LÍDER, y un líder NO necesita fila: `fn_compras_ubicaciones()` le devuelve todas.
-- Una fila de alguien que ya no es colaborador (suspendido, quitado) no da nada: las funciones cruzan con
-- `colaboradores` y con `personas.estado = 'activo'`, así no hay que limpiarlas para cerrar el acceso.
--
-- VOLVER ATRÁS: `drop table retail.compradores_de_tienda cascade` más las cuatro funciones; ninguna otra cosa
-- depende de ellas todavía.
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path` (retail, public); no hace falta el prefijo `retail.`. Re-pegable.
-- La lista de quién compra en cada tienda NO va en esta migración: se carga con `agregar_comprador_de_tienda`
-- cuando Felipe la confirme (y después de reconciliar con la sesión de roles y permisos, ADR-0150 «Abierto»).
-- ============================================================================

set search_path = retail, public, extensions;

-- ==================== 1. la tabla ====================
create table if not exists retail.compradores_de_tienda (
  persona_id   uuid not null references public.personas(id),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  agregado_por uuid references public.personas(id),
  created_at   timestamptz not null default now(),
  primary key (persona_id, ubicacion_id)
);

comment on table retail.compradores_de_tienda is
  'ADR-0150. Qué tiendas compra y paga cada persona (normalmente un integrante). El líder no necesita fila: ve todas. Se escribe solo por agregar_/quitar_comprador_de_tienda.';
comment on column retail.compradores_de_tienda.persona_id is 'La persona que compra. Solo cuenta si además es colaborador y está activa.';
comment on column retail.compradores_de_tienda.ubicacion_id is 'La tienda (o el Taller) cuyas compras puede ver y pagar.';
comment on column retail.compradores_de_tienda.agregado_por is 'El líder que dio el permiso.';

-- Búsqueda inversa: «¿quién compra para esta tienda?» (la pantalla de asignación de las fases siguientes).
create index if not exists compradores_de_tienda_ubicacion_idx on retail.compradores_de_tienda (ubicacion_id);

alter table retail.compradores_de_tienda enable row level security;

-- Lee el líder (gestiona la lista) y cada persona lo suyo (para que su pantalla sepa qué tiendas tiene).
drop policy if exists compradores_de_tienda_select on retail.compradores_de_tienda;
create policy compradores_de_tienda_select on retail.compradores_de_tienda for select
  using (
    retail.fn_es_lider()
    or persona_id = (select p.id from public.personas p where p.auth_user_id = auth.uid())
  );

-- Escribir solo por RPC (como `movimientos` y `colaboradores`): sin INSERT/UPDATE/DELETE directos.
revoke all on retail.compradores_de_tienda from public, anon;
revoke insert, update, delete, truncate on retail.compradores_de_tienda from authenticated;
grant select on retail.compradores_de_tienda to authenticated;

-- ==================== 2. quién es «yo» y a qué tiendas llega ====================
-- `security definer` porque lee `personas` y `colaboradores`, que el integrante no ve entera. Sin parámetros:
-- siempre responde por quien consulta (auth.uid()), nunca por otra persona.
create or replace function retail.fn_compras_ubicaciones()
returns setof uuid
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  -- Líder: todas las ubicaciones activas.
  select u.id
  from ubicaciones u
  where u.activo and retail.fn_es_lider()
  union
  -- Comprador: las que tiene asignadas, si sigue siendo colaborador activo.
  select c.ubicacion_id
  from compradores_de_tienda c
  join public.personas p on p.id = c.persona_id
  join colaboradores co on co.persona_id = c.persona_id
  join ubicaciones u on u.id = c.ubicacion_id and u.activo
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

comment on function retail.fn_compras_ubicaciones() is
  'ADR-0150. Tiendas cuyas compras puede gestionar quien consulta: todas si es líder; las de compradores_de_tienda si es colaborador activo con fila; ninguna si no. Las lecturas y escrituras de dinero de Compras filtran por esto (el líder ve todas).';

create or replace function retail.fn_puede_comprar_en(p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select coalesce(p_ubicacion_id in (select retail.fn_compras_ubicaciones()), false);
$$;

comment on function retail.fn_puede_comprar_en(uuid) is
  'ADR-0150. ¿Puede quien consulta gestionar las compras de esta tienda? Es fn_compras_ubicaciones() para una sola. NULL → false.';

-- ==================== 3. dar y quitar el permiso (solo el líder) ====================
create or replace function retail.agregar_comprador_de_tienda(p_persona_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_quien uuid;
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede asignar compradores de tienda' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.personas p
    join colaboradores co on co.persona_id = p.id
    where p.id = p_persona_id and p.estado = 'activo'
  ) then
    raise exception 'Esa persona no es colaboradora activa de retail';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está inactiva';
  end if;
  if exists (select 1 from compradores_de_tienda where persona_id = p_persona_id and ubicacion_id = p_ubicacion_id) then
    raise exception 'Esa persona ya es compradora de esa tienda';
  end if;

  select id into v_quien from public.personas where auth_user_id = auth.uid();
  insert into compradores_de_tienda (persona_id, ubicacion_id, agregado_por)
  values (p_persona_id, p_ubicacion_id, v_quien);
end;
$$;

create or replace function retail.quitar_comprador_de_tienda(p_persona_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede quitar compradores de tienda' using errcode = '42501';
  end if;
  delete from compradores_de_tienda where persona_id = p_persona_id and ubicacion_id = p_ubicacion_id;
  if not found then
    raise exception 'Esa persona no era compradora de esa tienda';
  end if;
end;
$$;

comment on function retail.agregar_comprador_de_tienda(uuid, uuid) is
  'ADR-0150. Solo líder. Da a un colaborador activo el permiso de comprar y pagar para una tienda. Falla si ya lo tenía.';
comment on function retail.quitar_comprador_de_tienda(uuid, uuid) is
  'ADR-0150. Solo líder. Quita ese permiso. Falla si no lo tenía. No borra historial: las compras ya hechas siguen siendo de la tienda.';

-- ==================== 4. permisos de ejecución ====================
revoke all on function retail.fn_compras_ubicaciones() from public, anon;
revoke all on function retail.fn_puede_comprar_en(uuid) from public, anon;
revoke all on function retail.agregar_comprador_de_tienda(uuid, uuid) from public, anon;
revoke all on function retail.quitar_comprador_de_tienda(uuid, uuid) from public, anon;
grant execute on function retail.fn_compras_ubicaciones() to authenticated;
grant execute on function retail.fn_puede_comprar_en(uuid) to authenticated;
grant execute on function retail.agregar_comprador_de_tienda(uuid, uuid) to authenticated;
grant execute on function retail.quitar_comprador_de_tienda(uuid, uuid) to authenticated;
