-- ============================================================================
-- UNIFICACIÓN retail → dynamic · PASO 3 (candados + vistas puente)
-- Correr en cayla-DYNAMIC, después del paso 2 (schema retail + sede_meta).
--
-- Todo va en el cajón `retail` (aislado). Reusa las funciones de identidad de
-- dynamic (fn_rol_actual, fn_sede_actual_persona) → una sola fuente de identidad.
--
-- Mapeo de roles: admin → Líder (ve todo) · supervisor_sede → su sede + números
-- · integrante → su sede.
-- ============================================================================

-- Vista de SEDES que retail entiende (le agrega el `tipo`). security_invoker:
-- respeta las políticas de dynamic sobre sedes.
create or replace view retail.sedes
with (security_invoker = true) as
select s.id, s.codigo, s.nombre, m.tipo, m.tienda_asociada_id, s.activa as activo
from public.sedes s
join retail.sede_meta m on m.sede_id = s.id;

-- Vista de PERSONAS que retail entiende (nombre junto, sede, rol).
create or replace view retail.personas
with (security_invoker = true) as
select p.id, p.auth_user_id,
       (p.nombres || ' ' || coalesce(p.apellidos, '')) as nombre,
       p.sede_base_id as sede_id,
       p.rol::text as rol,
       p.email, p.estado
from public.personas p;

-- Identidad SEGURA del usuario actual (solo su propia fila, sin exponer a otros).
create or replace function retail.persona_actual()
returns table (id uuid, auth_user_id uuid, nombre text, sede_id uuid, rol text, email text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.auth_user_id, (p.nombres || ' ' || coalesce(p.apellidos, '')),
         p.sede_base_id, p.rol::text, p.email
  from public.personas p where p.auth_user_id = auth.uid();
$$;

-- Candados (reusan las funciones de dynamic, que ya son SECURITY DEFINER).
--
-- ⚠ CORREGIDO EN EL ARCHIVO EL 2026-09-10 — antes decia, por ejemplo,
--   `select public.fn_rol_actual() = 'admin'` sin el `coalesce`.
--
--   Un candado tiene que devolver false cuando no sabe, no NULL. Si
--   `fn_rol_actual()` devuelve NULL —una sesion sin rol, un usuario sin fila en
--   `personas`— la comparacion da NULL, y en el patron que usan todas las RPC del
--   repo (`if not es_lider() then raise exception …`) **`not null` NO es true**:
--   la excepcion no se dispara y el permiso pasa solo. En una policy de RLS NULL
--   deniega, pero en un `if` de plpgsql abre.
--
--   Produccion YA estaba endurecida —alguien lo parcho a mano y nunca quedo
--   escrito— y este archivo seguia con la version sin `coalesce`. O sea que
--   volver a pegarlo, que es lo que haria cualquiera siguiendo el repo, deshacia
--   el arreglo en silencio. Se corrige el archivo para que un replay desde cero
--   produzca el estado bueno; `34_candados_no_null.sql` es el paso suelto para
--   una base que haya recibido la version vieja.
--
--   Es la misma disciplina que `migrations/0023_rls_helpers_security_definer.sql`
--   ya practicaba en local desde el 03-09: alli `fn_es_lider()` siempre tuvo su
--   `coalesce(..., false)`. Lo unico que faltaba era que este lado lo dijera.
create or replace function retail.es_lider()
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.fn_rol_actual() = 'admin', false); $$;

create or replace function retail.es_supervisor()
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.fn_rol_actual() = 'supervisor_sede', false); $$;

-- `mi_sede` devuelve un uuid, no un booleano: acá NULL es la respuesta correcta
-- («no tengo sede»), y quien la llama ya compara contra algo. No lleva coalesce.
create or replace function retail.mi_sede()
returns uuid language sql stable set search_path = public
as $$ select public.fn_sede_actual_persona(); $$;

create or replace function retail.puede_operar_sede(p_sede_id uuid)
returns boolean language sql stable set search_path = public
as $$ select coalesce(public.fn_rol_actual() = 'admin', false)
       or coalesce(public.fn_sede_actual_persona() = p_sede_id, false); $$;
