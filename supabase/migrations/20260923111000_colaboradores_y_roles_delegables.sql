-- ============================================================================
-- 20260923111000_colaboradores_y_roles_delegables.sql — CAYLA V2 · ADR-0161 B, cambio de alcance del 2026-09-22
--
-- EL PROBLEMA PRIMERO. Colaboradores, y Roles y accesos, eran los dos módulos «siempre solo del líder» (`modulos.solo_lider`,
-- ADR-0150 decisión 3). Felipe decidió el 2026-09-22 que también se pueden dar a cualquier rol: quien los tenga usa esos
-- módulos completos (dar, quitar, suspender y reactivar accesos; cambiar ubicación; aprobar altas; crear, editar,
-- duplicar, renombrar, archivar y restaurar roles; asignar roles a personas y terminales; ver, crear, desactivar y
-- reactivar terminales y cambiarles la clave). Hasta hoy todas esas funciones preguntaban `fn_es_lider()`.
--
-- EL RIESGO. Un módulo que da poder sobre los permisos puede usarse para darse más poder. La decisión lo acepta dentro de
-- lo delegable (quien tiene Roles puede editar SUS propios módulos; queda en roles_historial). Lo que NO se acepta es que
-- el sistema quede sin control. Por eso, TRES PROTECCIONES MÍNIMAS — «decisión de arquitectura, revisable»: Felipe puede
-- vetarlas; están escritas aquí y en el ADR-0161:
--   1. El rol «Líder de equipo» sigue fijo: nadie lo edita ni lo archiva (ya era así: `roles.fijo`, guardar_modulos_rol,
--      renombrar_rol, archivar_rol). No cambia.
--   2. Solo un LÍDER toca a un líder. Hoy NINGUNA función da el rol Líder (ser líder es `colaboradores.rol = 'lider'` y se
--      da por SQL); `asignar_rol` rechaza asignar el rol Líder y cambiarle el rol a un líder, llame quien llame — eso se
--      conserva tal cual, es MÁS estricto que la regla. Lo nuevo: quien no es líder no puede QUITAR, SUSPENDER ni REACTIVAR
--      a un líder (reactivar a un líder suspendido es devolverle el poder de líder). Un líder sí, como hoy.
--   3. Nunca se quita ni se suspende al ÚLTIMO líder activo. Hasta hoy lo cuidaba de rebote «no te quites a ti mismo» (solo
--      un líder podía actuar); con el módulo abierto hace falta explícito. Degradar a un líder no existe como operación.
--   Además se conserva «no te quites / no te suspendas a ti mismo» (quitar_colaborador, suspender_colaborador).
--
-- CLASIFICACIÓN (inventario de producción, 2026-09-22; cada `fn_es_lider()` y QUÉ protegía)
--   Capacidad nueva `fn_puede_gestionar_colaboradores()` = líder o un rol con Colaboradores:
--     · agregar_colaborador, agregar_colaboradores, fn_aprobar_alta_colaborador, cambiar_ubicacion_colaborador,
--       quitar_colaborador, suspender_colaborador, reactivar_colaborador            → gestionar accesos (el candado de
--       entrada y su mensaje). quitar/suspender/reactivar además llaman a `fn_exigir_puede_tocar_colaborador` (2 y 3).
--     · fn_colaboradores, fn_colaboradores_pendientes, fn_colaboradores_suspendidos, fn_colaboradores_inactivos,
--       fn_colaboradores_actividad, fn_dynamic_disponibles                            → LEER las listas de la pantalla.
--     · fn_terminales, desactivar_terminal, reactivar_terminal                        → las terminales viven en una pestaña
--       de Colaboradores. Crearlas y cambiarles la clave lo hace la web con la llave de servicio (app/actions/
--       terminales.ts), que ahora pregunta esta misma capacidad antes de abrir la llave.
--     · políticas colaboradores_select, colaboradores_suspendidos_select, colaboradores_historial_select,
--       terminales_select (esta conserva «o la terminal se ve a sí misma»)             → leer las tablas directo.
--   Capacidad nueva `fn_puede_administrar_roles()` = líder o un rol con Roles y accesos:
--     · fn_exigir_lider_de_roles() — el candado ÚNICO de crear_rol, guardar_modulos_rol, renombrar_rol, archivar_rol,
--       restaurar_rol, asignar_rol y fn_cuentas_con_rol. Se cambia su interior; conserva el nombre (lo llaman 7
--       funciones; renombrarlo obligaría a recrearlas todas).
--     · políticas roles_select, rol_modulos_select, roles_historial_select.
--   NO CAMBIAN: fn_es_lider (identidad), fn_mi_perfil, fn_mis_modulos/fn_ve_modulo (el líder ve todo), asignar_rol (sus
--   candados del rol Líder se quedan), fn_historial_colaborador (solo anota), los disparadores de coherencia de rol.
--
-- SE ROMPE SI
--   · Se vuelve a pegar 20260923030000 entero: devuelve `solo_lider = true` a los dos módulos (falla CERRADO: los roles
--     que los tengan dejan de recibirlos; la base rechaza de nuevo encenderlos). Volver a pegar esta.
--   · Otra migración recrea alguna de estas funciones con su cuerpo viejo: vuelve «solo el líder» (también cerrado).
--   · Se agrega una RPC que ponga `colaboradores.rol = 'lider'`: tiene que exigir `fn_es_lider()` (protección 2).
--
-- Re-ejecutable. Mismas reglas de pegado que 20260923110000 (`set search_path to retail, public, extensions;` al pegar en
-- producción). Requiere 20260923030000 (roles por módulo).
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_capacidad_por_modulos(text[])') is null then
    raise exception 'Falta la migración de roles por módulo (retail.fn_capacidad_por_modulos): pega antes 20260923030000_roles_por_modulo.sql';
  end if;
