-- ============================================================================
-- 20260923160000_escalon_admin_desde_dynamic.sql — CAYLA V2 · ADR-0178 (Felipe, 2026-09-23)
--
-- EL PROBLEMA PRIMERO. Entre líderes no había jerarquía: los 9 líderes de producción podían lo mismo, y por la regla L1
-- (20260923110000) cualquiera bajaba, suspendía, quitaba o movía de sede a cualquier otro líder — incluidos Felipe y la
-- socia. Cuatro de esos 9 son del equipo de sistemas (practicantes). Y quien tenía Roles y accesos SIN ser líder podía
-- armar un rol con los 23 módulos y asignarlo, o encenderle módulos a su PROPIO rol: delegar Roles y accesos era, en la
-- práctica, delegar todo el ERP.
--
-- ANALOGÍA CAYLA. En la tienda, la encargada reparte las llaves del depósito, pero solo las que ella misma tiene; y las
-- llaves de las encargadas las entrega la dueña, no otra encargada. Hoy cualquiera con el llavero copiaba cualquier llave.
--
-- LO QUE DECIDIÓ FELIPE (2026-09-23):
--   1. Un escalón ADMIN por encima de Líder. Se LEE de Dynamic, no se marca en retail: es admin quien es
--      `public.personas.rol = 'admin'` en Dynamic Y es Líder activo en retail. Una sola fuente de verdad, y Dynamic ya
--      protege ese rol (su `fn_set_rol`: solo un admin nombra a otro admin). Hoy son 5 y los 5 ya son líderes aquí.
--   2. Lo ÚNICO que pasa a ser solo del Admin es administrar líderes (y admins): subir a alguien a Líder, cambiarle el
--      rol o la sede a un líder, suspenderlo, reactivarlo o quitarle el acceso. Todo lo demás que era del líder sigue del
--      líder (anular, series SUNAT, devoluciones, descuento sobre el tope…): `fn_es_lider()` NO cambia y es verdadera
--      también para un admin, así que las ~61 funciones que la llaman no se tocan.
--   3. «Solo das lo que tienes» — para quien administra roles o colaboradores SIN ser líder:
--        a. no enciende en un rol un módulo que él mismo no ve;
--        b. no asigna (a una persona o a una terminal) un rol con módulos que él no ve; tampoco crea un rol copiando uno así;
--        c. no edita los módulos de su propio rol (revierte la parte de B7 del ADR-0161 que lo permitía).
--      El líder no cambia: ve todo, así que puede dar todo.
--   4. El rol a medida «Administrador» (vacío, sin cuentas, creado el 2026-09-22) se ARCHIVA (no se borra: tiene historial).
--
-- PROTECCIONES QUE SE CONSERVAN: nadie se cambia su propio rol; siempre queda al menos un líder activo. SE SUMA: siempre
-- queda al menos un admin activo en retail (no se baja, suspende ni quita al último).
--
-- LÍMITE CONOCIDO. Si en Dynamic le quitan `admin` a todos, retail queda sin admins y nadie puede tocar a los líderes hasta
-- que Dynamic nombre uno. Es a propósito: el admin se administra en Dynamic.
--
-- CÓMO SE HACE (patrón del ADR-0160/0162 y de 20260923140000). Cada función se cambia desde su definición VIVA
-- (`pg_get_functiondef`) exigiendo el número exacto de ocurrencias (inventario hecho contra producción el 2026-09-23 con
-- `execute_sql` de solo lectura). Si una función cambió desde entonces, aborta sin dejar nada a medias. Re-ejecutable.
--
-- LO QUE LA ROMPE DESPUÉS:
--   · Volver a pegar 20260923110000 o 20260923131000 recrea asignar_rol / fn_exigir_puede_tocar_colaborador con
--     `fn_es_lider()` en vez de `fn_es_admin()` (cualquier líder vuelve a tocar a otro). Volver a pegar esta.
--   · Una función nueva que suba, baje o toque a un líder tiene que llamar a fn_exigir_puede_tocar_colaborador o
--     preguntar fn_es_admin(). Una nueva que asigne un rol, a fn_exigir_rol_dentro_de_lo_mio.
--   · El alta de terminales NO pasa por la base con la sesión de quien la crea (usa la llave de servicio): la regla 3b la
--     aplica la web preguntando `fn_rol_dentro_de_lo_mio` ANTES de insertar (`lib/terminales-alta.ts`).
--
-- Al pegar en el SQL Editor de producción: ya empieza con `set search_path to retail, public, extensions;` y todo lo que
-- crea va con `retail.`. Requiere 20260923110000, 20260923131000 y 20260923140000.
-- ============================================================================

