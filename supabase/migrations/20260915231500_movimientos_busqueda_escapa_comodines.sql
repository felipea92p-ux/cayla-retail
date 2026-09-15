-- ============================================================================
-- 20260915231500_movimientos_busqueda_escapa_comodines.sql — CAYLA V2
--
-- `fn_movimientos_variantes` (20260915090000_movimientos_lectura.sql) arma el
-- patrón de búsqueda concatenando `p_busqueda` directo dentro de `ilike '%' ||
-- p_busqueda || '%'`, sin escapar los comodines propios de LIKE/ILIKE: `%`
-- (cualquier secuencia) y `_` (cualquier un carácter). Si un SKU o código de
-- producto contiene un `_` literal, Postgres lo interpreta como comodín en vez
-- de como el carácter que es, y la búsqueda por ese texto exacto trae
-- coincidencias de más.
--
-- Se escapa `p_busqueda` UNA vez (barra invertida primero, para no escapar
-- doble lo que el propio escape agrega) y se usa en las 4 comparaciones
-- `ilike` con `escape '\'`. La rama de código de barras no cambia: compara
-- con `=`, no con `ilike`, así que nunca le importaron los comodines.
--
-- Misma firma exacta (`p_busqueda text) returns uuid[]`) — solo cambia el
-- cuerpo.
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_movimientos_variantes(p_busqueda text)
returns uuid[]
language sql
stable
set search_path = retail, public, extensions
as $$
  with q as (
    select replace(replace(replace(p_busqueda, '\', '\\'), '%', '\%'), '_', '\_') as escapado
  )
  select coalesce(array_agg(v.id), '{}'::uuid[])
  from retail.variantes v
  join retail.productos p on p.id = v.producto_id
  cross join q
  where v.sku ilike '%' || q.escapado || '%' escape '\'
     or v.codigo ilike '%' || q.escapado || '%' escape '\'
     or p.referencia ilike '%' || q.escapado || '%' escape '\'
     or p.codigo ilike '%' || q.escapado || '%' escape '\'
     or exists (
       select 1 from retail.codigos_barras cb
       where cb.variante_id = v.id and lower(cb.codigo) = lower(p_busqueda)
     );
$$;

revoke all on function retail.fn_movimientos_variantes(text) from public;

comment on function retail.fn_movimientos_variantes(text) is
  'Resuelve la búsqueda de Movimientos a ids de variante. p_busqueda se '
  'escapa antes de armar los patrones ilike — un _ o % literal en un SKU ya '
  'no actúa como comodín.';
