-- ============================================================================
-- 20260929160000_rendimiento_modulo_y_equipo.sql — ADR-0219 «Rendimiento: las ventas de cada
-- persona, para la encargada y el Admin». Primer paso: el módulo, quién ve qué tienda
-- (`fn_rendimiento_ubicaciones`) y la lectura del equipo de un mes (`fn_rendimiento_equipo`).
--
-- EL PROBLEMA PRIMERO. Desde el 2026-09-22 cada venta guarda quién atendió (`ventas.asesora_id`),
-- pero ninguna función agrupa por ella: la única que muestra cifras por persona
-- (`fn_comercial_colaboradoras`) agrupa por `usuario_id` (quien FIRMÓ, no quien ATENDIÓ) y no
-- tiene entrada en el menú. Es el punto 4 de R-41 («quién vende más y qué vende cada una»), sin
-- construir. Las 20 decisiones de negocio de Felipe (2026-09-26) ya están tomadas y el diseño
-- técnico está aprobado en el ADR; esta migración construye su primera mitad.
--
-- QUÉ TRAE:
--   1. El módulo `rendimiento` (grupo Gestión, orden 310). Nace SIN rol (ADR-0161): solo lo ve
--      el líder hasta que Felipe se lo da al rol de las encargadas en Roles y accesos.
--   2. `fn_rendimiento_ubicaciones()`: la única función que dice qué tiendas ve cada cuenta —
--      Admin, todas; con el módulo (el líder lo tiene siempre, `fn_ve_modulo`), la suya, SI es
--      una tienda (un Líder de oficina, sin tienda asignada, no ve ninguna); cualquier otro caso,
--      ninguna. La usan las lecturas de abajo y, después, el menú y la pantalla.
--   3. `fn_rendimiento_horas_nucleo(uuid[], date)`: las horas trabajadas del mes de
--      `public.jornadas` (Dynamic), por persona y por la ubicación de retail que corresponde a su
--      `sede_id`. Dynamic puede no tener la tabla en esta forma (local sin el stub, o un cambio de
--      esquema en producción todavía no reflejado acá): se degrada a «sin horas» para todos, igual
--      que ya hace `fn_asesoras_de_turno` (principio 9, nunca se rompe por esto).
--   4. `fn_rendimiento_equipo(date)`: una fila por persona que vendió en el mes, en las tiendas que
--      la cuenta puede ver (punto 2), con sus ventas, soles y horas. `es_encargada` = su rol tiene
--      el módulo `rendimiento` encendido (D-121: no hace falta otro dato). Sin argumento, el mes
--      calendario de Lima de hoy.
--
-- QUÉ NO TRAE TODAVÍA, a propósito (se construye después, no bloquea esta pantalla):
--   - Las demás cifras de la tabla (D-116): ticket promedio, % a precio completo, descuento dado,
--     cuadre de caja, bajada al piso. `fn_rendimiento_equipo` trae lo mínimo para los DOS
--     RANKINGS (D-121); el resto es una migración aparte sobre la misma función.
--   - `fn_rendimiento_persona` (la ficha de una persona) y `venta_reasignaciones` +
--     `reasignar_asesora` (la corrección de quién atendió, punto 4 del ADR, con su objeción
--     abierta sobre que la encargada se corrija a sí misma). Sin la corrección, hoy toda venta
--     queda a nombre de quien la caja registró.
--
-- LA CONTRACCIÓN DE EFRON-MORRIS (`apps/web/lib/rendimiento-reglas.ts`, no en esta migración):
-- esta función entrega el crudo (ventas, soles, horas); el ranking «vende más por hora» se
-- corrige en la web, no aquí — es una regla de PRESENTACIÓN (cómo se ordena y qué tanto se
-- confía en el número de cada quien), no del dato en sí. Mantenerla en TypeScript, con sus
-- pruebas, en vez de en SQL, es lo mismo que ya hace Frescura con su Kaplan-Meier.
--
-- CÓMO SE PEGA EN PRODUCCIÓN. Sola, en el SQL Editor, tal cual (trae `retail.` y su
-- `set search_path`), a cualquier hora, ANTES de publicar la web: con la web nueva y sin esto,
-- el menú no muestra Rendimiento ni al líder y la URL directa dice «Sin acceso». Al revés no pasa
-- nada. Solo un `insert` en una tabla de catálogo sin disparadores y `create or replace function`:
-- sin políticas, sin `drop trigger`, sin `alter` de tablas en uso (CLAUDE.md, «Políticas y
-- deadlocks»). Con `lock_timeout` de 3 s.
--
-- DE PASO (sección 5): `fn_exigir_rol_de_terminal` —el candado de la base que impide darle a una
-- TERMINAL un módulo «solo personas»— tenía su lista (`c_solo_personas`) desactualizada desde
-- ADR-0275 (20260929140000): le faltaba `cayla_global`, y ahora también le faltaría `rendimiento`.
-- Se corrige de una vez, con guarda de md5 (causa raíz, no dos parches seguidos).
--
-- SE ROMPE SI:
--   · alguien le da el módulo `rendimiento` a un rol de TERMINAL: `fn_ve_modulo` ya lo impide en
--     la base (exige un rol de persona, ADR-0161 P6), la web lo marca `MODULOS_SOLO_PERSONAS`, y
--     con la sección 5 de esta migración `fn_exigir_rol_de_terminal` también lo rechaza.
--   · una encargada opera DOS sedes algún día: `fn_ubicacion_actual_persona()` solo da una: es el
--     mismo «SE ROMPE SI» de D-69 que ya tienen Frescura y Actividad, no algo nuevo de aquí.
--   · Dynamic cambia el nombre de `jornadas.horas_trabajadas` o de `sede_id`: la excepción
--     `undefined_column` de `fn_rendimiento_horas_nucleo` lo atrapa y el ranking de soles por hora
--     queda vacío (nunca al ranking de número de ventas, que no depende de horas).
-- ============================================================================

