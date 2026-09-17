-- ============================================================================
-- 0014_perfil.sql — CAYLA V2
--
-- "Mi perfil" (Felipe, 2026-09-14): ventana de perfil personal, abierta desde
-- el sidebar. Investigado primero si Dynamic ya tenía estos datos (pedido
-- explícito de Felipe) — SÍ: teléfono vive en `public.datos_personales.celular`
-- y la foto de perfil ya tiene su propio autoservicio real
-- (`public.personas.foto_url` + `public.fn_actualizar_foto_perfil`, bucket
-- `fotos-perfil` — todo construido en cayla-dynamic/migrations/0381 y 0399).
--
-- Por eso esta migración NO agrega ninguna columna a `retail.colaboradores`:
-- solo extiende el mismo puente de solo-lectura que `fn_persona_actual_resumen()`
-- ya usa para nombre/rol/sede (0009, 0013), y agrega UN wrapper delgado de
-- escritura que delega en la función real de Dynamic — nunca reimplementa su
-- permiso.
--
-- Ubicación queda deliberadamente de solo lectura (misma resolución que ya
-- existe) — Felipe aclaró que hoy no representa ningún permiso y que el tema
-- de permisos de ubicación se revisa más adelante, aparte.
--
-- SE ROMPE SI: se pega en producción antes de confirmar que
-- `public.fn_actualizar_foto_perfil` sigue con esa firma exacta ahí — es de
-- Dynamic, no de este repo, y puede evolucionar sin avisarle a retail.
-- ============================================================================

set search_path = retail, public, extensions;

create function retail.fn_mi_perfil()
returns table (
  persona_id uuid, nombres text, apellidos text, correo text, celular text, foto_url text,
  rol text, estado text, ubicacion_nombre text, ultimo_acceso timestamptz
)
language sql stable security definer
set search_path = retail, public, extensions
as $$
  select
    -- persona_id va en la respuesta (no es un dato sensible nuevo — ya se
    -- expone igual en fn_colaboradores) porque el cliente lo necesita para
    -- construir la ruta `perfil/<persona_id>/...` al subir la foto, la
    -- misma convención que ya usa el bucket real de Dynamic.
    p.id, p.nombres, p.apellidos, u.email, dp.celular, p.foto_url,
    case when fn_es_lider() then 'lider' else 'integrante' end,
    p.estado,
    -- Misma resolución que fn_persona_actual_resumen() (0013) — se repite la
    -- expresión en vez de acoplar esta RPC a esa, para que cada una pueda
    -- evolucionar sola.
    case when ubi.id is null and fn_es_lider()
      then (select nombre from ubicaciones order by (tipo = 'tienda') desc, created_at asc limit 1)
      else ubi.nombre end,
    u.last_sign_in_at
  from public.personas p
  join auth.users u on u.id = p.auth_user_id
  left join public.datos_personales dp on dp.persona_id = p.id
  left join ubicaciones ubi on ubi.sede_dynamic_id = p.sede_base_id
  where p.auth_user_id = auth.uid() and p.estado = 'activo'
    and exists (select 1 from retail.colaboradores c where c.persona_id = p.id);
$$;

grant execute on function retail.fn_mi_perfil to authenticated;

-- Único punto de escritura de este archivo: resuelve quién soy (mismo patrón
-- que toda RPC de este esquema — nunca recibe un persona_id de quien llama) y
-- delega en la función real de Dynamic, que ya trae su propio permiso (uno
-- mismo, o admin/lider_do) y su propia validación de ruta del bucket.
create function retail.actualizar_mi_foto_perfil(p_foto_url text) returns void
language plpgsql security definer
set search_path = retail, public, extensions
as $$
declare v_persona_id uuid;
begin
  select id into v_persona_id from public.personas where auth_user_id = auth.uid();
  perform public.fn_actualizar_foto_perfil(v_persona_id, p_foto_url);
end;
$$;

grant execute on function retail.actualizar_mi_foto_perfil to authenticated;
