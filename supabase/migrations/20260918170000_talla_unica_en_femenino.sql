-- ============================================================================
-- 20260918170000 — La talla "Único" pasa a llamarse "Única"
--
-- POR QUÉ
--   "Talla" es femenino: se dice "talla única", no "talla único". "Único"
--   entró con el seed de categorías (20260915221526, arrays de tallas
--   sugeridas) y de ahí pasó a `retail.tallas` al cerrar el vocabulario
--   (20260917100400); nadie lo decidió, se coló con la grafía del array.
--
-- POR QUÉ ES SEGURO (verificado, no supuesto)
--   · `variantes` apunta a la talla por `talla_id` (uuid), no por el texto:
--     renombrar `valor` no toca ninguna variante ni ningún SKU.
--   · El código impreso usa `fn_token_talla`, que ya normaliza "unico"/"unica"
--     al mismo token `U`: los códigos de barras existentes no cambian.
--   · `categoria_tallas` también referencia por `talla_id`: las categorías que
--     ofrecen "Única" (Aretes, Collares, Pulseras...) la siguen ofreciendo.
--   · La unicidad `tallas_clave_unica` compara `fn_clave_texto(valor)`, que
--     ignora tildes y mayúsculas — pero "unico" ≠ "unica", así que el rename
--     no choca con nada existente. La guarda de abajo lo comprueba igual.
--
-- DÓNDE SE VE
--   En todas partes a la vez: ninguna tabla guarda el texto de la talla, se
--   lee siempre por unión con `tallas.valor` (20260917100800). No queda ningún
--   "Único" rezagado en variantes, movimientos ni comprobantes.
--
-- Idempotente: si ya se llama "Única", no hace nada.
--
-- NOTA DE NUMERACIÓN: nació como 20260918160000, pero ese número ya lo usaba
-- 20260918160000_etiquetas_descuento_y_categorias.sql (llegó de main) y dos
-- migraciones con la misma versión rompen `supabase start` (llave duplicada en
-- schema_migrations). Producción no se ve afectada: esta se pegó a mano en el
-- SQL Editor y no quedó registrada con ninguna versión.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from retail.tallas where retail.fn_clave_texto(valor) = 'unica'
  ) and exists (
    select 1 from retail.tallas where retail.fn_clave_texto(valor) = 'unico'
  ) then
    -- Las dos conviven: renombrar una chocaría con el índice único. Habría
    -- que fusionarlas a mano (repuntar variantes y categoria_tallas), decisión
    -- que no se toma en silencio dentro de una migración.
    raise exception 'Existen a la vez una talla "Única" y una "Único" en retail.tallas; fusionarlas a mano antes de correr esta migración.';
  end if;
end $$;

update retail.tallas
   set valor = 'Única'
 where retail.fn_clave_texto(valor) = 'unico'
   and valor <> 'Única';
