-- =====================================================================================================================
-- El combo «Responsable» firma TODAS las operaciones, no solo las de tienda (ADR-0161, actualización de la A8).
-- Felipe, 2026-09-23: «En todo debe estar el combo», con el MISMO candado de asistencia (A9) en todas partes.
--
-- EL PROBLEMA. La F3 del ADR-0162 (20260923100000) separó las funciones en «de tienda» (firma el responsable del
-- combo) y «no de tienda» (Compras, Producción, Colaboradores: firma siempre la cuenta). Esa separación suponía que
-- Compras era trabajo de oficina del líder. Un día después, Compras se abrió a las tiendas (ADR-0184) y los módulos a
-- los roles: una terminal de tienda ya puede recibir mercadería o registrar un comprobante, pero sin combo no puede
-- mandar responsable y la base la rechaza («Elige quién hace esta operación»); con cuenta de persona, firma la cuenta
-- aunque haya hecho el trabajo otra.
--
-- LA REGLA NUEVA. Toda función que guarda y firma a una persona firma con `fn_actor_persona_id(true)`. Quedan con
-- `(false)` SOLO los usos que son PERMISO, no firma (con sesión de persona, `(false)` es la cuenta):
--   · fn_alcanzo_a            — «¿alcanzo a esta persona?»: se compara con la cuenta, nunca con el responsable.
--   · quitar_colaborador      — «no te quites a ti mismo» (la firma va por fn_historial_colaborador, abajo).
--   · asignar_rol             — «no te cambies tu propio rol»; el historial pasa a firmarlo el responsable.
--   · suspender_colaborador   — «no te suspendas a ti mismo»; quien suspende (suspendido_por) pasa al responsable.
-- Y dos que firmaban buscando la cuenta en línea pasan al actor: fn_historial_colaborador y desactivar_terminal.
--
-- FALLA CERRADA. Aborta sin tocar nada si al final queda un `(false)` fuera de esas 4 o si alguna de las 4 cambió.
-- Re-ejecutable. Una migración futura que recree una de estas funciones copiando su texto viejo con `(false)` la
-- devuelve a firmar con la cuenta: vuelve a pegar esta después.
--
-- PRODUCCIÓN: se pega con `set search_path to retail, public;` al principio (las funciones ya van calificadas).
-- =====================================================================================================================

create or replace function pg_temp.reemplazar_una(p_firma text, p_viejo text, p_nuevo text)
returns void language plpgsql as $f$
declare
  v_def text;
  v_n integer;
begin
  if to_regprocedure(p_firma) is null then
    raise notice '% no existe en esta base; se omite (al pegar su migración, volver a pegar esta).', p_firma;
    return;
  end if;
  v_def := pg_get_functiondef(p_firma::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, p_viejo, ''))) / length(p_viejo);
  if v_n = 0 and position(p_nuevo in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if v_n <> 1 then
    raise exception '% cambió desde que se escribió esta migración: se esperaba 1 vez «%» y hay %. Regenera el reemplazo desde su definición real.',
      p_firma, p_viejo, v_n;
  end if;
  execute replace(v_def, p_viejo, p_nuevo);
end;
$f$;

-- ==================== 1. Permiso y firma, separados, en las funciones que usan a la persona para las dos cosas ============
-- asignar_rol: v_yo (la cuenta) sigue decidiendo «no te cambies tu propio rol»; el historial lo firma el responsable.
select pg_temp.reemplazar_una(
  'retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$'ubicacion_id', case when v_rol_cuenta = 'lider' and not v_a_lider then v_ubicacion end),
        v_yo);$v$,
  $n$'ubicacion_id', case when v_rol_cuenta = 'lider' and not v_a_lider then v_ubicacion end),
        retail.fn_actor_persona_id(true));$n$);

-- suspender_colaborador: v_quien (la cuenta) sigue decidiendo «no te suspendas a ti mismo»; suspendido_por = responsable.
select pg_temp.reemplazar_una(
  'retail.suspender_colaborador(uuid, text)',
  'v_fila.created_at, v_quien, v_motivo,',
  'v_fila.created_at, retail.fn_actor_persona_id(true), v_motivo,');