set search_path = retail, public, extensions;

do $$
begin
  if to_regprocedure('retail.fn_puede_administrar_roles()') is null then
    raise exception 'Falta 20260923131000_colaboradores_y_roles_delegables.sql: pégala antes que esta';
  end if;
  if to_regprocedure('retail.fn_exigir_rol_de_terminal(uuid, text)') is null then
    raise exception 'Falta 20260923140000_modulos_seis_decisiones.sql: pégala antes que esta';
  end if;
  if to_regprocedure('retail.asignar_rol(uuid, uuid, uuid, uuid)') is null then
    raise exception 'Falta 20260923110000_cambiar_rol_entre_lideres.sql: pégala antes que esta';
  end if;
end $$;

-- ==================== 0. Herramienta temporal (vive en pg_temp, desaparece al cerrar la sesión) ====================
-- Misma que 20260923140000, con nombre propio. Reemplaza un texto EXACTO de la definición real exigiendo `p_veces`
-- ocurrencias; si ya tiene el texto nuevo, no hace nada.
create or replace function pg_temp.reemplazar_adm(p_firma text, p_viejo text, p_nuevo text, p_veces integer)
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

-- ==================== 1. Quién es admin (se lee de Dynamic) ====================
create or replace function retail.fn_es_admin_persona(p_persona_id uuid) returns boolean
language sql stable security definer set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.id = p_persona_id and p.estado = 'activo' and p.rol = 'admin' and c.rol = 'lider' and c.estado = 'activo'
  );
$$;

comment on function retail.fn_es_admin_persona(uuid) is
  'ADR-0178: ¿esta persona es Admin de retail? = admin en Dynamic (public.personas.rol) y Líder activo en retail.';

-- Una terminal no tiene persona (ADR-0162): nunca es admin.
create or replace function retail.fn_es_admin() returns boolean
language sql stable security definer set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and p.rol = 'admin' and c.rol = 'lider' and c.estado = 'activo'
  );
$$;

comment on function retail.fn_es_admin() is
  'ADR-0178: ¿la sesión es de un Admin? Solo un Admin sube a alguien a Líder o cambia el rol, la sede o el acceso de un líder. Todo lo demás del líder sigue en fn_es_lider(), que también es verdadera para un admin.';

-- Los admins, para marcarlos en Colaboradores y en Roles y accesos. Solo los ve quien ya ve esas pantallas.
create or replace function retail.fn_admins() returns table (persona_id uuid)
language sql stable security definer set search_path = retail, public, extensions
as $$
  select c.persona_id
    from retail.colaboradores c
    join public.personas p on p.id = c.persona_id
   where (retail.fn_puede_gestionar_colaboradores() or retail.fn_puede_administrar_roles())
     and p.estado = 'activo' and p.rol = 'admin' and c.rol = 'lider' and c.estado = 'activo';
$$;

comment on function retail.fn_admins() is
  'ADR-0178: los Admin de retail (admin en Dynamic + Líder activo aquí). Para quien ve Colaboradores o Roles y accesos.';

-- Nunca quedan cero admins activos.
create or replace function retail.fn_exigir_otro_admin(p_persona_id uuid, p_accion text) returns void
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
begin
  if retail.fn_es_admin_persona(p_persona_id)
     and not exists (select 1 from retail.colaboradores c join public.personas p on p.id = c.persona_id
                      where p.rol = 'admin' and p.estado = 'activo' and c.rol = 'lider' and c.estado = 'activo'
                        and c.persona_id <> p_persona_id) then
    raise exception 'No se puede % al último admin activo: siempre tiene que quedar quien administre a los líderes', p_accion
      using errcode = '42501';
  end if;
end;
$$;

-- ==================== 2. «Solo das lo que tienes» ====================
-- Los NOMBRES de los módulos de la lista que la sesión no ve (vacío para un líder: ve todos).
create or replace function retail.fn_modulos_que_no_tengo(p_modulos text[]) returns text[]
language sql stable security definer set search_path = retail, public, extensions
as $$
  select coalesce(array_agg(m.nombre order by m.orden), '{}')
    from retail.modulos m
   where m.clave = any (coalesce(p_modulos, '{}')) and not retail.fn_ve_modulo(m.clave);
$$;

-- ¿Puedo dar este rol? Sí si soy líder o si todos sus módulos los veo yo. La web lo pregunta antes de crear una terminal.
create or replace function retail.fn_rol_dentro_de_lo_mio(p_rol_id uuid) returns boolean
language sql stable security definer set search_path = retail, public, extensions
as $$
  select retail.fn_es_lider()
      or cardinality(retail.fn_modulos_que_no_tengo(array(select modulo from retail.rol_modulos where rol_id = p_rol_id))) = 0;
