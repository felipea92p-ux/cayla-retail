-- ADR-0275 (Felipe, 2026-09-28): «CAYLA Global», la vista de toda la empresa, nace SOLO para el Admin.
--
-- Qué pidió: una opción más en el selector de sede —«CAYLA Global»— para ver las tiendas, el Taller y la empresa como un
-- solo negocio, pensada para analizar y decidir (no para operar piso o almacén), y que solo vean las cuentas de
-- Administración. Eligió que sea un MÓDULO de Roles y accesos que nace solo suyo: si mañana quiere dárselo a alguien
-- (su contadora, un socio), lo hace desde la pantalla, sin tocar código.
--
-- Por qué no basta con «un módulo nuevo»: desde el ADR-0253 el Líder de equipo ve todo lo que NO se le quitó
-- (`lider_modulos_ocultos`), así que un módulo nuevo nace visible para TODO líder. Y el Admin es un líder más para
-- «ve / no ve» (ADR-0253: si le quita Caja al Líder de equipo, él también deja de verla; lo vigila
-- `roles_lider_editable.mjs`), así que quitárselo al Líder se lo quitaría también a él. Hace falta un concepto nuevo, como
-- dato y no como un `if` suelto:
--
--   1. «Módulo del Admin» (`modulos.del_admin`): el Admin lo ve SIEMPRE, aunque se le quite al Líder de equipo. Los
--      demás módulos siguen exactamente como decidió el ADR-0253. Hoy solo CAYLA Global lo es.
--   2. CAYLA Global nace quitado al Líder de equipo. Solo al nacer: si después el Admin se lo da a los líderes (lo saca de
--      `lider_modulos_ocultos` desde Roles y accesos), volver a pegar este archivo no se lo vuelve a quitar.
--   3. «Solo das lo que ves», también el líder. Hasta hoy un líder podía encender en un rol cualquier módulo, incluso uno
--      que él no ve (antes del ADR-0253 no existía tal cosa: el líder lo veía todo). Ahora un líder que no es Admin solo
--      da los módulos que ve; el Admin, todos. Sin esto, cualquier líder podía darle CAYLA Global a un rol de tienda.
--   4. Quien tiene CAYLA Global ve las finanzas de todas las sedes (`fn_ve_finanzas_de_todo`), en lo que sus módulos de
--      Finanzas le dejan ver: si se lo da a su contadora, el tablero no le sale con partes «sin permiso».
--   5. Solo para personas: una terminal (aparato de mostrador, fijo a una tienda) no mira la empresa entera.
--   6. `fn_global_cobertura()`: con qué datos cuenta la vista, sede por sede.
--
-- Las funciones se reescriben desde su definición viva (huellas md5 de `prosrc` consultadas en producción el
-- 2026-09-28, iguales al repo): fn_ve_modulo f5fe078b…, fn_mis_modulos 4cd64120…, fn_exigir_modulos_dentro_de_lo_mio
-- e1f85319…, fn_exigir_rol_dentro_de_lo_mio 58c120b5…, fn_ve_finanzas_de_todo 06488d84…. Ninguna tiene reemplazos en vivo
-- (`reemplazar_vivo`) en el repo. `fn_exigir_rol_de_terminal` se cambia por ancla (solo su lista).
--
-- Producción: un `alter table modulos add column` con valor por defecto constante (solo cambia el catálogo; con
-- `lock_timeout` de 3 s, si la tabla está ocupada falla limpio en vez de esperar), `insert`/`update` de una fila, y
-- funciones con `create or replace`. Sin políticas ni `drop trigger` (ADR-0195): se pega entera, de una vez.

set search_path = retail, public, extensions;
set lock_timeout = '3s';

-- 1. «Módulo del Admin» ---------------------------------------------------------------------------------------------------

alter table retail.modulos add column if not exists del_admin boolean not null default false;

comment on column retail.modulos.del_admin is
  'ADR-0275: módulo del Admin. El Admin lo ve siempre, aunque se le quite al Líder de equipo (lider_modulos_ocultos); '
  'los demás líderes, solo si no se les quitó. Hoy solo cayla_global, que además nace quitado al Líder.';