end $$;

-- ==================== 0. Herramienta temporal (misma que 20260923110000; nombre propio para no chocar) ====================
create or replace function pg_temp.reemplazar_colab(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

-- ==================== 1. Capacidades y las dos protecciones ====================
create or replace function retail.fn_puede_gestionar_colaboradores() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['colaboradores']); $$;

comment on function retail.fn_puede_gestionar_colaboradores() is
  'Líder, o un rol que ve Colaboradores (ADR-0161, 20260923111000). Dar, quitar, suspender y reactivar accesos; ubicación; altas; terminales. A un líder solo lo toca un líder (fn_exigir_puede_tocar_colaborador).';

create or replace function retail.fn_puede_administrar_roles() returns boolean
language sql stable set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['roles']); $$;

comment on function retail.fn_puede_administrar_roles() is
  'Líder, o un rol que ve Roles y accesos (ADR-0161, 20260923111000). Crear, editar, archivar y asignar roles; el rol Líder no se toca (fijo) ni se asigna.';

-- Protecciones 2 y 3 (ver cabecera). `p_accion`: 'quitar', 'suspender' o 'reactivar'. Security definer: lee las dos tablas
-- de colaboradores sin depender de la RLS de quien llama.
create or replace function retail.fn_exigir_puede_tocar_colaborador(p_persona_id uuid, p_accion text) returns void
language plpgsql stable security definer
set search_path = retail, public, extensions
as $fn$
declare
  v_es_lider boolean;
begin
  v_es_lider := exists (select 1 from retail.colaboradores where persona_id = p_persona_id and rol = 'lider')
             or exists (select 1 from retail.colaboradores_suspendidos where persona_id = p_persona_id and rol = 'lider');
  if not v_es_lider then
    return;
  end if;
  -- 2. A un líder solo lo toca un líder.
  if not retail.fn_es_lider() then
    raise exception 'Solo un líder de equipo puede % a otro líder', p_accion using errcode = '42501';
  end if;
  -- 3. Siempre queda al menos un líder activo.
  if p_accion in ('quitar', 'suspender')
     and exists (select 1 from retail.colaboradores where persona_id = p_persona_id and rol = 'lider' and estado = 'activo')
     and (select count(*) from retail.colaboradores c join public.personas p on p.id = c.persona_id
           where c.rol = 'lider' and c.estado = 'activo' and p.estado = 'activo') <= 1 then
    raise exception 'No se puede % al último líder activo: siempre tiene que quedar quien administre', p_accion using errcode = '42501';
  end if;
