-- Lecturas grandes en UNA fila jsonb (velocidad, 2026-09-23 — BACKLOG «Velocidad», opción A elegida por Felipe).
--
-- EL PROBLEMA. PostgREST corta toda respuesta en 1.000 filas. TRU ya tiene ~1.200 variantes y la red ~2.900 filas de
-- stock, así que la web lee estas funciones por páginas (`leerTodas`, lib/resultado.ts). Pero una función que
-- devuelve una tabla se CALCULA ENTERA en cada página: `fn_resumen_variantes` cuesta ~265 ms dentro de la base
-- (medido como líder en producción) y Existencias la pedía en 6 páginas por visita. La base es de poca CPU: 1
-- llamada tarda ~430 ms, 3 a la vez 685 ms, 6 a la vez 1,3 s. Existencias quedaba en ~3 s.
--
-- LA SALIDA. Una envoltura por función que agrega el resultado en UN valor jsonb: una fila, sin tope de filas, un
-- solo cálculo. Las funciones originales NO se tocan (las siguen usando otras pantallas y los scripts), y la
-- envoltura no decide nada: mismas filas, mismas columnas, mismo orden (`with ordinality`), y los permisos los sigue
-- revisando la función de adentro (security definer con sus propios candados sobre `auth.uid()`). Por eso la
-- envoltura es `security invoker`: no suma privilegios.

create or replace function retail.fn_resumen_variantes_json(
  p_ubicacion_id uuid,
  p_desde date default null,
  p_hasta date default null,
  p_cmp_desde date default null,
  p_cmp_hasta date default null
)
returns jsonb
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
  from retail.fn_resumen_variantes(
    p_ubicacion_id => p_ubicacion_id,
    p_desde => p_desde,
    p_hasta => p_hasta,
    p_cmp_desde => p_cmp_desde,
    p_cmp_hasta => p_cmp_hasta
  ) with ordinality r;
$$;

create or replace function retail.fn_resumen_comparacion_json(
  p_ubicacion_id uuid,
  p_a_desde date,
  p_a_hasta date,
  p_b_desde date,
  p_b_hasta date
)
returns jsonb
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
  from retail.fn_resumen_comparacion(p_ubicacion_id, p_a_desde, p_a_hasta, p_b_desde, p_b_hasta) with ordinality r;
$$;

create or replace function retail.fn_stock_por_sede_json()
returns jsonb
language sql
stable
security invoker
set search_path to 'retail', 'public', 'extensions'
as $$
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
  from retail.fn_stock_por_sede() with ordinality r;
$$;

-- Mismos permisos que las originales: solo cuentas con sesión (sin `anon`, sin `public`).
revoke all on function retail.fn_resumen_variantes_json(uuid, date, date, date, date) from public, anon;
revoke all on function retail.fn_resumen_comparacion_json(uuid, date, date, date, date) from public, anon;
revoke all on function retail.fn_stock_por_sede_json() from public, anon;
grant execute on function retail.fn_resumen_variantes_json(uuid, date, date, date, date) to authenticated;
grant execute on function retail.fn_resumen_comparacion_json(uuid, date, date, date, date) to authenticated;
grant execute on function retail.fn_stock_por_sede_json() to authenticated;