-- 2. CAYLA Global, que nace quitado al Líder de equipo --------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from retail.modulos where clave = 'cayla_global') then
    insert into retail.modulos (clave, grupo, nombre, incluye, orden, solo_lider, delegable) values
      ('cayla_global', 'Gestión', 'CAYLA Global', 'Ver CAYLA como una sola empresa: las tiendas, el Taller y la empresa juntos, qué tan sano está el negocio y qué conviene decidir; desde el selector de sede', 310, false, true);
    insert into retail.lider_modulos_ocultos (modulo) values ('cayla_global');
  end if;
end;
$$;

update retail.modulos set del_admin = true where clave = 'cayla_global' and not del_admin;

-- Qué ve la cuenta. Un líder: todo lo que no se le quitó al Líder de equipo y, si es Admin, además los módulos del Admin.
-- `fn_es_admin()` solo se evalúa para lo que se le quitó al Líder: para todo lo demás no se suma ninguna lectura.

create or replace function retail.fn_ve_modulo(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select (retail.fn_es_lider()
          and (not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = p_clave)
               or (exists (select 1 from retail.modulos m where m.clave = p_clave and m.del_admin) and retail.fn_es_admin())))
      or exists (
    select 1 from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
    where rm.rol_id = retail.fn_mi_rol_id() and rm.modulo = p_clave
  );
$$;

create or replace function retail.fn_mis_modulos()
returns table(clave text, completo boolean)
language sql
stable
security definer
set search_path = retail, public, extensions
as $$
  select m.clave, true from retail.modulos m
   where retail.fn_es_lider()
     and (not exists (select 1 from retail.lider_modulos_ocultos o where o.modulo = m.clave) or (m.del_admin and retail.fn_es_admin()))
  union all
  select m.clave, not r.limitado_como_hoy
    from retail.rol_modulos rm
    join retail.roles r on r.id = rm.rol_id and r.archivado_at is null and not r.fijo
    join retail.modulos m on m.clave = rm.modulo and m.delegable and not m.solo_lider
   where not retail.fn_es_lider() and rm.rol_id = retail.fn_mi_rol_id();
$$;

-- 3. Solo das lo que ves, también el líder ------------------------------------------------------------------------------
-- El Admin da todo. Un líder da lo que ve (`fn_modulos_que_no_tengo` pregunta a `fn_ve_modulo`): todo, salvo lo que se
-- le quitó al Líder de equipo. Quien no es líder, igual que antes (y además no edita su propio rol). El mensaje le dice a
-- cada uno a quién pedírselo.

create or replace function retail.fn_exigir_modulos_dentro_de_lo_mio(p_rol_id uuid, p_modulos text[]) returns void
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
declare
  v_faltan text[];
begin
  if retail.fn_es_admin() then
    return;
  end if;
  if not retail.fn_es_lider() and p_rol_id = retail.fn_mi_rol_id() then
    raise exception 'No puedes editar los módulos de tu propio rol: pídeselo a un líder'
      using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
  v_faltan := retail.fn_modulos_que_no_tengo(array(
    select x from unnest(coalesce(p_modulos, '{}')) x
     where not exists (select 1 from retail.rol_modulos rm where rm.rol_id = p_rol_id and rm.modulo = x)));
  if cardinality(v_faltan) > 0 then
    raise exception 'No puedes encender módulos que tú no tienes (%): solo puedes dar lo que tú ves. Pídeselo a %.',
      array_to_string(v_faltan, ', '), case when retail.fn_es_lider() then 'un Admin' else 'un líder' end
      using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
end;
$$;

create or replace function retail.fn_exigir_rol_dentro_de_lo_mio(p_rol_id uuid) returns void
language plpgsql stable security definer set search_path = retail, public, extensions
as $$
declare
  v_faltan text[];
begin
  if retail.fn_es_admin() then
    return;
  end if;
  v_faltan := retail.fn_modulos_que_no_tengo(array(select modulo from retail.rol_modulos where rol_id = p_rol_id));
  if cardinality(v_faltan) > 0 then
    raise exception 'Ese rol incluye módulos que tú no tienes (%): solo puedes dar lo que tú ves. Pídeselo a %.',
      array_to_string(v_faltan, ', '), case when retail.fn_es_lider() then 'un Admin' else 'un líder' end
      using errcode = '42501', hint = 'solo_das_lo_que_tienes';
  end if;
end;
$$;

-- 4. Quien tiene CAYLA Global ve las finanzas de todas las sedes ----------------------------------------------------------

