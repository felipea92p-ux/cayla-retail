-- ============================================================================
-- 20260923174500_alcanzas_solo_a_quien_esta_debajo.sql — CAYLA V2 · ADR-0178, actualización (Felipe, 2026-09-23)
--
-- EL PROBLEMA PRIMERO. Con 20260923163000, quien no es líder solo DA lo que tiene. Pero seguía pudiendo QUITAR: quien tenía
-- el módulo Colaboradores suspendía, quitaba o movía de sede a cualquier colaborador, aunque ese colaborador viera más
-- módulos que él (una vendedora con Colaboradores podía suspender a la encargada que maneja Por pagar). Y con Roles y
-- accesos le cambiaba el rol a cualquiera que no fuera líder.
--
-- LA REGLA DE DYNAMIC (su `fn_set_rol`): «solo alcanzas a quien está por debajo de ti». En retail no hay números de
-- nivel, hay módulos: estar POR DEBAJO = todos sus módulos los ves tú Y tiene menos que tú. Estrictamente, igual que
-- Dynamic: a una compañera con EXACTAMENTE tus mismos módulos no la alcanzas (entre pares lo resuelve un líder).
--
-- ANALOGÍA CAYLA. La encargada de TRU puede cambiarle el turno a una vendedora de TRU, pero no a otra encargada ni a
-- quien lleva las cuentas del taller: a esas personas las mueve quien está por encima de las dos.
--
-- ALCANCE:
--   · Suspender, reactivar, quitar y cambiar de ubicación (las 4 pasan por fn_exigir_puede_tocar_colaborador).
--   · Cambiarle el rol a una persona (asignar_rol).
--   · El líder no cambia: ve todo, así que alcanza a todo el que no es líder. A un líder lo sigue tocando solo un Admin
--     (20260923163000); esta regla no se mete ahí. Uno mismo tampoco: eso ya lo frena cada función con su propio mensaje.
--   · NO entran las terminales (son aparatos, no personas): para darles un rol ya rige «solo das lo que tienes».
--
-- Mismo patrón que 20260923163000: se cambia desde la definición VIVA con conteo exacto (inventario contra producción el
-- 2026-09-23); si cambió, aborta sin dejar nada a medias. Re-ejecutable. Ya empieza con el search_path de producción.
-- Requiere 20260923163000.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_es_admin()') is null or to_regprocedure('retail.fn_modulos_que_no_tengo(text[])') is null then
    raise exception 'Falta 20260923163000_escalon_admin_desde_dynamic.sql: pégala antes que esta';
  end if;
end $$;

create or replace function pg_temp.reemplazar_alc(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
returns void
language plpgsql
as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise exception '% no existe en esta base: esta migración se escribió contra producción. Revisa qué cambió.', p_firma;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n <> p_veces then
    raise exception '% cambió desde que se escribió esta migración: se esperaban % ocurrencias de "%" y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_veces, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. ¿Está por debajo de mí? ====================
-- Los módulos del rol de una persona (activa o suspendida).
create or replace function retail.fn_modulos_de_persona(p_persona_id uuid) returns text[]
language sql stable security definer set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(rm.modulo order by rm.modulo), '{}')
    from retail.rol_modulos rm
   where rm.rol_id = coalesce(
     (select c.rol_id from retail.colaboradores c where c.persona_id = p_persona_id),
     (select s.rol_id from retail.colaboradores_suspendidos s where s.persona_id = p_persona_id));
$$;

-- Verdadero si la sesión alcanza a esa persona. Líder: a todo el que no es líder (los líderes, con fn_es_admin). Uno
-- mismo: verdadero aquí (cada función tiene su propio «no puedes …te a ti mismo»). Si no: sus módulos ⊆ los míos y menos.
create or replace function retail.fn_alcanzo_a(p_persona_id uuid) returns boolean
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
declare
  v_suyos text[];
  v_mios integer;
begin
  if retail.fn_es_lider() then
    return true;
  end if;
  if p_persona_id = retail.fn_actor_persona_id(false) then
    return true;
  end if;
  if exists (select 1 from retail.colaboradores where persona_id = p_persona_id and rol = 'lider')
     or exists (select 1 from retail.colaboradores_suspendidos where persona_id = p_persona_id and rol = 'lider') then
    return false;
  end if;
  v_suyos := retail.fn_modulos_de_persona(p_persona_id);
  select count(*) into v_mios from retail.modulos m where retail.fn_ve_modulo(m.clave);
  return cardinality(retail.fn_modulos_que_no_tengo(v_suyos)) = 0 and cardinality(v_suyos) < v_mios;
