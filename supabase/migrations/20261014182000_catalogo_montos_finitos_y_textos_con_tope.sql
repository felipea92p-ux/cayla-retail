-- ============================================================================
-- 20261014182000_catalogo_montos_finitos_y_textos_con_tope.sql — CAYLA V2 (/chaos de Catálogo, ADR-0405, 2026-10-14)
--
-- EL PROBLEMA PRIMERO. /chaos encontró en Catálogo (2026-10-13, repetido el 2026-10-14), solo por la API:
--   1. Una prenda con precio o costo `NaN` (o infinito) se guardaba: `crear_producto_con_variantes` y `catalogo_actualizar_producto`
--      comparan `<= 0`, y en Postgres `NaN` es MAYOR que cualquier número. Una prenda así no se puede vender (el cobro rechaza
--      «precio cambiado») y vuelve `NaN` toda suma que la toque. Y como `variantes.costo` es el COSTO OFICIAL que también escriben
--      Compras (al recibir) y Producción (al cerrar una orden), por ahí entraba el mismo `NaN` que /chaos vio el 2026-10-13 en esos dos
--      módulos y que no se corrige a mano.
--   2. Un nombre de producto o de marca de 5000 letras se guardaba entero (la pantalla tampoco lo cortaba).
--
-- LA DECISIÓN. Candados en las tablas, el último guardián sea cual sea la función que escriba (el mismo patrón de ADR-0398 en Ventas):
--   · `<tabla>_montos_finitos`: el precio y el costo de una prenda, el precio por sede (de la prenda y del producto) y los de
--     Liquidación no son `NaN` ni infinitos. La frase en castellano ya existe para todo candado con ese nombre (`error-escritura.ts`).
--   · `<tabla>_textos_con_tope`: el nombre de un producto hasta 80 letras (el mismo tope del modelo nuevo de Producción) y su
--     descripción hasta 500; el nombre de una marca, una categoría, un color o una familia, también hasta 80 (una migración vieja,
--     20260927200000, escribe un nombre de categoría de 73 letras al pegarse de nuevo). En producción, lo
--     más largo guardado mide 38, 128, 43, 22, 20 y 25 (2026-10-14): nada queda fuera.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada viola esos candados. Cada uno nace `not valid` y se valida si ninguna fila vieja lo viola (en
--            producción, ninguna, el 2026-10-14); si alguna lo viola, avisa y el candado vale para lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha.
--   NO HACE: no toca funciones, datos ni políticas. No pone un tope al precio ni compara costo con precio (eso es de Felipe, ADR-0405).
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195: sin políticas, sin funciones), mejor fuera de horario: cada alter toma
-- un candado breve de su tabla (`variantes` la lee Vender). Cada candado se agrega solo si no existe. Idempotente.
-- ============================================================================
set lock_timeout = '3s';

-- Agrega un CHECK `not valid` si no existe y lo valida si ninguna fila lo viola.
create or replace function pg_temp.candado(p_tabla text, p_nombre text, p_expresion text)
returns void
language plpgsql
as $f$
begin
  if not exists (select 1 from pg_constraint where conname = p_nombre and conrelid = ('retail.' || p_tabla)::regclass) then
    execute format('alter table retail.%I add constraint %I check (%s) not valid', p_tabla, p_nombre, p_expresion);
  end if;
  begin
    execute format('alter table retail.%I validate constraint %I', p_tabla, p_nombre);
  exception when check_violation then
    raise notice 'retail.%: hay filas viejas que no cumplen % — el candado vale para lo nuevo; corrígelas y luego valida a mano.', p_tabla, p_nombre;
  end;
end;
$f$;

-- 1. Ningún monto es NaN ni infinito. `abs(x) < 'Infinity'` es falso para NaN, +∞ y −∞; NULL sigue valiendo. En una columna con
--    precisión (`numeric(12,2)`) el infinito ya no entra por el tipo: ahí el candado frena el NaN, que sí entra.
select pg_temp.candado('variantes', 'variantes_montos_finitos', $c$abs(precio) < 'Infinity' and abs(costo) < 'Infinity'$c$);
select pg_temp.candado('precios_sede', 'precios_sede_montos_finitos', $c$abs(precio) < 'Infinity'$c$);
select pg_temp.candado('precios_sede_prenda', 'precios_sede_prenda_montos_finitos', $c$abs(precio) < 'Infinity'$c$);
select pg_temp.candado('parametros_liquidacion', 'parametros_liquidacion_montos_finitos', $c$abs(precio_minimo) < 'Infinity'$c$);
select pg_temp.candado('piezas_liquidacion', 'piezas_liquidacion_montos_finitos', $c$abs(precio) < 'Infinity'$c$);
select pg_temp.candado('piezas_liquidacion_etiquetas', 'piezas_liquidacion_etiquetas_montos_finitos', $c$abs(precio) < 'Infinity'$c$);

-- 2. Los nombres con tope (en letras, no en bytes: una «ñ» cuenta una).
select pg_temp.candado('productos', 'productos_textos_con_tope', $c$char_length(referencia) <= 80 and char_length(descripcion) <= 500$c$);
select pg_temp.candado('marcas', 'marcas_textos_con_tope', $c$char_length(nombre) <= 80$c$);
select pg_temp.candado('categorias', 'categorias_textos_con_tope', $c$char_length(nombre) <= 80$c$);
select pg_temp.candado('colores', 'colores_textos_con_tope', $c$char_length(nombre) <= 80$c$);
select pg_temp.candado('familias', 'familias_textos_con_tope', $c$char_length(nombre) <= 80$c$);
