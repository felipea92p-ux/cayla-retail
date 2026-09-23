-- ============================================================================
-- 20260923180000_compras_por_tienda_quien_y_donde.sql — CAYLA V2 · ADR-0179 (F0 reescrita sobre ADR-0161)
--
-- EL PROBLEMA PRIMERO. Desde ADR-0161 (20260923130000/140000, en producción) QUIÉN entra a Compras lo dice el ROL: quien ve
-- Facturas de compra, Por pagar o Notas de crédito. Pero nada dice DE QUÉ TIENDAS: una cuenta de Trujillo con Por pagar
-- vería y pagaría la deuda de Arequipa. Felipe decidió (2026-09-23): «cada tienda maneja sus entradas y pagos» — con el
-- módulo se ve y se paga SOLO lo de su tienda; el líder, todo.
--
-- CÓMO SE COMPONEN (dos ejes, un solo lugar para cada uno):
--   · QUIÉN  = el rol (`fn_capacidad_por_modulos`, ADR-0161). Sin módulo de Compras no se ve nada, haya o no fila abajo.
--   · DÓNDE  = `fn_compras_ubicaciones()`: el líder, todas; una cuenta con módulo, SU tienda (`fn_ubicacion_actual_persona`,
--              la misma que usa todo el ERP; para una terminal, la suya) más las que el líder le sume en
--              `compradores_de_tienda` — solo para la persona de Compras que atiende varias tiendas (R-10). La tabla nunca
--              da acceso por sí sola: amplía tiendas a quien ya tiene el módulo.
--
-- Esta migración solo crea las piezas; nada las usa todavía (las siguientes 180100–180400 las enchufan). Con la tabla vacía y
-- sin roles con módulos de Compras (así está producción el 2026-09-23), nadie ve nada distinto.
--
-- REEMPLAZA a 20260922120000_compras_compradores_de_tienda.sql (rama adr-0145-compras-permisos), que nunca se pegó en producción
-- y chocaba en número con 20260922120000_productos_alertas_…: se renumeró para ir DESPUÉS de ADR-0161 y aplicarse igual en el
-- repo y en producción.
--
-- PARA PEGAR EN PRODUCCIÓN: trae `set search_path`; todo va con `retail.`. Re-pegable.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_capacidad_por_modulos(text[])') is null or to_regprocedure('retail.fn_ubicacion_actual_persona()') is null then
    raise exception 'Falta ADR-0161 (roles por módulo): pega antes 20260923030000 … 20260923140000';
  end if;
end $$;

-- ==================== 1. tiendas extra (R-10) ====================
create table if not exists retail.compradores_de_tienda (
  persona_id   uuid not null references public.personas(id),
  ubicacion_id uuid not null references retail.ubicaciones(id),
  agregado_por uuid references public.personas(id),
  created_at   timestamptz not null default now(),
  primary key (persona_id, ubicacion_id)
);

comment on table retail.compradores_de_tienda is
  'ADR-0179. Tiendas EXTRA cuyas Compras ve y paga una persona, además de la suya (la persona de Compras que atiende varias, R-10). No da acceso por sí sola: hace falta que su rol vea un módulo de Compras (ADR-0161). Se escribe solo por agregar_/quitar_comprador_de_tienda.';
comment on column retail.compradores_de_tienda.persona_id is 'La persona. Solo cuenta si es colaboradora activa y su rol ve un módulo de Compras.';
comment on column retail.compradores_de_tienda.ubicacion_id is 'La tienda extra.';
comment on column retail.compradores_de_tienda.agregado_por is 'El líder que la sumó.';

create index if not exists compradores_de_tienda_ubicacion_idx on retail.compradores_de_tienda (ubicacion_id);

alter table retail.compradores_de_tienda enable row level security;

drop policy if exists compradores_de_tienda_select on retail.compradores_de_tienda;
create policy compradores_de_tienda_select on retail.compradores_de_tienda for select
  using ((select retail.fn_es_lider()) or persona_id = (select retail.fn_actor_persona_id(false)));

revoke all on retail.compradores_de_tienda from public, anon;
revoke insert, update, delete, truncate on retail.compradores_de_tienda from authenticated;
grant select on retail.compradores_de_tienda to authenticated;

