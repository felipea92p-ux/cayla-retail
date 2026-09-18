-- ============================================================================
-- 20260915230001_colaboradores_perfil_y_lista_correctos.sql — CAYLA V2
--
-- Dos correcciones puntuales encontradas leyendo el código real de
-- `fn_mi_perfil` y `fn_colaboradores` (0014_perfil.sql, 0016_roles_colaborador.sql),
-- no de ningún .md:
--
-- 1) `fn_mi_perfil()` resolvía la ubicación de CUALQUIER persona con
--    `left join ubicaciones ubi on ubi.sede_dynamic_id = p.sede_base_id` — la
--    resolución correcta SOLO para un Líder. Un Colaborador puede tener una
--    `ubicacion_asignada_id` en `retail.colaboradores` distinta de su
--    `sede_base_id` en Dynamic (el propio 0016_roles_colaborador.sql, líneas
--    17-20, ya documenta que "dónde trabaja en planilla" y "qué tienda opera
--    en retail" son preguntas distintas) — para ese caso "Mi perfil" mostraba
--    la sede equivocada, o "Sin asignar" aunque sí tuviera una asignada.
--    `fn_ubicacion_actual_persona()` (0009_integracion_dynamic.sql) ya
--    resuelve esto bien por rol; se repite la misma rama acá en vez de
--    acoplar las dos funciones, seguido el propio criterio que 0014 ya
--    declaraba en su comentario (que cada una pueda evolucionar sola).
--
-- 2) `fn_colaboradores()` no filtraba `p.estado = 'activo'` — a diferencia de
--    `fn_dynamic_disponibles()`, que sí lo hace. La pantalla dice "Quién
--    puede entrar a retail HOY", pero alguien desactivado en Dynamic (cesado)
--    sin que un líder haya llamado `quitar_colaborador` seguía apareciendo
--    en la lista exactamente igual que alguien vigente, sin ninguna columna
--    que lo distinga.
--
-- Ambas mantienen exactamente la misma firma (`RETURNS TABLE(...)` sin
-- cambios) — la lección de `recibir_lote`/`registrar_movimiento` es que
-- cambiar la firma con `create or replace` no reemplaza la función vieja,
-- crea una segunda.
-- ============================================================================

set search_path = retail, public, extensions;

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
    -- Antes: `ubi.sede_dynamic_id = p.sede_base_id` para cualquiera (correcto
    -- solo para líder). Ahora, misma rama que `fn_ubicacion_actual_persona()`:
    -- líder por su sede base de Dynamic, colaborador por su ubicación
    -- asignada en retail.
    case when ubi.id is null and fn_es_lider()
      then (select nombre from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else ubi.nombre end,
    u.last_sign_in_at
  from public.personas p
  join retail.colaboradores c on c.persona_id = p.id
  join auth.users u on u.id = p.auth_user_id
  left join public.datos_personales dp on dp.persona_id = p.id
  left join ubicaciones ubi on
    (c.rol = 'lider' and ubi.sede_dynamic_id = p.sede_base_id)
    or (c.rol = 'colaborador' and ubi.id = c.ubicacion_asignada_id)
  where p.auth_user_id = auth.uid() and p.estado = 'activo';
$$;

comment on function retail.fn_mi_perfil() is
  'Perfil de la persona autenticada. La ubicación se resuelve por rol: líder '
  'por su sede base de Dynamic, colaborador por su ubicacion_asignada_id real '
  'en retail — antes usaba la resolución de líder para cualquiera.';

create or replace function retail.fn_colaboradores()
returns table(persona_id uuid, nombre text, correo text, sede text, rol text, ubicacion_asignada text, agregado_en timestamptz)
language sql
stable
security definer
set search_path to 'retail', 'public', 'extensions'
as $$
  select p.id, p.nombres || ' ' || p.apellidos, u.email, s.nombre, c.rol, ubi.nombre, c.created_at
  from retail.colaboradores c
  join public.personas p on p.id = c.persona_id
  join auth.users u on u.id = p.auth_user_id
  left join public.sedes s on s.id = p.sede_base_id
  left join retail.ubicaciones ubi on ubi.id = c.ubicacion_asignada_id
  where fn_es_lider() and p.estado = 'activo'
  order by p.nombres;
$$;

comment on function retail.fn_colaboradores() is
  'Quién puede entrar a retail hoy. Filtra p.estado = activo — antes '
  'mostraba también a quien Dynamic ya desactivó, igual que a alguien vigente.';
