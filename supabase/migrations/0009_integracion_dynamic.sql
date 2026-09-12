-- ============================================================================
-- 0009_integracion_dynamic.sql — CAYLA V2
--
-- DECISIÓN (Felipe, 2026-09-12): retail y Dynamic comparten el mismo
-- proyecto de Supabase y, por lo tanto, el mismo `auth.users` — el login
-- ya es compartido de fábrica. Lo único que retail necesitaba resolver
-- era CÓMO interpretar esa identidad: hasta esta migración, retail tenía
-- su propia tabla `personas`, una copia paralela de lo que Dynamic ya
-- sabe (quién es, qué rol tiene, en qué sede trabaja). Esa copia era el
-- problema — dos fuentes de verdad para el mismo hecho, exactamente lo
-- que el principio 4 del repo prohíbe. Se elimina `retail.personas` y
-- las funciones de seguridad de retail pasan a delegar directo en las
-- funciones reales de Dynamic (`public.fn_rol_actual()`,
-- `public.fn_sede_actual_persona()` — ya existen, ya son `security
-- definer`, ya están probadas en producción).
--
-- LO QUE NO CAMBIA: retail sigue siendo dueño de sus propias tablas de
-- negocio (productos, stock, ventas, caja, comprobantes...) y de su
-- propia `ubicaciones` — Dynamic no tiene concepto de "almacén", que
-- retail sí necesita (recepciones, traslados), así que `ubicaciones` no
-- se puede reemplazar por una vista sobre `public.sedes`. En cambio,
-- cada ubicación que SÍ corresponda a una sede real de Dynamic queda
-- enlazada con una columna nueva — el resto (ej. Almacén Principal)
-- queda sin enlace, a propósito.
--
-- SE ROMPE SI: alguien en Dynamic cambia el nombre de una sede sin
-- avisar — el enlace es por id (`sede_dynamic_id`), no por nombre, así
-- que sobrevive un rename. Lo que SÍ rompería es que Dynamic borre una
-- sede que retail tiene enlazada (la FK lo impediría con un error claro,
-- no en silencio).
-- ============================================================================

set search_path = retail, public, extensions;

-- ---------- enlazar ubicaciones de retail con sedes reales de Dynamic ----------
alter table retail.ubicaciones add column sede_dynamic_id uuid references public.sedes(id);
comment on column retail.ubicaciones.sede_dynamic_id is
  'Enlace opcional a la sede real de Dynamic (public.sedes). NULL para ubicaciones que solo existen en retail (ej. Almacén Principal — Dynamic no tiene concepto de almacén).';

-- ---------- funciones de seguridad: delegan en Dynamic, no en una copia propia ----------
create or replace function retail.fn_es_lider() returns boolean
language sql stable security definer
set search_path = retail, public, extensions
as $$
  -- Mapeo de negocio (Felipe, 2026-09-12, ajustable sin tocar nada más):
  -- 'admin' y 'supervisor_sede' operan cualquier ubicación de retail
  -- (control total / encargada de sede, en vocabulario CAYLA); 'lider_do'
  -- (Desarrollo Organizacional) e 'integrante' quedan como integrante de
  -- retail — DO no es operación de tienda.
  select coalesce(public.fn_rol_actual() in ('admin', 'supervisor_sede'), false);
$$;

create or replace function retail.fn_ubicacion_actual_persona() returns uuid
language sql stable security definer
set search_path = retail, public, extensions
as $$
  -- OJO: `public.fn_sede_actual_persona()` (de Dynamic) NO filtra por
  -- estado='activo' — es una decisión de Dynamic, no un bug suyo, pero
  -- retail no puede heredarla sin más: es exactamente el mismo hueco de
  -- seguridad que 0006 encontró y corrigió (NULL-vs-false, persona
  -- desactivada que igual podía operar). Acá se filtra explícito en vez
  -- de confiar en la función de Dynamic para eso.
  select u.id from ubicaciones u
  join public.personas p on p.sede_base_id = u.sede_dynamic_id
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

-- fn_puede_operar_ubicacion() no cambia: ya compone las dos de arriba
-- (arreglada en 0006 para nunca devolver NULL) y no leía `personas`
-- directamente.

-- `fn_persona_actual()` se elimina: devolvía `retail.personas` (tabla que
-- ya no existe) y, verificado por grep, ningún RPC ni pantalla la llama
-- — no reemplaza nada, solo se borra.
drop function if exists retail.fn_persona_actual();

