-- ============================================================================
-- 20261015152000_catalogo_precio_con_tope_parte1.sql — CAYLA V2 (recomendaciones de /chaos, ADR-0415, 2026-10-15) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. /chaos de Catálogo (2026-10-13 y 14) dejó una pregunta para Felipe: un precio o un costo de S/ 99 999 999 entra
-- sin aviso, y el error real que eso esconde es el punto que falta: «5990» tipeado por «59.90». En producción la prenda más cara cuesta
-- S/ 169.90 y el costo más alto es de S/ 85 (2026-10-15). Felipe pidió aplicar la recomendación (2026-10-15): un tope.
--
-- LA DECISIÓN. Ninguna prenda pasa de S/ 5 000 de precio (de catálogo, por sede o de Liquidación) ni de costo: 30 veces la más cara de
-- hoy, y frena el punto que falta en todo precio de S/ 50 o más. Va en la tabla (`<tabla>_precio_con_tope`), el último guardián: el costo
-- de una prenda también lo escriben Compras (al recibir) y Producción (al cerrar una orden). El `NaN` lo deja pasar a propósito: lo frena
-- `<tabla>_montos_finitos` con su frase. La pantalla corta antes (`MAX_PRECIO_PRENDA`, `lib/catalogo-topes.ts`) y avisa, sin bloquear,
-- cuando el costo pasa al precio (eso puede ser a propósito: liquidar).
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada guarda un precio o un costo de más de S/ 5 000. Cada candado nace `not valid` y se valida si
--            ninguna fila vieja lo viola (en producción, ninguna, el 2026-10-15); si alguna lo viola, avisa y vale para lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha.
--   NO HACE: no toca funciones, datos ni políticas; no topa el precio de una VENTA (`venta_items`): lo que se cobró, se cobró.
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195), mejor fuera de horario: `variantes` la lee Vender y cada alter toma un
-- candado breve. Idempotente. Antes de la parte 2 (20261015153000), que no depende de esta.
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

-- Hasta S/ 5 000; NULL sigue valiendo y el `NaN` pasa (lo frena `_montos_finitos`).
select pg_temp.candado('variantes', 'variantes_precio_con_tope',
  $c$(precio <= 5000 or precio = 'NaN') and (costo <= 5000 or costo = 'NaN')$c$);
select pg_temp.candado('precios_sede_prenda', 'precios_sede_prenda_precio_con_tope', $c$precio <= 5000 or precio = 'NaN'$c$);
select pg_temp.candado('precios_sede', 'precios_sede_precio_con_tope', $c$precio <= 5000 or precio = 'NaN'$c$);
select pg_temp.candado('parametros_liquidacion', 'parametros_liquidacion_precio_con_tope', $c$precio_minimo <= 5000 or precio_minimo = 'NaN'$c$);
select pg_temp.candado('piezas_liquidacion', 'piezas_liquidacion_precio_con_tope', $c$precio <= 5000 or precio = 'NaN'$c$);
select pg_temp.candado('piezas_liquidacion_etiquetas', 'piezas_liquidacion_etiquetas_precio_con_tope', $c$precio <= 5000 or precio = 'NaN'$c$);
