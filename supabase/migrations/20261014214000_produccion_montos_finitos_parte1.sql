-- ============================================================================
-- 20261014214000_produccion_montos_finitos_parte1.sql — CAYLA V2 (/chaos de Producción, ADR-0409, 2026-10-14) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. /chaos encontró en Producción (2026-10-13, repetido el 2026-10-14), solo por la API, que un `NaN` se guardaba
-- en el dinero y en las cantidades del Taller: el costo de la tela de una orden (`abrir_produccion`), la cantidad y el costo de un
-- lote de insumo (`recibir_insumo`) y las líneas de una factura de insumos (`registrar_comprobante_produccion`, con «"NaN"» en el
-- JSON). Las funciones comparan `<= 0` o `< 0`, y en Postgres `NaN` es MAYOR que cualquier número: pasa todas esas guardas. Una
-- orden con la tela en `NaN` vuelve `NaN` su costo unitario, que al cerrarla se copia a `variantes.costo` (el costo oficial); un lote
-- en `NaN` vuelve `NaN` el costo promedio del insumo y todo el kardex que lo toca. Y no se corrige a mano: nadie ve un `NaN` en una
-- pantalla hasta que una suma entera sale rota.
--
-- LA DECISIÓN. El mismo candado de Ventas (ADR-0398) y Catálogo (ADR-0405), en la tabla, el último guardián sea cual sea la función
-- que escriba: `<tabla>_montos_finitos` en las diez tablas de Producción con montos o cantidades. La frase en castellano ya existe
-- para todo candado con ese nombre (`error-escritura.ts`). Las guardas de las funciones (la huella del token y el IGV) van en la
-- parte 2.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada de esas tablas guarda un `NaN` (ni un infinito) en sus montos o cantidades. Cada candado
--            nace `not valid` y se valida si ninguna fila vieja lo viola (en producción, ninguna, el 2026-10-14); si alguna lo
--            viola, avisa y el candado vale para lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha (todas `numeric` con precisión: el infinito ya no entra por el tipo, el `NaN` sí).
--   NO HACE: no toca funciones, datos ni políticas; no cambia qué monto es válido (los `>= 0` que ya existen siguen igual).
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195: sin políticas, sin funciones). Las tablas son del Taller, no de las
-- tiendas: el candado breve de cada alter no frena a Vender. Cada candado se agrega solo si no existe. Idempotente. Antes de la
-- parte 2 (20261014215000), que no depende de esta.
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

-- `abs(x) < 'Infinity'` es falso para NaN, +∞ y −∞; NULL sigue valiendo (lo que puede faltar, puede faltar).
select pg_temp.candado('producciones', 'producciones_montos_finitos',
  $c$abs(costo_tela) < 'Infinity' and abs(costo_avios) < 'Infinity' and abs(costo_maquila) < 'Infinity' and abs(costo_unitario) < 'Infinity'$c$);
select pg_temp.candado('comprobantes_produccion', 'comprobantes_produccion_montos_finitos',
  $c$abs(subtotal) < 'Infinity' and abs(igv) < 'Infinity' and abs(total) < 'Infinity'$c$);
select pg_temp.candado('comprobantes_produccion_items', 'comprobantes_produccion_items_montos_finitos',
  $c$abs(cantidad) < 'Infinity' and abs(costo_unitario) < 'Infinity' and abs(subtotal) < 'Infinity'$c$);
select pg_temp.candado('comprobantes_produccion_pagos', 'comprobantes_produccion_pagos_montos_finitos',
  $c$abs(monto) < 'Infinity'$c$);
select pg_temp.candado('comprobantes_produccion_cierres', 'comprobantes_produccion_cierres_montos_finitos',
  $c$abs(cantidad) < 'Infinity'$c$);
select pg_temp.candado('cotizaciones_maquila', 'cotizaciones_maquila_montos_finitos',
  $c$abs(precio_maquila) < 'Infinity'$c$);
select pg_temp.candado('insumo_lotes', 'insumo_lotes_montos_finitos',
  $c$abs(cantidad_ingresada) < 'Infinity' and abs(costo_unitario) < 'Infinity'$c$);
select pg_temp.candado('insumos', 'insumos_montos_finitos',
  $c$abs(stock_minimo) < 'Infinity' and abs(merma_pct) < 'Infinity'$c$);
select pg_temp.candado('movimientos_insumo', 'movimientos_insumo_montos_finitos',
  $c$abs(cantidad) < 'Infinity' and abs(costo_unitario) < 'Infinity'$c$);
select pg_temp.candado('orden_insumo_items', 'orden_insumo_items_montos_finitos',
  $c$abs(cantidad) < 'Infinity' and abs(precio_unitario) < 'Infinity' and abs(descuento) < 'Infinity' and abs(descuento_pct) < 'Infinity' and abs(subtotal) < 'Infinity'$c$);
