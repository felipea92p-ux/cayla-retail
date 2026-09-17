-- ============================================================================
-- 20260917130000 — RPC para editar qué tallas/tejidos/patrones ofrece una
-- categoría, desde la pantalla de Categorías
--
-- `categoria_tallas`/`categoria_tejidos`/`categoria_patrones`
-- (20260917100400) ya existían y ya alimentan `NuevoProductoForm.tsx` vía
-- `getEjesPorCategoria()` — lo único que faltaba era la forma de escribir
-- en ellas sin SQL directo. Sin esto, tejido y patrón quedan vacíos para
-- TODA categoría hasta que alguien cargue las filas a mano (solo tallas
-- tiene contenido, por el backfill de `tallas_sugeridas` de esa misma
-- migración) — hoy es un selector que existe en el formulario de producto
-- pero no tiene nada para ofrecer.
--
-- POR QUÉ UN RPC Y NO 3 DELETE+INSERT DESDE EL CLIENTE
--   "Reemplaza, no amplía" (mismo criterio que la migración de origen): la
--   pantalla manda el conjunto completo de ids elegidos para un eje, no un
--   diff. Hacer eso como delete+insert directo desde supabase-js son 2
--   llamadas HTTP separadas — nada obliga a que ambas terminen, y una
--   categoría podría quedar momentáneamente sin ninguna talla si la
--   segunda falla. Envolver los 3 ejes en una sola función plpgsql los hace
--   atómicos de verdad (principio 9): o se guardan los 3 ejes juntos, o
--   ninguno.
--
-- QUÉ NO VALIDA A PROPÓSITO
--   No exige que cada id venga de una talla/tejido/patrón 'aprobado' y
--   'activo' — ese filtro ya es el único que importa y ya vive en el lugar
--   que lo hace cumplir de verdad: `getEjesPorCategoria()` (lectura) solo
--   trae valores aprobados+activos hacia el formulario de producto. Una
--   fila de `categoria_tallas` que apunte a una talla luego rechazada o
--   desactivada simplemente deja de aparecer ahí — no rompe nada, se
--   autolimpia en la lectura. Duplicar ese filtro acá sería el mismo
--   candado en dos lugares (principio "un solo lugar").
-- ============================================================================

create function retail.actualizar_categoria_ejes(
  p_categoria_id uuid,
  p_talla_ids uuid[],
  p_tejido_ids uuid[],
  p_patron_ids uuid[]
) returns void
language plpgsql security definer set search_path = retail, public as $$
begin
  if not retail.fn_es_lider() then
    raise exception 'Solo un Líder puede editar qué tallas/tejidos/patrones ofrece una categoría.';
  end if;

  if not exists (select 1 from retail.categorias where id = p_categoria_id) then
    raise exception 'Esa categoría ya no existe. Recarga la pantalla.';
  end if;

  -- `distinct`: el contrato de este RPC es "acá va el conjunto completo",
  -- no una lista sin duplicados garantizada por quien llama. Sin esto, un
  -- id repetido en el array (nunca lo produce este selector de a un clic,
  -- pero nada en la firma del RPC lo impide) tira `duplicate key value
  -- violates unique constraint` y aborta el guardado de los 3 ejes juntos
  -- por un error que no debería ni depender de quién llama.
  delete from retail.categoria_tallas where categoria_id = p_categoria_id;
  if p_talla_ids is not null and array_length(p_talla_ids, 1) > 0 then
    insert into retail.categoria_tallas (categoria_id, talla_id)
      select distinct p_categoria_id, t from unnest(p_talla_ids) as t;
  end if;

  delete from retail.categoria_tejidos where categoria_id = p_categoria_id;
  if p_tejido_ids is not null and array_length(p_tejido_ids, 1) > 0 then
    insert into retail.categoria_tejidos (categoria_id, tejido_id)
      select distinct p_categoria_id, t from unnest(p_tejido_ids) as t;
  end if;

  delete from retail.categoria_patrones where categoria_id = p_categoria_id;
  if p_patron_ids is not null and array_length(p_patron_ids, 1) > 0 then
    insert into retail.categoria_patrones (categoria_id, patron_id)
      select distinct p_categoria_id, t from unnest(p_patron_ids) as t;
  end if;
end;
$$;

comment on function retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[]) is
  'Reemplaza (no amplía) el conjunto completo de tallas/tejidos/patrones que ofrece una categoría. Los 3 ejes se guardan juntos, atómicamente. No valida estado/activo de los ids recibidos — ese filtro ya vive en getEjesPorCategoria() (lectura), no acá.';

grant execute on function retail.actualizar_categoria_ejes(uuid, uuid[], uuid[], uuid[]) to authenticated;