set search_path = retail, public, extensions;
set lock_timeout = '3s';

do $$
begin
  if to_regprocedure('retail.fn_ve_modulo(text)') is null
     or to_regprocedure('retail.fn_es_admin()') is null
     or to_regprocedure('retail.fn_ubicacion_actual_persona()') is null
     or to_regclass('retail.modulos') is null then
    raise exception 'Faltan piezas base de módulos y roles: pega antes 20260923030000_roles_por_modulo.sql y 20260923163000_escalon_admin_desde_dynamic.sql.';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1. El módulo. Sin rol (ADR-0161): solo lo ve el líder hasta que Felipe se lo da en
--    Colaboradores ▸ Roles y accesos.
-- ----------------------------------------------------------------------------

insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
  ('rendimiento', 'Gestión', 'Rendimiento',
   'Ver las ventas de cada persona del equipo en el mes: dos rankings (soles por hora trabajada y número de ventas) y la ficha de cada quien. Solo para reconocer y acompañar — sin comisión ni bono, y las integrantes no ven el módulo (D-65, D-112, D-113).',
   310, false, true)
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Quién ve qué tienda. La usan las lecturas de abajo y, después, el menú y la pantalla.
-- ----------------------------------------------------------------------------

create or replace function retail.fn_rendimiento_ubicaciones()
returns uuid[]
language sql
stable
security definer
set search_path = retail, public, extensions
as $fn$
  select case
    when fn_es_admin() then
      coalesce((select array_agg(u.id) from ubicaciones u where u.activo and u.tipo = 'tienda'), '{}'::uuid[])
    when fn_ve_modulo('rendimiento')
         and exists (select 1 from ubicaciones u
                       where u.id = fn_ubicacion_actual_persona() and u.activo and u.tipo = 'tienda')
      then array[fn_ubicacion_actual_persona()]
    else '{}'::uuid[]
  end;
$fn$;

comment on function retail.fn_rendimiento_ubicaciones() is
  'ADR-0219 (respuesta 7): las tiendas que Rendimiento le muestra a la cuenta que llama. Admin (fn_es_admin): todas las tiendas activas. Con el módulo rendimiento (el líder lo tiene siempre, fn_ve_modulo) y una tienda asignada que sea de tipo tienda: solo esa. Cualquier otro caso (un Líder de oficina sin tienda, una integrante sin el módulo, una terminal): ninguna — la pantalla y el menú lo leen como "sin acceso a esta vista", nunca como una tabla vacía.';

revoke all on function retail.fn_rendimiento_ubicaciones() from public, anon;
grant execute on function retail.fn_rendimiento_ubicaciones() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Las horas trabajadas del mes, de Dynamic (public.jornadas), con degradación si la tabla no
--    está en la forma esperada (principio 9, mismo patrón que fn_asesoras_de_turno).
-- ----------------------------------------------------------------------------