end;
$fn$;

comment on function retail.fn_exigir_puede_tocar_colaborador(uuid, text) is
  'ADR-0161 (20260923111000), protecciones 2 y 3: a un líder solo lo quita, suspende o reactiva otro líder, y nunca se quita ni se suspende al último líder activo. Decisión de arquitectura, revisable por Felipe.';

do $$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_puede_gestionar_colaboradores()', 'retail.fn_puede_administrar_roles()',
                             'retail.fn_exigir_puede_tocar_colaborador(uuid, text)'] loop
    execute format('revoke all on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated', v_f);
  end loop;
end $$;

-- ==================== 2. Colaboradores ====================
do $$
declare
  c_gestionar constant text := 'if not retail.fn_puede_gestionar_colaboradores() then';
  c_msg_viejo constant text := $v$'Solo un líder puede gestionar colaboradores'$v$;
  c_msg_nuevo constant text := $v$'Gestionar colaboradores necesita el módulo Colaboradores en tu rol' using errcode = '42501'$v$;
  v_f text;
begin
  foreach v_f in array array['retail.agregar_colaborador(uuid, uuid)', 'retail.agregar_colaboradores(uuid[], uuid)',
                             'retail.cambiar_ubicacion_colaborador(uuid, uuid)', 'retail.quitar_colaborador(uuid)',
                             'retail.suspender_colaborador(uuid, text)', 'retail.reactivar_colaborador(uuid)'] loop
    perform pg_temp.reemplazar_colab(v_f, 'if not fn_es_lider() then', c_gestionar, 1);
    perform pg_temp.reemplazar_colab(v_f, c_msg_viejo, c_msg_nuevo, 1);
  end loop;

  perform pg_temp.reemplazar_colab('retail.fn_aprobar_alta_colaborador(uuid)', 'if not fn_es_lider() then', c_gestionar, 1);
  perform pg_temp.reemplazar_colab('retail.fn_aprobar_alta_colaborador(uuid)',
    $v$'Solo un líder puede aprobar el alta de un colaborador'$v$,
    $v$'Aprobar un alta necesita el módulo Colaboradores en tu rol' using errcode = '42501'$v$, 1);

  -- Protecciones 2 y 3, justo después del candado de entrada.
  perform pg_temp.reemplazar_colab('retail.quitar_colaborador(uuid)',
    'v_quien := retail.fn_actor_persona_id(false);',
    $v$perform retail.fn_exigir_puede_tocar_colaborador(p_persona_id, 'quitar'); -- ADR-0161 (20260923111000)
  v_quien := retail.fn_actor_persona_id(false);$v$, 1);
  perform pg_temp.reemplazar_colab('retail.suspender_colaborador(uuid, text)',
    'v_quien := retail.fn_actor_persona_id(false);',
    $v$perform retail.fn_exigir_puede_tocar_colaborador(p_persona_id, 'suspender'); -- ADR-0161 (20260923111000)
  v_quien := retail.fn_actor_persona_id(false);$v$, 1);
  perform pg_temp.reemplazar_colab('retail.reactivar_colaborador(uuid)',
    'select * into v_fila from colaboradores_suspendidos where persona_id = p_persona_id for update;',
    $v$perform retail.fn_exigir_puede_tocar_colaborador(p_persona_id, 'reactivar'); -- ADR-0161 (20260923111000)
  select * into v_fila from colaboradores_suspendidos where persona_id = p_persona_id for update;$v$, 1);

  -- Las listas de la pantalla.
  perform pg_temp.reemplazar_colab('retail.fn_colaboradores()', 'where fn_es_lider() and', 'where retail.fn_puede_gestionar_colaboradores() and', 1);
  perform pg_temp.reemplazar_colab('retail.fn_colaboradores_pendientes()', 'where fn_es_lider() and', 'where retail.fn_puede_gestionar_colaboradores() and', 1);
  perform pg_temp.reemplazar_colab('retail.fn_colaboradores_suspendidos()', 'where fn_es_lider() and', 'where retail.fn_puede_gestionar_colaboradores() and', 1);
  perform pg_temp.reemplazar_colab('retail.fn_colaboradores_inactivos()', 'where fn_es_lider() and', 'where retail.fn_puede_gestionar_colaboradores() and', 1);
  perform pg_temp.reemplazar_colab('retail.fn_colaboradores_actividad(integer)', 'where fn_es_lider()', 'where retail.fn_puede_gestionar_colaboradores()', 1);
  perform pg_temp.reemplazar_colab('retail.fn_dynamic_disponibles()', 'and fn_es_lider()', 'and retail.fn_puede_gestionar_colaboradores()', 1);

  -- Terminales.
  perform pg_temp.reemplazar_colab('retail.fn_terminales()', 'if not retail.fn_es_lider() then', c_gestionar, 1);
  perform pg_temp.reemplazar_colab('retail.fn_terminales()', $v$'Solo un líder puede ver las terminales'$v$,
    $v$'Ver las terminales necesita el módulo Colaboradores en tu rol'$v$, 1);
  perform pg_temp.reemplazar_colab('retail.desactivar_terminal(uuid)', 'if not retail.fn_es_lider() then', c_gestionar, 1);
  perform pg_temp.reemplazar_colab('retail.desactivar_terminal(uuid)', $v$'Solo un líder puede desactivar una terminal'$v$,
    $v$'Desactivar una terminal necesita el módulo Colaboradores en tu rol'$v$, 1);
  perform pg_temp.reemplazar_colab('retail.reactivar_terminal(uuid)', 'if not retail.fn_es_lider() then', c_gestionar, 1);
  perform pg_temp.reemplazar_colab('retail.reactivar_terminal(uuid)', $v$'Solo un líder puede reactivar una terminal'$v$,
    $v$'Reactivar una terminal necesita el módulo Colaboradores en tu rol'$v$, 1);