end;
$$;

comment on function retail.fn_alcanzo_a(uuid) is
  'ADR-0178 (20260923174500): «solo alcanzas a quien está por debajo de ti», como Dynamic. Por debajo = todos sus módulos los ves tú y tiene menos que tú. El líder alcanza a todo el que no es líder.';

create or replace function retail.fn_exigir_alcanzo_a(p_persona_id uuid, p_accion text) returns void
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
declare
  v_faltan text[];
begin
  if retail.fn_alcanzo_a(p_persona_id) then
    return;
  end if;
  -- A un líder lo frena la regla del Admin (20260923163000), con su propio mensaje: aquí no se repite.
  if exists (select 1 from retail.colaboradores where persona_id = p_persona_id and rol = 'lider')
     or exists (select 1 from retail.colaboradores_suspendidos where persona_id = p_persona_id and rol = 'lider') then
    return;
  end if;
  v_faltan := retail.fn_modulos_que_no_tengo(retail.fn_modulos_de_persona(p_persona_id));
  if cardinality(v_faltan) > 0 then
    raise exception 'No puedes % a esa persona: solo alcanzas a quien está por debajo de ti, y ella ve módulos que tú no ves (%). Pídeselo a un líder.',
      p_accion, array_to_string(v_faltan, ', ') using errcode = '42501', hint = 'solo_alcanzas_por_debajo';
  end if;
  raise exception 'No puedes % a esa persona: solo alcanzas a quien está por debajo de ti, y ella tiene los mismos módulos que tú. Pídeselo a un líder.',
    p_accion using errcode = '42501', hint = 'solo_alcanzas_por_debajo';
end;
$$;

-- Para la pantalla: a quiénes NO alcanza la sesión (así no ofrece acciones que la base rechazaría). Vacío para un líder.
-- En plpgsql para que el permiso se pregunte ANTES de mirar fila por fila (en SQL el orden del WHERE no está garantizado).
create or replace function retail.fn_fuera_de_mi_alcance() returns table (persona_id uuid)
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
begin
  if retail.fn_es_lider() or not (retail.fn_puede_gestionar_colaboradores() or retail.fn_puede_administrar_roles()) then
    return;
  end if;
  return query
    select x.persona_id
      from (select c.persona_id from retail.colaboradores c
            union select s.persona_id from retail.colaboradores_suspendidos s) x
     where not retail.fn_alcanzo_a(x.persona_id);
end;
$$;

do $$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_modulos_de_persona(uuid)', 'retail.fn_alcanzo_a(uuid)',
                             'retail.fn_exigir_alcanzo_a(uuid, text)', 'retail.fn_fuera_de_mi_alcance()'] loop
    execute format('revoke all on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated, service_role', v_f);
  end loop;
end $$;

-- ==================== 2. Se exige donde se toca a una persona ====================
-- Suspender, reactivar, quitar y cambiar de ubicación: cuando la persona NO es líder (a un líder, solo un Admin).
select pg_temp.reemplazar_alc('retail.fn_exigir_puede_tocar_colaborador(uuid, text)',
  $v$  if not v_es_lider then
    return;$v$,
  $n$  if not v_es_lider then
    perform retail.fn_exigir_alcanzo_a(p_persona_id, p_accion); -- ADR-0178: solo alcanzas a quien está por debajo
    return;$n$, 1);

-- Cambiarle el rol a una persona (después de «no puedes cambiar tu propio rol», que tiene su propio mensaje).
select pg_temp.reemplazar_alc('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$    if p_persona_id = v_yo then$v$,
  $n$    perform retail.fn_exigir_alcanzo_a(p_persona_id, 'cambiarle el rol'); -- ADR-0178: solo alcanzas a quien está por debajo
    if p_persona_id = v_yo then$n$, 1);

-- ==================== 3. Verificación ====================
do $$
begin
  if position('fn_exigir_alcanzo_a(p_persona_id, p_accion)' in pg_get_functiondef('retail.fn_exigir_puede_tocar_colaborador(uuid, text)'::regprocedure)) = 0
     or position('fn_exigir_alcanzo_a(p_persona_id, ''cambiarle el rol'')' in pg_get_functiondef('retail.asignar_rol(uuid, uuid, uuid, uuid)'::regprocedure)) = 0 then
    raise exception 'Quedó sin el candado «solo alcanzas a quien está por debajo»';
  end if;
end $$;