create or replace function retail.fn_rendimiento_horas_nucleo(p_ubicaciones uuid[], p_mes date)
returns table (persona_id uuid, ubicacion_id uuid, horas numeric)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $fn$
begin
  begin
    return query execute $q$
      select j.persona_id, u.id as ubicacion_id, sum(j.horas_trabajadas)::numeric as horas
        from public.jornadas j
        join retail.ubicaciones u on u.sede_dynamic_id = j.sede_id
       where u.id = any($1)
         and j.fecha >= $2
         and j.fecha < ($2 + interval '1 month')::date
         and j.horas_trabajadas is not null
       group by j.persona_id, u.id
    $q$ using p_ubicaciones, p_mes;
  exception when undefined_table or undefined_column then
    -- Dynamic no está disponible tal como esta función lo espera (local sin el stub, o un cambio
    -- de forma en producción todavía no reflejado acá). Nunca se rompe Rendimiento por esto: se
    -- degrada a «sin horas» para todos, igual que una tienda sin jornadas cargadas.
    return;
  end;
end;
$fn$;

comment on function retail.fn_rendimiento_horas_nucleo(uuid[], date) is
  'ADR-0219 (D-116, «Horas trabajadas»): suma de public.jornadas.horas_trabajadas por persona y por la ubicación de retail cuya sede_dynamic_id enlaza con jornadas.sede_id, del mes calendario que empieza en p_mes. Con Dynamic en otra forma (undefined_table/undefined_column), tabla vacía en vez de error. No filtra por rol: la usa fn_rendimiento_equipo, que ya filtró las ubicaciones antes de llamarla.';

revoke all on function retail.fn_rendimiento_horas_nucleo(uuid[], date) from public, anon;
grant execute on function retail.fn_rendimiento_horas_nucleo(uuid[], date) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. El equipo del mes: una fila por persona que vendió, en las tiendas que la cuenta ve.
-- ----------------------------------------------------------------------------

create or replace function retail.fn_rendimiento_equipo(p_mes date default null)
returns table (
  ubicacion_id uuid,
  ubicacion_nombre text,
  persona_id uuid,
  nombre text,
  es_encargada boolean,
  ventas integer,
  soles numeric,
  horas numeric
)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
set plan_cache_mode = force_custom_plan
as $fn$
declare
  v_mes date := coalesce(
    date_trunc('month', p_mes)::date,
    date_trunc('month', (now() at time zone 'America/Lima'))::date
  );
  v_desde timestamptz := (v_mes::timestamp) at time zone 'America/Lima';
  v_hasta timestamptz := ((v_mes + interval '1 month')::timestamp) at time zone 'America/Lima';
  v_ubicaciones uuid[] := fn_rendimiento_ubicaciones();
begin
  if v_ubicaciones is null or array_length(v_ubicaciones, 1) is null then
    return; -- sin tiendas que ver: tabla vacía, la pantalla ya sabe leer eso como «sin acceso»
  end if;

  return query
  with ventas_del_mes as (
    -- ADR-0219, punto 2: cuenta = completada, no de prueba, dentro del mes de Lima. Es de quien
    -- ATENDIÓ (asesora_id), no de quien firmó (usuario_id). Soles = suma de subtotales, la misma
    -- que fn_ventas_del_dia, con IGV.
    select v.ubicacion_id, v.asesora_id as persona_id,
           count(distinct v.id)::integer as n_ventas,
           coalesce(sum(vi.subtotal), 0)::numeric as soles
      from ventas v
      join venta_items vi on vi.venta_id = v.id
     where v.ubicacion_id = any(v_ubicaciones)
       and v.estado = 'completada'
       and not v.es_prueba
       and v.asesora_id is not null
       and v.created_at >= v_desde
       and v.created_at < v_hasta
     group by v.ubicacion_id, v.asesora_id
  ),
  horas_del_mes as (
    select h.persona_id, h.ubicacion_id, h.horas
      from fn_rendimiento_horas_nucleo(v_ubicaciones, v_mes) h
  )
  select
    vm.ubicacion_id,
    u.nombre as ubicacion_nombre,
    vm.persona_id,
    coalesce(nullif(trim(p.nombres || ' ' || left(coalesce(p.apellidos, ''), 1) || '.'), '.'), 'Sin nombre') as nombre,
    exists (
      select 1 from colaboradores c
      join rol_modulos rm on rm.rol_id = c.rol_id
     where c.persona_id = vm.persona_id and rm.modulo = 'rendimiento'
    ) as es_encargada,
    vm.n_ventas as ventas,
    vm.soles,
    hm.horas
  from ventas_del_mes vm
  join ubicaciones u on u.id = vm.ubicacion_id
  left join public.personas p on p.id = vm.persona_id
  left join horas_del_mes hm on hm.persona_id = vm.persona_id and hm.ubicacion_id = vm.ubicacion_id
  order by u.nombre, nombre;
end;
$fn$;