end $$;

-- ==================== 3. Roles y accesos ====================
do $$
begin
  perform pg_temp.reemplazar_colab('retail.fn_exigir_lider_de_roles()', 'if not retail.fn_es_lider() then',
    'if not retail.fn_puede_administrar_roles() then', 1);
  perform pg_temp.reemplazar_colab('retail.fn_exigir_lider_de_roles()', $v$'Solo un líder puede administrar roles'$v$,
    $v$'Administrar roles necesita el módulo Roles y accesos en tu rol'$v$, 1);
end $$;

comment on function retail.fn_exigir_lider_de_roles() is
  'Candado de las RPC de roles. Desde 20260923111000: líder O un rol con Roles y accesos (fn_puede_administrar_roles); el nombre se conserva porque lo llaman 7 funciones.';

-- ==================== 4. Políticas de lectura ====================
-- Se verifica que cada una sea la que se inventarió antes de reemplazarla (pg_policies escribe la expresión según el
-- search_path: con `retail` primero sale sin prefijo).
do $$
declare
  r record;
  v_qual text;
begin
  for r in select * from (values
      ('colaboradores', 'colaboradores_select', '^(retail\.)?fn_es_lider\(\)$', 'retail.fn_puede_gestionar_colaboradores()'),
      ('colaboradores_suspendidos', 'colaboradores_suspendidos_select', '^(retail\.)?fn_es_lider\(\)$', 'retail.fn_puede_gestionar_colaboradores()'),
      ('colaboradores_historial', 'colaboradores_historial_select', '^(retail\.)?fn_es_lider\(\)$', 'retail.fn_puede_gestionar_colaboradores()'),
      ('terminales', 'terminales_select', '^\(?(retail\.)?fn_es_lider\(\) OR \(auth_user_id = auth\.uid\(\)\)\)?$',
         'retail.fn_puede_gestionar_colaboradores() or auth_user_id = auth.uid()'),
      ('roles', 'roles_select', '^(retail\.)?fn_es_lider\(\)$', 'retail.fn_puede_administrar_roles()'),
      ('rol_modulos', 'rol_modulos_select', '^(retail\.)?fn_es_lider\(\)$', 'retail.fn_puede_administrar_roles()'),
      ('roles_historial', 'roles_historial_select', '^(retail\.)?fn_es_lider\(\)$', 'retail.fn_puede_administrar_roles()')
    ) x(tabla, politica, vieja, nueva) loop
    select qual into v_qual from pg_policies where schemaname = 'retail' and tablename = r.tabla and policyname = r.politica;
    if v_qual is null then
      raise exception 'Falta la política %.% — revisa qué cambió antes de pegar esta migración', r.tabla, r.politica;
    end if;
    if v_qual ~ 'fn_puede_(gestionar_colaboradores|administrar_roles)' then
      continue; -- ya aplicada
    end if;
    if v_qual !~ r.vieja then
      raise exception 'La política %.% cambió desde que se escribió esta migración (using: %). Revísala a mano.', r.tabla, r.politica, v_qual;
    end if;
    execute format('alter policy %I on retail.%I using (%s)', r.politica, r.tabla, r.nueva);
  end loop;
