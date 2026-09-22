-- ============================================================================
-- 20260922170000_alta_colaborador_requiere_aprobacion.sql — CAYLA V2
--
-- «EL ALTA DE UN COLABORADOR NUEVO NO QUEDA OPERATIVA SOLA» — EN LA BASE.
--
-- QUÉ DECIDE D-70. `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`, D-70: el
-- líder de su sede, o Felipe, aprueba el alta; no es automática aunque la persona
-- ya tenga función de servicio en Dynamic. La baja SÍ es automática (si Dynamic
-- marca a la persona inactiva, retail deja de dejarla entrar) — ese mecanismo ya
-- existe (todas las funciones de acceso filtran `p.estado = 'activo'` contra
-- `public.personas`, verificado abajo) y esta migración no lo toca.
--
-- LO QUE SE INVESTIGÓ ANTES DE DISEÑAR (punto 1 de la tarea, para no asumir).
-- Se buscó en `supabase/migrations/` un trigger sobre `public.personas` que
-- creara una fila de `retail.colaboradores` al ver una persona nueva o recién
-- activada en Dynamic: NO EXISTE NINGUNO. Tampoco existe ni existió una tabla
-- `retail.personas` desde 0009_integracion_dynamic.sql (se eliminó esa copia:
-- Dynamic es dueño de la identidad). La única forma en que nace hoy una fila de
-- `retail.colaboradores` es una llamada explícita, hecha por un líder, a
-- `retail.agregar_colaborador()` / `agregar_colaboradores()` (0013, 0016,
-- 20260922100000, 20260922110000) — nunca automática. Lo que SÍ falta, y es lo
-- que D-70 pide, es que esa llamada no deje a la persona operando de inmediato:
-- hoy `agregar_colaborador` es a la vez «proponer» y «dar acceso real» en un solo
-- clic de un solo líder, sin un segundo paso que lo confirme. Esta migración
-- separa las dos cosas.
--
-- QUIÉN Y CUÁNDO. Lo decidió Felipe (dueño del sistema), ronda de decisiones del
-- 2026-09-21 (D-70). Construido 2026-09-22.
--
-- «EL LÍDER DE SU SEDE» — POR QUÉ NO SE IMPLEMENTA ASÍ TODAVÍA. D-69 (misma
-- ronda, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`) es la decisión que
-- acota a cada líder a su sede — y esa misma decisión dice explícitamente que
-- "se aplica DESPUÉS de la salida en TRU, nunca mientras el equipo trabaja" y que
-- queda "pendiente desde ADR-0143". Hoy (ADR-0143, `fn_es_lider()`) un líder
-- sigue siendo global: opera y ahora también aprueba en cualquier sede. No hay
-- ninguna columna que distinga "a Felipe" de cualquier otro de los líderes ya
-- registrados (verificado: `colaboradores-iniciales-produccion.sql` mete a los
-- 9 —Felipe incluido— con el mismo rol `lider`, sin marca especial) — inventar
-- una acá sería una segunda fuente de verdad sobre "quién es el dueño",
-- exactamente lo que el principio 4 del repo prohíbe. Por eso
-- `fn_aprobar_alta_colaborador()` exige `fn_es_lider()` tal cual existe hoy: es
-- el estado real antes de D-69, y el día que D-69 acote el alcance de
-- `fn_es_lider()`/`fn_ubicacion_actual_persona()` por sede, esta función hereda
-- ese acotamiento sin que haya que tocarla — no duplica el candado, lo reusa.
--
-- QUÉ CAMBIA
--   1) `retail.colaboradores` gana la columna `estado` ('pendiente_aprobacion' |
--      'activo'). Default 'activo' — así las filas que YA existen (16 en
--      producción, todas dadas de alta antes de esta migración) no pierden
--      acceso solas; el default no es un dato inventado, es "ya estaban
--      aprobadas de hecho". `agregar_colaborador`/`agregar_colaboradores`
--      pasan a insertar con `estado = 'pendiente_aprobacion'` explícito: TODA
--      alta nueva desde hoy nace sin poder operar.
--   2) El candado real, en las tres funciones que todo el esquema usa para
--      "¿quién puede qué?" (`fn_es_lider`, `fn_ubicacion_actual_persona`,
--      `fn_tiene_acceso_retail`) y en las tres lecturas que consultan
--      `colaboradores` directo sin pasar por ellas (`fn_mi_perfil`,
--      `fn_persona_actual_resumen`, `fn_stock_por_sede`): todas suman
--      `c.estado = 'activo'`. Sin esto, una persona pendiente habría podido
--      leer su perfil, el stock por sede o entrar al gate de login como si ya
--      estuviera aprobada — el mismo hueco NULL-vs-false que 0006 y 0009 ya
--      corrigieron una vez, ahora en una dimensión nueva (estado de retail, no
--      solo estado de Dynamic).
--   3) `retail.fn_aprobar_alta_colaborador(p_persona_id uuid) returns void` —
--      SECURITY DEFINER, `fn_es_lider()` PRIMERO (antes de mirar si la fila
--      existe, mismo patrón que 20260921120000). Pasa la fila de
--      'pendiente_aprobacion' a 'activo' y lo anota en
--      `colaboradores_historial` (accion 'aprobacion', nueva en el CHECK).
--   4) `retail.fn_colaboradores_pendientes()` — solo líder, lista quién espera
--      aprobación (quién lo propuso, cuándo, a qué ubicación).
--   5) `suspender_colaborador` gana una guarda: no se puede "suspender" a
--      alguien que todavía está pendiente — mandarlo a `colaboradores_
--      suspendidos` y de vuelta con `reactivar_colaborador` lo reactivaría
--      como 'activo' (el default de la columna) SIN haber pasado nunca por
--      aprobación. Es el mismo tipo de estado imposible que el CHECK de
--      20260922100000 ya evita para "colaborador sin ubicación": se cierra en
--      el esquema/RPC, no se confía en que nadie use ese camino por error.
--      Rechazar a alguien pendiente sigue siendo `quitar_colaborador` (borra
--      la fila entera; ya funcionaba así, no cambia).
--
-- QUÉ SE CONSERVA. `colaboradores_suspendidos` no gana columna `estado`: un
-- suspendido siempre fue, por diseño (ADR-0148), alguien que SÍ tenía acceso
-- real antes de que lo pausaran, así que al reactivarlo vuelve a 'activo' (el
-- default de la columna) — es correcto sin tocar esa tabla. La baja automática
-- por Dynamic (`p.estado = 'activo'` en cada función) no se toca: sigue siendo
-- la misma fila de siempre, ahora con una columna más que también hay que
-- cumplir. `fn_dynamic_disponibles()` no cambia: ya excluye a cualquiera con
-- fila en `colaboradores` sin mirar su estado, así que alguien pendiente
-- tampoco vuelve a aparecer como "sin acceso" — sigue viéndose, correctamente,
-- en la pestaña nueva de pendientes.
--
-- QUIÉN DEJA DE PODER HACER QUÉ. Un líder ya no da acceso operativo con un solo
-- clic de "Agregar colaboradores": ese clic ahora propone el alta; alguna
-- persona con `fn_es_lider()` (el mismo líder u otro) tiene que aprobarla
-- después desde la pestaña "Pendientes" para que la persona pueda de verdad
-- vender, abrir caja o mover stock. Nadie que hoy tiene acceso pierde nada: la
-- migración backfillea su fila a 'activo'.
--
-- SE ROMPE SI: se pega en producción sin desplegar antes la web que sabe leer
-- la pestaña nueva — la web VIEJA sigue funcionando igual (no llama a las
-- funciones nuevas), así que no hay orden estricto esta vez, a diferencia de
-- 20260922110000. Si alguien inserta a mano en `colaboradores` sin columna
-- `estado`, hereda el default 'activo' — sigue siendo el comportamiento
-- correcto para todo lo que no es un alta nueva por la pantalla.
--
-- Re-ejecutable. Producción: se pega entera en el SQL Editor de cayla-dynamic
-- (trae el prefijo `retail.` donde hace falta).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- 1) el estado, con default seguro para lo que ya existe ----------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'retail' and table_name = 'colaboradores' and column_name = 'estado'
  ) then
    alter table retail.colaboradores
      add column estado text not null default 'activo'
        check (estado in ('pendiente_aprobacion', 'activo'));
  end if;
end;
$$;

comment on column retail.colaboradores.estado is
  'D-70: pendiente_aprobacion hasta que un líder llama fn_aprobar_alta_colaborador(); activo (default) para no desconectar a quien ya operaba antes de esta columna.';

-- ---------- 2) el candado real: las tres funciones base ----------
create or replace function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.rol = 'lider' and c.estado = 'activo'
  );
$$;

create or replace function retail.fn_ubicacion_actual_persona() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select u.id
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id
  left join ubicaciones u on
    (c.rol = 'lider' and u.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and u.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo';
$$;

create or replace function retail.fn_tiene_acceso_retail() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select exists (
    select 1 from public.personas p
    join retail.colaboradores c on c.persona_id = p.id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo'
  );
$$;

-- ---------- 2b) las tres lecturas que consultan `colaboradores` directo ----------
create or replace function retail.fn_mi_perfil()
returns table(persona_id uuid, nombres text, apellidos text, correo text, celular text, foto_url text, rol text, estado text, ubicacion_nombre text, ultimo_acceso timestamptz)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select
    p.id, p.nombres, p.apellidos, u.email, dp.celular, p.foto_url,
    case when fn_es_lider() then 'lider' else 'integrante' end,
    p.estado,
    case when ubi.id is null and fn_es_lider()
      then (select nombre from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else ubi.nombre end,
    u.last_sign_in_at
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id and c.estado = 'activo'
  join auth.users u on u.id = p.auth_user_id
  left join public.datos_personales dp on dp.persona_id = p.id
  left join ubicaciones ubi on
    (c.rol = 'lider' and ubi.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and ubi.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

comment on function retail.fn_mi_perfil() is
  'Perfil de la persona autenticada. Exige colaboradores.estado = activo (D-70): '
  'una alta pendiente de aprobación no ve su perfil como si ya operara.';

create or replace function retail.fn_persona_actual_resumen()
returns table (nombre text, es_lider boolean, ubicacion_id uuid, ubicacion_nombre text, ubicacion_tipo text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    p.nombres || ' ' || p.apellidos,
    c.rol = 'lider',
    case when u.id is null and c.rol = 'lider'
      then (select id from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.id end,
    case when u.id is null and c.rol = 'lider'
      then (select nombre from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.nombre end,
    case when u.id is null and c.rol = 'lider'
      then (select tipo from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else u.tipo end
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id and c.estado = 'activo'
  left join ubicaciones u on
    (c.rol = 'lider' and u.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and u.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

comment on function retail.fn_persona_actual_resumen() is
  'Identidad para el frontend (gate de login, AppShell). Exige colaboradores.estado '
  '= activo (D-70): con el alta todavía pendiente, esta función no devuelve fila y '
  'el gate manda a /login igual que "sin acceso" — correcto, todavía no puede operar.';

create or replace function retail.fn_stock_por_sede()
returns table (variante_id uuid, ubicacion_id uuid, cantidad integer)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select s.variante_id, s.ubicacion_id, sum(s.cantidad)::integer as cantidad
  from stock s
  join ubicaciones u on u.id = s.ubicacion_id and u.activo
  where exists (
    select 1
    from colaboradores c
    join public.personas p on p.id = c.persona_id
    where p.auth_user_id = auth.uid() and p.estado = 'activo' and c.estado = 'activo'
  )
  group by s.variante_id, s.ubicacion_id;
$$;

-- ---------- 3) alta: ahora nace pendiente ----------
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
  if exists (select 1 from colaboradores_suspendidos where persona_id = p_persona_id) then
    raise exception 'Esa persona está suspendida — reactívala en vez de agregarla de nuevo';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  -- Todo lo que entra por acá es Colaborador — Líder es un nivel que hoy
  -- no se asigna desde esta pantalla, solo lo tienen los ya registrados.
  -- D-70: nace 'pendiente_aprobacion', no operativo hasta que un líder
  -- (el mismo u otro) llame fn_aprobar_alta_colaborador().
  insert into colaboradores (persona_id, agregado_por, rol, ubicacion_asignada_id, estado)
    values (p_persona_id, v_quien, 'colaborador', p_ubicacion_id, 'pendiente_aprobacion')
    on conflict (persona_id) do nothing;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception 'Esa persona ya tiene acceso a retail — actualiza la pantalla para verla en la lista';
  end if;
  perform retail.fn_historial_colaborador(p_persona_id, 'alta', 'colaborador', null, p_ubicacion_id, null);
end;
$$;

-- ---------- 3b) aprobar: el segundo paso, el que de verdad da acceso ----------
create or replace function retail.fn_aprobar_alta_colaborador(p_persona_id uuid) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_fila retail.colaboradores%rowtype;
begin
  -- Candado de rol PRIMERO, antes de mirar si el recurso existe (mismo
  -- patrón que 20260921120000_candado_de_lider_caja_y_ajuste.sql).
  if not fn_es_lider() then
    raise exception 'Solo un líder puede aprobar el alta de un colaborador';
  end if;
  select * into v_fila from colaboradores where persona_id = p_persona_id for update;
  if not found then
    raise exception 'Esa persona no tiene una alta pendiente — actualiza la pantalla';
  end if;
  if v_fila.estado = 'activo' then
    raise exception 'Esa alta ya estaba aprobada — actualiza la pantalla';
  end if;
  update colaboradores set estado = 'activo' where persona_id = p_persona_id;
  perform retail.fn_historial_colaborador(p_persona_id, 'aprobacion', v_fila.rol, null, v_fila.ubicacion_asignada_id, null);
end;
$$;

-- ---------- 3c) suspender: no se puede "pausar" algo que nunca se aprobó ----------
create or replace function retail.suspender_colaborador(p_persona_id uuid, p_motivo text default null) returns void
language plpgsql
security definer
set search_path = retail, public, extensions
as $$
declare
  v_quien uuid;
  v_fila retail.colaboradores%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not fn_es_lider() then
    raise exception 'Solo un líder puede gestionar colaboradores';
  end if;
  select id into v_quien from public.personas where auth_user_id = auth.uid();
  if p_persona_id = v_quien then
    raise exception 'No puedes suspenderte a ti mismo — pide a otro líder que lo haga';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 300 then
    raise exception 'El motivo es muy largo — máximo 300 caracteres';
  end if;
  select * into v_fila from colaboradores where persona_id = p_persona_id for update;
  if not found then
    if exists (select 1 from colaboradores_suspendidos where persona_id = p_persona_id) then
      raise exception 'Esa persona ya está suspendida — actualiza la pantalla';
    end if;
    raise exception 'Esa persona no tiene acceso a retail — actualiza la pantalla';
  end if;
  -- D-70: suspender/reactivar da por hecho que había acceso real antes de
  -- pausarlo (colaboradores_suspendidos no tiene columna `estado`, siempre
  -- vuelve a 'activo'). Si esto dejara pasar a un pendiente, reactivarlo lo
  -- promovería a activo sin que nadie lo haya aprobado nunca — el mismo tipo
  -- de estado imposible que el CHECK de ubicación ya evita en 20260922100000.
  if v_fila.estado <> 'activo' then
    raise exception 'Esa persona todavía no está aprobada — apruébala o quítale el acceso, no la suspendas';
  end if;
  delete from colaboradores where persona_id = p_persona_id;
  insert into colaboradores_suspendidos (persona_id, rol, ubicacion_asignada_id, agregado_por, agregado_en, suspendido_por, motivo)
    values (v_fila.persona_id, v_fila.rol, v_fila.ubicacion_asignada_id, v_fila.agregado_por, v_fila.created_at, v_quien, v_motivo);
  perform retail.fn_historial_colaborador(p_persona_id, 'suspension', v_fila.rol, v_fila.ubicacion_asignada_id, null, v_motivo);
end;
$$;

-- ---------- 4) historial: nueva acción ----------
alter table retail.colaboradores_historial drop constraint if exists colaboradores_historial_accion_check;
alter table retail.colaboradores_historial add constraint colaboradores_historial_accion_check
  check (accion in ('alta', 'baja', 'suspension', 'reactivacion', 'ubicacion', 'aprobacion'));

-- ---------- 5) lecturas: activos ya no incluyen pendientes; pendientes tiene lista propia ----------
drop function if exists retail.fn_colaboradores();
create function retail.fn_colaboradores()
returns table (
  persona_id uuid, nombre text, correo text, sede text, rol text, ubicacion_asignada text, agregado_en timestamptz,
  ubicacion_id uuid, es_yo boolean, ultimo_acceso timestamptz
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, c.rol, ubi.nombre, c.created_at,
         c.ubicacion_asignada_id, (p.auth_user_id = auth.uid()), u.last_sign_in_at
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  left join retail.ubicaciones ubi on ubi.id = c.ubicacion_asignada_id
  where fn_es_lider() and p.estado = 'activo' and c.estado = 'activo'
  order by p.nombres;
$$;
grant execute on function retail.fn_colaboradores() to authenticated;

comment on function retail.fn_colaboradores() is
  'Quién puede ENTRAR y OPERAR hoy — solo estado activo (D-70). Las altas '
  'propuestas y sin aprobar viven en fn_colaboradores_pendientes().';

create or replace function retail.fn_colaboradores_pendientes()
returns table (
  persona_id uuid, nombre text, correo text, sede text, ubicacion_asignada text,
  propuesto_por text, propuesto_en timestamptz
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, ubi.nombre,
         prop.nombres || ' ' || prop.apellidos, c.created_at
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  left join retail.ubicaciones ubi on ubi.id = c.ubicacion_asignada_id
  left join public.personas prop on prop.id = c.agregado_por
  where fn_es_lider() and p.estado = 'activo' and c.estado = 'pendiente_aprobacion'
  order by c.created_at asc;
$$;

comment on function retail.fn_colaboradores_pendientes() is
  'D-70: altas propuestas por un líder que todavía no puede operar. Un líder '
  '(el mismo u otro) las aprueba con fn_aprobar_alta_colaborador().';

-- ---------- permisos ----------
revoke execute on function retail.fn_aprobar_alta_colaborador(uuid), retail.fn_colaboradores_pendientes()
  from public, anon;

grant execute on function retail.fn_aprobar_alta_colaborador(uuid), retail.fn_colaboradores_pendientes()
  to authenticated;

-- Se repiten por si esta migración se pega sobre una base donde alguien los tocó
-- (create or replace no toca permisos, pero create function sí necesita el grant).
grant execute on function retail.agregar_colaborador(uuid, uuid) to authenticated;
grant execute on function retail.suspender_colaborador(uuid, text) to authenticated;
