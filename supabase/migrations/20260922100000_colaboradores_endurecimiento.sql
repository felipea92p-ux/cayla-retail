-- ============================================================================
-- 20260922100000_colaboradores_endurecimiento.sql — CAYLA V2
--
-- Tres arreglos que salieron de la auditoría de /colaboradores
-- (docs/pantallas/colaboradores.md, tareas #2, #4 y #5), sobre `retail.colaboradores`
-- y las RPC que la escriben. ADR-0145.
--
-- 1) TAREA #4 — la tabla se protegía con UNA sola capa. En producción, `authenticated`
--    tiene INSERT, UPDATE y DELETE sobre `retail.colaboradores` (consulta D1 del
--    2026-09-21); solo RLS, que hoy tiene únicamente la política de SELECT, lo frena.
--    Si alguien agrega una política de escritura por descuido, un colaborador podría
--    darse acceso o subirse a líder desde la consola del navegador. Se revoca la
--    escritura directa, igual que ya se hizo con `movimientos`
--    (20260915150000_movimientos_insert_solo_rpc.sql:84). Las RPC son SECURITY DEFINER
--    y siguen funcionando: corren como el dueño, no como `authenticated`.
--
-- 2) TAREA #5 — nada impedía un colaborador SIN ubicación (solo el líder opera cualquier
--    sede; el colaborador queda fijo a una). Producción hoy no tiene ninguno (16 de 16 la
--    tienen), así que el candado entra sin migrar datos. Sin él, `fn_ubicacion_actual_
--    persona()` devolvería vacío y esa persona operaría "en ninguna parte".
--
-- 3) TAREA #2 — `agregar_colaborador` hacía `on conflict do nothing` sin avisar: si dos
--    líderes agregan a la misma persona a ubicaciones distintas, el segundo cree haberla
--    fijado a su sede y no es así, y la pantalla igual celebra. Ahora dice la verdad.
--    Igual con `quitar_colaborador`: quitar a alguien que otro líder ya quitó no puede
--    decir "Acceso quitado". Y el aviso de "no puedes quitarte a ti mismo" nombraba el
--    rol equivocado ("otro colaborador"; solo un líder puede quitar).
--
-- Mismas firmas que antes (`create or replace`, no `drop`): cambiar la firma dejaría dos
-- versiones vivas a la vez (la lección de `recibir_lote` / `registrar_movimiento`).
--
-- SE ROMPE SI: se pega en producción antes de verificar que ningún colaborador vigente
-- tiene `ubicacion_asignada_id` nulo — el `add constraint` fallaría entero (sin tocar
-- datos) y las RPC de abajo quedarían sin aplicarse si se corre a mano por partes. Antes de
-- pegar: `select count(*) from retail.colaboradores where rol = 'colaborador' and
-- ubicacion_asignada_id is null;` debe dar 0.
--
-- Re-ejecutable. Producción: se pega entera en el SQL Editor de cayla-dynamic; ya trae el
-- prefijo `retail.`.
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1) escritura directa cerrada: solo las RPC escriben ----------
revoke insert, update, delete, truncate on retail.colaboradores from authenticated, anon;

-- ---------- 2) un colaborador siempre tiene ubicación ----------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'retail.colaboradores'::regclass
      and conname = 'colaboradores_colaborador_con_ubicacion'
  ) then
    alter table retail.colaboradores
      add constraint colaboradores_colaborador_con_ubicacion
      check (rol = 'lider' or ubicacion_asignada_id is not null);
  end if;
end;
$$;

-- ---------- 3) agregar: si ya tenía acceso, lo dice ----------
create or replace function retail.agregar_colaborador(p_persona_id uuid, p_ubicacion_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
  v_filas integer;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  if not exists (select 1 from public.personas where id = p_persona_id and estado = 'activo') then
    raise exception 'Esa persona no existe o no está activa en Dynamic';
  end if;
  if not exists (select 1 from ubicaciones where id = p_ubicacion_id and activo) then
    raise exception 'Esa ubicación no existe o está inactiva';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  -- Todo lo que entra por acá es Colaborador — Líder es un nivel que hoy
  -- no se asigna desde esta pantalla, solo lo tienen los 9 ya registrados.
  insert into colaboradores (persona_id, agregado_por, rol, ubicacion_asignada_id)
    values (p_persona_id, v_quien, 'colaborador', p_ubicacion_id)
    on conflict (persona_id) do nothing;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa persona ya tiene acceso a retail — actualiza la pantalla para verla en la lista';
  end if;
end;
$$;

-- ---------- 3) quitar: no dice "quitado" si no había nada que quitar ----------
create or replace function retail.quitar_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_quien uuid;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  if p_persona_id = v_quien then
    raise exception 'No puedes quitarte tu propio acceso — pide a otro líder que lo haga';
  end if;
  delete from colaboradores where persona_id = p_persona_id;
  if not found then
    raise exception 'Esa persona ya no tiene acceso — actualiza la pantalla para ver la lista al día';
  end if;
end;
$$;

-- Los permisos de ejecución no cambian con `create or replace`, pero se repiten por si esta
-- migración se pega sobre una base donde alguien los tocó.
grant execute on function retail.agregar_colaborador(uuid, uuid) to authenticated;
grant execute on function retail.quitar_colaborador(uuid) to authenticated;
