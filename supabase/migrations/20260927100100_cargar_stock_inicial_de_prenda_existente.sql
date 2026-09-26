-- ============================================================================
-- 20260927100100_cargar_stock_inicial_de_prenda_existente.sql — CAYLA V2 · ADR-0233 · PARTE 1 de 2
-- La primera carga de una prenda que YA existe en el catálogo entra como «Stock inicial», no como ajuste.
--
-- EL PROBLEMA PRIMERO. En Tienda TRU, 34 de los 41 ajustes que sumaron stock en su primera semana (+107 prendas) fueron
-- en realidad la PRIMERA carga de esa prenda en la tienda: «Ajuste · reposición» y «Ajuste · conteo físico» usados como
-- puerta de entrada (consulta de solo lectura a producción, 2026-09-26). Quedan para siempre como correcciones
-- (sobrantes), que en una revisión parecen mercadería sin papeles. ADR-0212 creó el stock inicial para los productos
-- NUEVOS (Nuevo producto ▸ «Cuántas tienes hoy»), y dejó anotado: «Productos que ya se crearon sin stock no pueden usar
-- el paso 5. `fn_cargar_stock_inicial` ya sirve para ellos; falta la pantalla».
--
-- QUÉ HACE. `retail.cargar_stock_inicial` (nueva, la llama Existencias ▸ Ajustar stock): la puerta pública de
-- `fn_cargar_stock_inicial` (interna, ADR-0212) para una o varias prendas de una tienda, con sus candados de siempre
-- (tienda que se opera, responsable del combo, solo prendas SIN ningún movimiento en esa tienda, en orden ADR-0190) y,
-- si están colgadas, su bajada al piso en la misma transacción (`bajar_al_piso`, como el alta de producto): el piso
-- nunca «sube solo» (ADR-0208).
--
-- QUIÉN PUEDE (decidido en ADR-0233): quien puede crear el producto (`fn_puede_editar_catalogo`, la regla de ADR-0212)
-- O quien puede ajustar stock (`fn_puede_ajustar_inventario`, candado de ADR-0143). La parte 2 cierra el ajuste como
-- primera carga: quien hoy cargaba así no pierde la posibilidad, cambia de puerta.
--
-- CONTRATO. PROMETE: todas las prendas o ninguna (una transacción); devuelve cuántas unidades cargó. ASUME: que la web
-- solo la llama con prendas sin historia en esa tienda (igual la base lo exige: hint `carga_con_historia`).
--
-- SE ROMPE SI: alguien usa esta puerta para mercadería que LLEGA de un proveedor (entraría sin costo ni documento, el
-- mismo riesgo que ADR-0212 dejó anotado: la puerta es para el paso al sistema y hay que cerrarla cuando termine).
--
-- CÓMO SE PEGA: tal cual en el SQL Editor de producción (ya trae `retail.`). Solo crea una función: no toma candados de
-- tablas en uso ni lleva políticas. Se puede pegar dos veces. Va ANTES de publicar la web (la web la llama).
-- ============================================================================

set search_path = retail, public, extensions;

create or replace function retail.cargar_stock_inicial(
  p_ubicacion_id uuid,
  p_items jsonb,
  p_nota text default null,
  p_al_piso boolean default false,
  p_token uuid default null
)
returns integer
language plpgsql
security definer
set search_path to 'retail', 'public', 'extensions'
as $function$
declare
  v_unidades integer;
begin
  if not (fn_puede_editar_catalogo() or fn_puede_ajustar_inventario()) then
    raise exception 'Cargar el stock inicial de una prenda lo hace quien puede crear productos o ajustar stock.'
      using errcode = '42501', hint = 'carga_sin_permiso';
  end if;

  -- La carga (candados, responsable, «sin historia en esta tienda») vive en UNA función: se llama, no se copia.
  v_unidades := fn_cargar_stock_inicial(
    p_ubicacion_id,
    p_items,
    coalesce(nullif(btrim(p_nota), ''), 'Lo que ya había en tienda, cargado desde Ajustar stock')
  );

  -- Colgadas en el piso: la misma entrada al almacén + su bajada, en la misma transacción (como el alta de producto).
  if p_al_piso then
    perform bajar_al_piso(p_ubicacion_id, p_items, coalesce(p_token, gen_random_uuid()));
  end if;

  return v_unidades;
end;
$function$;

comment on function retail.cargar_stock_inicial(uuid, jsonb, text, boolean, uuid) is
  'ADR-0233: la primera carga de prendas que ya existen en el catálogo, en una tienda donde todavía no tienen ningún movimiento. Entrada con motivo carga_inicial (fn_cargar_stock_inicial, ADR-0212) y, si están colgadas, su bajada al piso. La puede quien crea productos o ajusta stock.';

revoke all on function retail.cargar_stock_inicial(uuid, jsonb, text, boolean, uuid) from public, anon;
grant execute on function retail.cargar_stock_inicial(uuid, jsonb, text, boolean, uuid) to authenticated;

notify pgrst, 'reload schema';