-- ---------- identidad para el frontend: una sola RPC, no 37 columnas de RRHH ----------
-- El frontend de retail necesita nombre + rol + ubicación para pintar la
-- pantalla — nada más. Devolver esto en una función propia evita que
-- retail tenga que hacer una consulta cruzada de schema (retail→public)
-- por cada carga de página, y evita que su superficie de tipos incluya
-- sueldo/CTS/régimen de pensión, que no son asunto de retail.
create function retail.fn_persona_actual_resumen()
returns table (nombre text, es_lider boolean, ubicacion_id uuid, ubicacion_nombre text, ubicacion_tipo text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    p.nombres || ' ' || p.apellidos,
    fn_es_lider(),
    u.id,
    u.nombre,
    u.tipo
  from public.personas p
  left join ubicaciones u on u.sede_dynamic_id = p.sede_base_id
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

grant execute on function retail.fn_persona_actual_resumen to authenticated;

-- ---------- resolver nombres de personas en lote (para pantallas tipo
-- Movimientos/Caja, que antes hacían `usuario:personas(nombre)` embebido) ----------
-- PostgREST no embebe entre schemas distintos (retail↔public) — el
-- cliente del navegador/servidor está fijado al schema `retail`, así que
-- ya no hay forma de pedir "tráeme el movimiento CON el nombre de quien
-- lo hizo" en una sola consulta REST como antes. Esta función hace ese
-- trabajo del lado de la base, en lote (nunca N+1), y de paso mantiene
-- fuera del frontend las 37 columnas de RRHH que `public.personas` trae.
create function retail.fn_nombres_personas(p_ids uuid[]) returns table (id uuid, nombre text)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select id, nombres || ' ' || apellidos from public.personas where id = any(p_ids);
$$;

grant execute on function retail.fn_nombres_personas to authenticated;

-- ---------- reapuntar cada FK que usaba retail.personas hacia public.personas ----------
-- Mecánico: mismo tipo (uuid), mismo nombre de columna, cambia solo la
-- tabla referenciada. Ninguna de estas 12 tablas cambia de forma.
alter table retail.caja_movimientos drop constraint caja_movimientos_usuario_id_fkey,
  add constraint caja_movimientos_usuario_id_fkey foreign key (usuario_id) references public.personas(id);
alter table retail.cajas drop constraint cajas_abierta_por_fkey,
  add constraint cajas_abierta_por_fkey foreign key (abierta_por) references public.personas(id);
alter table retail.cajas drop constraint cajas_cerrada_por_fkey,
  add constraint cajas_cerrada_por_fkey foreign key (cerrada_por) references public.personas(id);
alter table retail.cambios drop constraint cambios_usuario_id_fkey,
  add constraint cambios_usuario_id_fkey foreign key (usuario_id) references public.personas(id);
alter table retail.conteos drop constraint conteos_abierto_por_fkey,
  add constraint conteos_abierto_por_fkey foreign key (abierto_por) references public.personas(id);
alter table retail.conteos drop constraint conteos_cerrado_por_fkey,
  add constraint conteos_cerrado_por_fkey foreign key (cerrado_por) references public.personas(id);
alter table retail.devoluciones drop constraint devoluciones_aprobado_por_fkey,
  add constraint devoluciones_aprobado_por_fkey foreign key (aprobado_por) references public.personas(id);
alter table retail.devoluciones drop constraint devoluciones_solicitado_por_fkey,
  add constraint devoluciones_solicitado_por_fkey foreign key (solicitado_por) references public.personas(id);
alter table retail.lotes drop constraint lotes_recibido_por_fkey,
  add constraint lotes_recibido_por_fkey foreign key (recibido_por) references public.personas(id);
alter table retail.movimientos drop constraint movimientos_usuario_id_fkey,
  add constraint movimientos_usuario_id_fkey foreign key (usuario_id) references public.personas(id);
alter table retail.transferencias drop constraint transferencias_creado_por_fkey,
  add constraint transferencias_creado_por_fkey foreign key (creado_por) references public.personas(id);
alter table retail.ventas drop constraint ventas_usuario_id_fkey,
  add constraint ventas_usuario_id_fkey foreign key (usuario_id) references public.personas(id);

-- `actualizar_persona()` (0006_colaboradores.sql) editaba rol/ubicación/
-- activo de una fila de retail.personas — ya no aplica: Dynamic es dueño
-- de esos tres datos (rol y estado ahí, ubicación resuelta por
-- sede_dynamic_id arriba). Se elimina en vez de adaptarse: no hay nada
-- que "editar" desde retail, sería doble fuente de verdad de nuevo.
drop function if exists retail.actualizar_persona(uuid, text, uuid, boolean);

-- ---------- retail.personas ya no existe como tabla propia ----------
-- Se va con su policy (personas_select_propia) y su grant — Dynamic es
-- dueño de esa identidad, retail solo la consulta a través de las
-- funciones de arriba, nunca con una tabla local que pueda desincronizarse.
drop table retail.personas;

-- ---------- grants (las funciones nuevas ya heredan el grant "execute on
-- all functions" de 0005; el de fn_persona_actual queda huérfano solo,
-- Postgres lo limpia al hacer drop function) ----------