comment on function retail.fn_rendimiento_equipo(date) is
  'ADR-0219: una fila por persona con al menos una venta en el mes (p_mes, por defecto el mes calendario de Lima de hoy), en las tiendas de fn_rendimiento_ubicaciones(). ventas/soles de ventas completadas, sin prueba, de ventas.asesora_id (quien atendió, no quien firmó); soles = suma de venta_items.subtotal, con IGV. horas = fn_rendimiento_horas_nucleo (null sin jornadas). es_encargada = su rol tiene el módulo rendimiento encendido (D-121). No trae ticket promedio, % a precio completo, descuento, cuadre de caja ni bajada al piso todavía (migración aparte). Los dos rankings y la contracción de Efron-Morris de «soles por hora» son de apps/web/lib/rendimiento-reglas.ts, no de aquí.';

revoke all on function retail.fn_rendimiento_equipo(date) from public, anon;
grant execute on function retail.fn_rendimiento_equipo(date) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. `fn_exigir_rol_de_terminal`: suma «rendimiento» a `c_solo_personas» — y de paso «cayla_global»,
--    que quedó fuera desde ADR-0275 (20260929140000) sin que nadie lo notara hasta ahora. Con guarda
--    de md5 sobre el cuerpo vivo (parches-vivos-se-pierden-al-recrear): si alguien la parchó después,
--    esto aborta en vez de pisarlo.
-- ----------------------------------------------------------------------------

do $$
declare
  v_actual text;
begin
  select md5(p.prosrc) into v_actual
    from pg_proc p where p.oid = to_regprocedure('retail.fn_exigir_rol_de_terminal(uuid, text)');
  if v_actual is null then
    raise exception 'fn_exigir_rol_de_terminal no existe: pega antes 20260923140000_modulos_seis_decisiones.sql.';
  end if;
  if v_actual <> '58ee419dc2bbdddda6b7576efd7a3dd1' then
    raise exception 'fn_exigir_rol_de_terminal tiene otro cuerpo (md5 %): alguien la cambió en vivo después del 2026-09-29. Reescribe la sección 5 de esta migración desde su definición real antes de pegar.', v_actual;
  end if;
end $$;

create or replace function retail.fn_exigir_rol_de_terminal(p_rol_id uuid, p_modulo text default null)
returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $fn$
declare
  c_solo_personas constant text[] := array['colaboradores', 'roles', 'actividad', 'cayla_global', 'rendimiento'];
  v_rol retail.roles;
  v_terminales text;
  v_modulos text;
begin
  if p_modulo is not null and not (p_modulo = any (c_solo_personas)) then
    return;
  end if;
  select * into v_rol from retail.roles where id = p_rol_id for update;
  if v_rol.id is null then
    return; -- el disparador de coherencia ya dice «ese rol no existe»
  end if;

  if p_modulo is null then
    -- Se le da este rol a una terminal: el rol no puede incluir los módulos de personas.
    select string_agg(m.nombre, ' y ' order by m.orden) into v_modulos
      from retail.rol_modulos rm join retail.modulos m on m.clave = rm.modulo
     where rm.rol_id = p_rol_id and rm.modulo = any (c_solo_personas);
    if v_modulos is not null then
      raise exception 'Una terminal no puede tener el rol «%»: incluye %, que solo se dan a personas. Elige otro rol o quítale esos módulos.', v_rol.nombre, v_modulos
        using errcode = '23514', hint = 'rol_solo_personas';
    end if;
  else
    -- Se enciende un módulo de personas en un rol: no puede tenerlo ninguna terminal.
    select string_agg(t.nombre, ', ' order by t.nombre) into v_terminales from retail.terminales t where t.rol_id = p_rol_id;
    if v_terminales is not null then
      raise exception '«%» solo se da a personas, y el rol «%» lo tienen terminales (%). Dales otro rol antes de encenderlo.',
        (select nombre from retail.modulos where clave = p_modulo), v_rol.nombre, v_terminales
        using errcode = '23514', hint = 'rol_solo_personas';
    end if;
  end if;
end;
$fn$;

comment on function retail.fn_exigir_rol_de_terminal(uuid, text) is
  'ADR-0161 P6: una terminal nunca puede tener un módulo «solo personas» (colaboradores, roles, actividad, cayla_global, rendimiento). Sin p_modulo: valida el rol completo al dárselo a una terminal. Con p_modulo: valida que ningún rol de terminal tenga ese módulo antes de encenderlo. Actualizada 20260929160000 (sumó cayla_global, que faltaba desde ADR-0275, y rendimiento, ADR-0219).';

reset lock_timeout;

notify pgrst, 'reload schema';