-- ==================== 2. DÓNDE: las tiendas cuyas Compras gestiona quien consulta ====================
-- Un arreglo y no un `setof`: las políticas lo comparan con `= any((select …))`, que Postgres resuelve UNA vez por consulta.
create or replace function retail.fn_compras_ubicaciones()
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select case
    when retail.fn_es_lider() then
      (select coalesce(array_agg(u.id order by u.id), '{}') from retail.ubicaciones u where u.activo)
    when retail.fn_capacidad_por_modulos(array['facturas_compra', 'por_pagar', 'notas_credito']) then
      (select coalesce(array_agg(distinct x.id), '{}')
         from (
           select retail.fn_ubicacion_actual_persona() as id
           union
           select c.ubicacion_id
             from retail.compradores_de_tienda c
             join public.personas p on p.id = c.persona_id and p.estado = 'activo'
             join retail.colaboradores co on co.persona_id = c.persona_id and co.estado = 'activo'
            where p.auth_user_id = auth.uid()
         ) x
         join retail.ubicaciones u on u.id = x.id and u.activo)
    else '{}'::uuid[]
  end;
$$;

comment on function retail.fn_compras_ubicaciones() is
  'ADR-0179. Tiendas cuyas Compras ve, registra y paga quien consulta: todas si es líder; si su rol ve Facturas de compra, Por pagar o Notas de crédito, SU tienda (fn_ubicacion_actual_persona) más las extra de compradores_de_tienda; si no, ninguna.';

create or replace function retail.fn_puede_comprar_en(p_ubicacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select coalesce(p_ubicacion_id = any(retail.fn_compras_ubicaciones()), false); $$;

comment on function retail.fn_puede_comprar_en(uuid) is
  'ADR-0179. ¿Gestiona quien consulta las Compras de esta tienda? fn_compras_ubicaciones() para una sola. NULL → false.';

-- ==================== 3. sumar y quitar tiendas extra (solo el líder) ====================
create or replace function retail.agregar_comprador_de_tienda(p_persona_id uuid, p_ubicacion_id uuid)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder puede sumar tiendas de Compras a una persona' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.personas p join retail.colaboradores co on co.persona_id = p.id
    where p.id = p_persona_id and p.estado = 'activo' and co.estado = 'activo'
  ) then
    raise exception 'Esa persona no es colaboradora activa de retail';
  end if;
  if not exists (select 1 from retail.ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa tienda no existe o está inactiva';
  end if;
  if exists (select 1 from retail.compradores_de_tienda where persona_id = p_persona_id and ubicacion_id = p_ubicacion_id) then
    raise exception 'Esa persona ya gestiona las Compras de esa tienda';
  end if;
  insert into retail.compradores_de_tienda (persona_id, ubicacion_id, agregado_por)
  values (p_persona_id, p_ubicacion_id, retail.fn_actor_persona_id(false));
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
    raise exception 'Solo un líder puede quitar tiendas de Compras a una persona' using errcode = '42501';
  end if;
  delete from retail.compradores_de_tienda where persona_id = p_persona_id and ubicacion_id = p_ubicacion_id;
  if not found then
    raise exception 'Esa persona no tenía esa tienda de Compras';
  end if;
end;
$$;

comment on function retail.agregar_comprador_de_tienda(uuid, uuid) is
  'ADR-0179. Solo líder. Suma una tienda extra de Compras a una colaboradora activa (R-10). No le da el módulo: eso lo da su rol.';
comment on function retail.quitar_comprador_de_tienda(uuid, uuid) is
  'ADR-0179. Solo líder. Quita esa tienda extra. Las compras ya hechas siguen siendo de su tienda.';

revoke all on function retail.fn_compras_ubicaciones() from public, anon;
revoke all on function retail.fn_puede_comprar_en(uuid) from public, anon;
revoke all on function retail.agregar_comprador_de_tienda(uuid, uuid) from public, anon;
revoke all on function retail.quitar_comprador_de_tienda(uuid, uuid) from public, anon;
grant execute on function retail.fn_compras_ubicaciones() to authenticated;
grant execute on function retail.fn_puede_comprar_en(uuid) to authenticated;
grant execute on function retail.agregar_comprador_de_tienda(uuid, uuid) to authenticated;
grant execute on function retail.quitar_comprador_de_tienda(uuid, uuid) to authenticated;