$$;

create or replace function retail.fn_exigir_rol_dentro_de_lo_mio(p_rol_id uuid) returns void
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
declare
  v_faltan text[];
begin
  if retail.fn_es_lider() then
    return;
  end if;
  v_faltan := retail.fn_modulos_que_no_tengo(array(select modulo from retail.rol_modulos where rol_id = p_rol_id));
  if cardinality(v_faltan) > 0 then
    raise exception 'Ese rol incluye módulos que tú no tienes (%): solo puedes dar lo que tú ves. Pídeselo a un líder.',
      array_to_string(v_faltan, ', ') using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
end;
$$;

-- Al guardar los módulos de un rol: quien no es líder no edita el suyo ni ENCIENDE uno que no ve (apagar, siempre).
create or replace function retail.fn_exigir_modulos_dentro_de_lo_mio(p_rol_id uuid, p_modulos text[]) returns void
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
declare
  v_faltan text[];
begin
  if retail.fn_es_lider() then
    return;
  end if;
  if p_rol_id = retail.fn_mi_rol_id() then
    raise exception 'No puedes editar los módulos de tu propio rol: pídeselo a un líder'
      using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
  v_faltan := retail.fn_modulos_que_no_tengo(array(
    select x from unnest(coalesce(p_modulos, '{}')) x
     where not exists (select 1 from retail.rol_modulos rm where rm.rol_id = p_rol_id and rm.modulo = x)));
  if cardinality(v_faltan) > 0 then
    raise exception 'No puedes encender módulos que tú no tienes (%): solo puedes dar lo que tú ves. Pídeselo a un líder.',
      array_to_string(v_faltan, ', ') using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
end;
$$;

do $$
declare
  v_f text;
begin
  foreach v_f in array array['retail.fn_es_admin_persona(uuid)', 'retail.fn_es_admin()', 'retail.fn_admins()',
                             'retail.fn_exigir_otro_admin(uuid, text)', 'retail.fn_modulos_que_no_tengo(text[])',
                             'retail.fn_rol_dentro_de_lo_mio(uuid)', 'retail.fn_exigir_rol_dentro_de_lo_mio(uuid)',
                             'retail.fn_exigir_modulos_dentro_de_lo_mio(uuid, text[])'] loop
    execute format('revoke all on function %s from public, anon', v_f);
    execute format('grant execute on function %s to authenticated, service_role', v_f);
  end loop;
end $$;

-- ==================== 3. A un líder solo lo toca un admin ====================
-- fn_exigir_puede_tocar_colaborador la llaman cambiar_ubicacion_colaborador, suspender_colaborador, reactivar_colaborador y
-- quitar_colaborador: con esto, las cuatro pasan a «solo un admin» cuando la persona es líder.
select pg_temp.reemplazar_adm('retail.fn_exigir_puede_tocar_colaborador(uuid, text)',
  $v$  if not retail.fn_es_lider() then$v$,
  $n$  if not retail.fn_es_admin() then -- ADR-0178: a un líder solo lo toca un admin$n$, 1);
select pg_temp.reemplazar_adm('retail.fn_exigir_puede_tocar_colaborador(uuid, text)',
  $v$'Solo un líder de equipo puede % a otro líder'$v$,
  $n$'Solo un admin puede % a un líder de equipo'$n$, 1);
select pg_temp.reemplazar_adm('retail.fn_exigir_puede_tocar_colaborador(uuid, text)',
  $v$  if p_accion in ('quitar', 'suspender')$v$,
  $n$  if p_accion in ('quitar', 'suspender') then
    perform retail.fn_exigir_otro_admin(p_persona_id, p_accion); -- ADR-0178
  end if;
  if p_accion in ('quitar', 'suspender')$n$, 1);

-- asignar_rol: subir a Líder y cambiarle el rol a un líder, solo un admin; nunca el último admin; y «solo das lo que tienes».
select pg_temp.reemplazar_adm('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$  if v_a_lider and not retail.fn_es_lider() then$v$,
  $n$  if v_a_lider and not retail.fn_es_admin() then -- ADR-0178$n$, 1);
select pg_temp.reemplazar_adm('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$'Solo un líder de equipo puede subir a alguien a Líder de equipo'$v$,
  $n$'Solo un admin puede subir a alguien a Líder de equipo'$n$, 1);