-- fn_historial_colaborador (lo llaman agregar/quitar/suspender/reactivar): firmaba buscando la cuenta en línea.
do $h$
declare
  r record;
  v_def text;
  v_hechas integer := 0;
begin
  for r in select p.oid from pg_proc p
            where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_historial_colaborador', 'desactivar_terminal') loop
    v_def := pg_get_functiondef(r.oid);
    if v_def ~ '\(select\s+(p\.)?id\s+from\s+public\.personas(\s+p)?\s+where\s+(p\.)?auth_user_id\s*=\s*auth\.uid\(\)\)' then
      execute regexp_replace(v_def,
        '\(select\s+(p\.)?id\s+from\s+public\.personas(\s+p)?\s+where\s+(p\.)?auth_user_id\s*=\s*auth\.uid\(\)\)',
        'retail.fn_actor_persona_id(true)', 'g');
      v_hechas := v_hechas + 1;
    elsif v_def !~ 'fn_actor_persona_id\(true\)' then
      raise exception '% ya no firma con la cuenta ni con el actor: cambió, revísala a mano.', r.oid::regprocedure;
    end if;
  end loop;
  raise notice 'Historial de colaboradores y terminales: % funciones pasan a firmar con el responsable.', v_hechas;
end
$h$;

-- ==================== 2. El resto: toda firma con (false) pasa a (true) ====================
do $migracion$
declare
  -- Usan (false) como PERMISO (la cuenta), no como firma. No se tocan.
  v_permiso constant text[] := array['fn_alcanzo_a', 'quitar_colaborador', 'asignar_rol', 'suspender_colaborador'];
  r record;
  v_def text;
  v_hechas integer := 0;
  v_quedan text[];
begin
  if to_regprocedure('retail.fn_actor_persona_id(boolean)') is null then
    raise exception 'Falta la F2 del ADR-0162 (retail.fn_actor_persona_id): pega antes 20260923010000_terminales_sin_persona.sql';
  end if;

  for r in select p.oid, p.proname from pg_proc p
            where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f'
              and p.proname <> all (v_permiso) and p.proname <> 'fn_actor_persona_id'
              and pg_get_functiondef(p.oid) like '%fn_actor_persona_id(false)%' loop
    v_def := pg_get_functiondef(r.oid);
    execute replace(v_def, 'fn_actor_persona_id(false)', 'fn_actor_persona_id(true)');
    v_hechas := v_hechas + 1;
  end loop;

  -- Falla cerrada: lo único que queda con (false) son las de permiso, y cada una exactamente una vez.
  select array_agg(p.proname order by p.proname) into v_quedan
    from pg_proc p
   where p.pronamespace = 'retail'::regnamespace and p.prokind = 'f' and p.proname <> 'fn_actor_persona_id'
     and pg_get_functiondef(p.oid) like '%fn_actor_persona_id(false)%'
     and (p.proname <> all (v_permiso)
          or (length(pg_get_functiondef(p.oid)) - length(replace(pg_get_functiondef(p.oid), 'fn_actor_persona_id(false)', '')))
             / length('fn_actor_persona_id(false)') <> 1);
  if v_quedan is not null then
    raise exception 'Quedaron firmando con la cuenta (o cambió una de permiso): %. Revísalas a mano.', v_quedan;
  end if;

  raise notice 'Responsable en todo: % funciones pasan a firmar con el responsable del combo.', v_hechas;
end
$migracion$;

comment on function retail.fn_actor_persona_id(boolean) is
  'ADR-0162: quién FIRMA la operación. Desde 20260923230000 toda función que guarda llama con true: firma el responsable del combo (x-responsable presente en la sede x-ubicacion). false queda solo para PERMISOS que se comparan con la cuenta (fn_alcanzo_a, «no te quites/suspendas/cambies el rol a ti mismo»). NO decide permisos: eso es de la cuenta (fn_es_lider, fn_puede_*).';
