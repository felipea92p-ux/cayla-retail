-- ============================================================================
-- 0006_colaboradores.sql — CAYLA V2
--
-- Gestión de colaboradores (Prioridad 1 del roadmap, 2026-09-12): la base ya
-- conocía persona/rol/ubicación, pero `retail.personas` solo tenía policy de
-- SELECT — ni un líder podía dar de alta, reasignar o desactivar a alguien
-- desde la app. El alta real (crear el usuario de Auth) vive fuera de SQL
-- —Route Handler con Auth Admin API, `apps/web/app/api/colaboradores/
-- invitar/route.ts`— esta migración cubre lo que SÍ es del dominio de la
-- base: reasignar rol/ubicación y activar/desactivar acceso.
-- ============================================================================

set search_path = retail, public, extensions;

alter table retail.personas add column activo boolean not null default true;

-- Las 3 funciones de seguridad que TODO el esquema usa para "¿quién puede
-- qué?" ahora exigen `activo`. Sin esto, "desactivar acceso" sería un campo
-- decorativo: la cuenta seguiría pudiendo operar cualquier RPC porque estas
-- funciones son la ÚNICA puerta real (RLS, no la UI) — ver 0003_funciones.sql.
create or replace function retail.fn_persona_actual() returns retail.personas
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select * from personas where auth_user_id = auth.uid() and activo;
$$;

create or replace function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select coalesce((select rol = 'lider' from personas where auth_user_id = auth.uid() and activo), false);
$$;

create or replace function retail.fn_ubicacion_actual_persona() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select ubicacion_id from personas where auth_user_id = auth.uid() and activo;
$$;

-- BUG real encontrado probando la desactivación (no solo razonado): con la
-- persona desactivada, `fn_ubicacion_actual_persona()` pasa a devolver NULL,
-- y `p_ubicacion_id = NULL` es NULL en SQL (no `false`) — así que
-- `fn_es_lider() OR NULL` también da NULL. `if not NULL then` en PL/pgSQL
-- NO dispara (NULL no es verdadero), así que una cuenta desactivada podía
-- seguir llamando abrir_caja/registrar_venta/transferir/etc. sin que la
-- excepción saltara. Afecta a TODAS las RPC del esquema, no solo a caja,
-- porque todas dependen de esta función para decidir permiso. El `coalesce`
-- fuerza el resultado a un booleano real.
create or replace function retail.fn_puede_operar_ubicacion(p_ubicacion_id uuid) returns boolean
language sql stable
set search_path = retail, public, extensions
as $$
  select coalesce(fn_es_lider() or p_ubicacion_id = fn_ubicacion_actual_persona(), false);
$$;

-- ---------- editar un colaborador ya existente ----------
-- Una sola RPC para las 4 acciones del roadmap (asignar sede, asignar rol,
-- cambiar sede, activar/desactivar) — son el mismo UPDATE parcial sobre la
-- misma fila; separarlas en 4 funciones sería el caso especial que el
-- criterio del repo pide eliminar, no preservar.
create function retail.actualizar_persona(
  p_persona_id uuid,
  p_rol text default null,
  p_ubicacion_id uuid default null,
  p_activo boolean default null
) returns retail.personas
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare v_persona personas%rowtype;
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede editar colaboradores';
  end if;
  if p_rol is not null and p_rol not in ('lider', 'integrante') then
    raise exception 'Rol inválido: % (debe ser lider o integrante)', p_rol;
  end if;
  if p_ubicacion_id is not null and not exists (select 1 from ubicaciones where id = p_ubicacion_id) then
    raise exception 'La ubicación % no existe', p_ubicacion_id;
  end if;

  update personas set
    rol = coalesce(p_rol, rol),
    ubicacion_id = coalesce(p_ubicacion_id, ubicacion_id),
    activo = coalesce(p_activo, activo)
  where id = p_persona_id
  returning * into v_persona;

  if not found then
    raise exception 'El colaborador % no existe', p_persona_id;
  end if;
  return v_persona;
end;
$$;

grant execute on function retail.actualizar_persona to authenticated;