select pg_temp.reemplazar_adm('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$        if not retail.fn_es_lider() then$v$,
  $n$        if not retail.fn_es_admin() then -- ADR-0178$n$, 1);
select pg_temp.reemplazar_adm('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$'Solo un líder de equipo puede cambiarle el rol a otro líder'$v$,
  $n$'Solo un admin puede cambiarle el rol a un líder de equipo'$n$, 1);
select pg_temp.reemplazar_adm('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$        v_ubicacion := coalesce(p_ubicacion_id, v_ubicacion);$v$,
  $n$        perform retail.fn_exigir_otro_admin(p_persona_id, 'bajar'); -- ADR-0178
        v_ubicacion := coalesce(p_ubicacion_id, v_ubicacion);$n$, 1);
select pg_temp.reemplazar_adm('retail.asignar_rol(uuid, uuid, uuid, uuid)',
  $v$  if p_persona_id is not null then$v$,
  $n$  perform retail.fn_exigir_rol_dentro_de_lo_mio(p_rol_id); -- ADR-0178: solo das lo que tienes
  if p_persona_id is not null then$n$, 1);

-- ==================== 4. «Solo das lo que tienes» al editar y al crear roles ====================
select pg_temp.reemplazar_adm('retail.guardar_modulos_rol(uuid, text[])',
  $v$  select x into v_malo from unnest(coalesce(p_modulos, '{}')) x$v$,
  $n$  perform retail.fn_exigir_modulos_dentro_de_lo_mio(p_rol_id, p_modulos); -- ADR-0178
  select x into v_malo from unnest(coalesce(p_modulos, '{}')) x$n$, 1);

-- Duplicar un rol (o el Líder) copia sus módulos: se revisa lo copiado antes del historial (si falla, no queda nada).
select pg_temp.reemplazar_adm('retail.crear_rol(text, text, uuid)',
  $v$  insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)$v$,
  $n$  perform retail.fn_exigir_rol_dentro_de_lo_mio(v_id); -- ADR-0178: no se duplica lo que uno no tiene
  insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)$n$, 1);

-- ==================== 5. Se archiva el rol a medida «Administrador» ====================
-- Solo si sigue sin cuentas (activas, suspendidas o terminales). Lo que se archiva queda en el historial.
with archivado as (
  update retail.roles r
     set archivado_at = now()
   where r.nombre = 'Administrador' and r.clave is null and r.archivado_at is null and not r.es_sistema
     and not exists (select 1 from retail.colaboradores c where c.rol_id = r.id)
     and not exists (select 1 from retail.colaboradores_suspendidos s where s.rol_id = r.id)
     and not exists (select 1 from retail.terminales t where t.rol_id = r.id)
  returning r.id
)
insert into retail.roles_historial (rol_id, accion, detalle, hecho_por)
select id, 'archivo', jsonb_build_object('motivo', 'Reemplazado por el escalón Admin, que se lee de Dynamic (ADR-0178)'), null
  from archivado;

-- ==================== 6. Verificación: si algo no quedó, aborta ====================
do $$
declare
  v_malas text[];
begin
  select array_agg(f) into v_malas
    from (values
      ('retail.fn_exigir_puede_tocar_colaborador(uuid, text)', 'fn_es_admin()'),
      ('retail.fn_exigir_puede_tocar_colaborador(uuid, text)', 'fn_exigir_otro_admin'),
      ('retail.asignar_rol(uuid, uuid, uuid, uuid)', 'v_a_lider and not retail.fn_es_admin()'),
      ('retail.asignar_rol(uuid, uuid, uuid, uuid)', 'fn_exigir_otro_admin(p_persona_id, ''bajar'')'),
      ('retail.asignar_rol(uuid, uuid, uuid, uuid)', 'fn_exigir_rol_dentro_de_lo_mio(p_rol_id)'),
      ('retail.guardar_modulos_rol(uuid, text[])', 'fn_exigir_modulos_dentro_de_lo_mio'),
      ('retail.crear_rol(text, text, uuid)', 'fn_exigir_rol_dentro_de_lo_mio(v_id)')
    ) x(f, texto)
   where position(texto in pg_get_functiondef(f::regprocedure)) = 0;
  if v_malas is not null then
    raise exception 'Quedaron sin el candado nuevo: %', v_malas;
  end if;
  if pg_get_functiondef('retail.asignar_rol(uuid, uuid, uuid, uuid)'::regprocedure) like '%fn_es_lider()%' then
    raise exception 'asignar_rol todavía deja a un líder (no admin) tocar a otro líder';
  end if;
end $$;
