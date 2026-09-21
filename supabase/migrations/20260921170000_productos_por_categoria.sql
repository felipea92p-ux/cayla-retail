-- ============================================================================
-- 20260921170000_productos_por_categoria.sql — pantalla Categorías (pantalla:productos-categorias, tarea #2)
--
-- PROBLEMA. `/productos/categorias` traía TODAS las filas de `productos` al servidor solo para contar cuántas
-- hay por categoría. Supabase corta las respuestas en ~1000 filas sin avisar: cuando el catálogo pase ese
-- número, las tarjetas mostrarían "sin productos" en categorías que sí tienen. Un conteo es trabajo de la base.
--
-- QUÉ HACE. Una función de solo lectura que devuelve (categoria_id, n) de productos ACTIVOS. `security invoker`:
-- respeta la RLS de `productos` (cualquier persona autenticada la lee), no abre ninguna puerta nueva.
--
-- ORDEN. La app la llama y, si todavía no existe en producción, cae al conteo anterior: se puede pegar antes o
-- después de desplegar sin romper la pantalla. Idempotente. Solo local hasta que Felipe la pegue en producción
-- (prefijo `retail.` ya incluido).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.fn_productos_por_categoria()
returns table (categoria_id uuid, n bigint)
language sql stable security invoker set search_path = retail, public, extensions as $$
  select p.categoria_id, count(*)::bigint
  from retail.productos p
  where p.estado = 'activo' and p.categoria_id is not null
  group by p.categoria_id
$$;

grant execute on function retail.fn_productos_por_categoria() to authenticated;
