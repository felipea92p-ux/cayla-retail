-- ============================================================================
-- Arreglo de recursión infinita en RLS ("stack depth limit exceeded").
--
-- Las funciones de identidad (fn_es_lider, fn_sede_actual_persona, fn_persona_actual)
-- consultan la tabla `personas`, que a su vez tiene políticas RLS que llaman a
-- fn_es_lider() → que consulta personas → que evalúa RLS → que llama fn_es_lider()
-- → ... bucle infinito. Se manifestó al consultar activos_fijos con dos políticas
-- que dependen de estas funciones.
--
-- Arreglo estándar (patrón recomendado por Supabase): estas funciones corren como
-- SECURITY DEFINER, así leen `personas` SIN aplicar RLS y se rompe el ciclo. Es
-- seguro: cada una solo lee la fila del propio usuario (where auth_user_id = auth.uid())
-- y devuelve un booleano / su sede — nunca expone datos de otros.
-- ============================================================================

create or replace function fn_es_lider()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select coalesce((select rol = 'lider' from personas where auth_user_id = auth.uid()), false);
$$;

create or replace function fn_sede_actual_persona()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select sede_id from personas where auth_user_id = auth.uid();
$$;

create or replace function fn_persona_actual()
returns personas
language sql stable
security definer
set search_path = public
as $$
  select * from personas where auth_user_id = auth.uid();
$$;