end $$;

-- ==================== 5. Verificación ====================
do $$
declare
  v_malas text[];
begin
  select array_agg(f) into v_malas from (values
    ('retail.agregar_colaborador(uuid, uuid)'), ('retail.agregar_colaboradores(uuid[], uuid)'),
    ('retail.cambiar_ubicacion_colaborador(uuid, uuid)'), ('retail.quitar_colaborador(uuid)'),
    ('retail.suspender_colaborador(uuid, text)'), ('retail.reactivar_colaborador(uuid)'),
    ('retail.fn_aprobar_alta_colaborador(uuid)'), ('retail.fn_colaboradores()'), ('retail.fn_colaboradores_pendientes()'),
    ('retail.fn_colaboradores_suspendidos()'), ('retail.fn_colaboradores_inactivos()'), ('retail.fn_colaboradores_actividad(integer)'),
    ('retail.fn_dynamic_disponibles()'), ('retail.fn_terminales()'), ('retail.desactivar_terminal(uuid)'), ('retail.reactivar_terminal(uuid)')
  ) x(f)
  where position('fn_puede_gestionar_colaboradores()' in pg_get_functiondef(f::regprocedure)) = 0;
  if v_malas is not null then
    raise exception 'Quedaron sin el candado nuevo: %', v_malas;
  end if;
  select array_agg(f) into v_malas from (values ('retail.quitar_colaborador(uuid)'), ('retail.suspender_colaborador(uuid, text)'),
      ('retail.reactivar_colaborador(uuid)')) x(f)
   where position('fn_exigir_puede_tocar_colaborador(' in pg_get_functiondef(f::regprocedure)) = 0;
  if v_malas is not null then
    raise exception 'Quedaron sin las protecciones de líder: %', v_malas;
  end if;
  if position('fn_puede_administrar_roles()' in pg_get_functiondef('retail.fn_exigir_lider_de_roles()'::regprocedure)) = 0 then
    raise exception 'fn_exigir_lider_de_roles quedó sin el candado nuevo';
  end if;
  -- Protección 1 y la parte ya existente de la 2: asignar_rol sigue rechazando el rol Líder y a los líderes.
  if pg_get_functiondef('retail.asignar_rol(uuid, uuid, uuid)'::regprocedure) not like '%v_rol.fijo%'
     or pg_get_functiondef('retail.asignar_rol(uuid, uuid, uuid)'::regprocedure) not like '%v_rol_cuenta = ''lider''%' then
    raise exception 'asignar_rol ya no rechaza el rol Líder o a un líder: revísala antes de abrir Roles y accesos';
  end if;
end $$;

-- ==================== 6. Los dos módulos se pueden dar a un rol ====================
-- AL FINAL a propósito: si algo de arriba abortó, siguen «siempre solo del líder» (falla cerrado). Las dos columnas juntas
-- por el check `modulos_solo_lider_no_delegable`.
update retail.modulos set solo_lider = false, delegable = true
 where clave in ('colaboradores', 'roles') and (solo_lider or not delegable);