create or replace function retail.fn_ve_finanzas_de_todo()
returns boolean
language sql
stable
security definer
set search_path = retail, public, extensions
as $$ select retail.fn_es_lider() or retail.fn_capacidad_por_modulos(array['configuracion', 'cierre_mes', 'cayla_global']); $$;

comment on function retail.fn_ve_modulo(text) is
  'ADR-0161/0253/0275: ¿la cuenta de la sesión ve el módulo? El líder, todo lo que no se le quitó al Líder de equipo (el Admin, además, los módulos del Admin); el resto, lo de su rol.';

-- 5. Solo para personas, nunca para una terminal ------------------------------------------------------------------------
-- Una terminal es un aparato compartido de mostrador, fijo a una tienda: no mira la empresa entera (como Colaboradores,
-- Roles y Actividad, ADR-0161 P6). Se cambia SOLO la lista de `fn_exigir_rol_de_terminal`, sobre su definición viva: si
-- la lista no aparece exactamente una vez, la migración aborta sin tocar nada.

do $$
declare
  v_def text := pg_get_functiondef('retail.fn_exigir_rol_de_terminal(uuid, text)'::regprocedure);
  v_viejo text := 'array[''colaboradores'', ''roles'', ''actividad'']';
  v_nuevo text := 'array[''colaboradores'', ''roles'', ''actividad'', ''cayla_global'']';
  v_veces int;
begin
  v_veces := (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo);
  if v_veces = 0 and position(v_nuevo in v_def) > 0 then
    return; -- ya reescrita
  end if;
  if v_veces <> 1 then
    raise exception 'ADR-0275: retail.fn_exigir_rol_de_terminal trae % veces «%» (se esperaba 1): no se toca nada', v_veces, v_viejo;
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end;
$$;

-- 6. Con qué datos cuenta la vista global ---------------------------------------------------------------------------------
-- La primera pregunta del tablero no es una cifra sino «¿de qué sedes hay datos, y desde cuándo?». El 2026-09-28 el ERP
-- tenía 2 ventas (TRU y AQP, ambas de ese día) y LIM y el Taller en cero: la operación real sigue en Alegra. Sin esta
-- lectura, el tablero mostraría «LIM vendió S/ 0» cuando lo cierto es «LIM todavía no opera en el ERP». Cuenta ventas
-- completadas y no de prueba; `stock` suma las unidades de hoy (incluidas las apartadas). Una fila por ubicación activa.
-- Volumen: ~3 tiendas × 40 ventas/día × 3 años ≈ 130 mil ventas; tres agregados por ubicación con el índice de
-- `ventas(ubicacion_id)` son milisegundos.

create or replace function retail.fn_global_cobertura()
returns table(ubicacion_id uuid, nombre text, tipo text, primera_venta date, ultima_venta date, ventas_30d bigint, unidades_stock bigint)
language plpgsql
stable
security definer
set search_path = retail, public, extensions
as $$
begin
  if retail.fn_ve_modulo('cayla_global') is not true then
    raise exception 'Ver CAYLA Global necesita el módulo «CAYLA Global» en tu rol'
      using errcode = '42501', hint = 'cayla_global_sin_modulo';
  end if;
  return query
  select u.id, u.nombre, u.tipo,
         (v.primera at time zone 'America/Lima')::date,
         (v.ultima at time zone 'America/Lima')::date,
         coalesce(v.ultimos_30, 0),
         coalesce(s.unidades, 0)
    from retail.ubicaciones u
    left join lateral (
      select min(x.created_at) as primera, max(x.created_at) as ultima,
             count(*) filter (where x.created_at >= now() - interval '30 days') as ultimos_30
        from retail.ventas x
       where x.ubicacion_id = u.id and x.estado = 'completada' and not coalesce(x.es_prueba, false)
    ) v on true
    left join lateral (
      select sum(st.cantidad)::bigint as unidades from retail.stock st where st.ubicacion_id = u.id
    ) s on true
   where u.activo
   order by case u.tipo when 'tienda' then 0 when 'taller' then 1 else 2 end, u.nombre;
end;
$$;

revoke all on function retail.fn_global_cobertura() from public, anon;
grant execute on function retail.fn_global_cobertura() to authenticated, service_role;

comment on function retail.fn_global_cobertura() is
  'ADR-0275: con qué datos cuenta CAYLA Global — por ubicación activa, primera y última venta completada (fecha de Lima), ventas de 30 días y unidades en stock. Solo quien ve el módulo cayla_global.';
