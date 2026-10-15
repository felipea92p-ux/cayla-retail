-- ============================================================================
-- 20261015170000_compras_montos_y_fechas_parte1.sql — CAYLA V2 (/chaos de Compras, ADR-0421, 2026-10-15) · PARTE 1 de 2
--
-- EL PROBLEMA PRIMERO. /chaos de Compras (2026-10-13, repetido el 2026-10-15 sobre main, ya con la reconstrucción del módulo) encontró,
-- solo por la API:
--   1. Una factura con el costo o el IGV en `NaN` se registraba con total `NaN`, y al RECIBIRLA el costo oficial de la prenda pasaba a
--      `NaN` (ese ya lo frena ADR-0405 en `variantes`; aquí se cierra en el origen). Y las demás tablas de Compras (notas de crédito,
--      despachos, órdenes de compra, el plan de campaña, los reembolsos) tampoco lo frenaban. Los pagos ya lo tenían (20261014192000).
--   2. Una factura que vence ANTES de emitirse.
--   3. Un proveedor con un nombre de 5000 letras.
--
-- LA DECISIÓN. Candados en las tablas, el último guardián, con las mismas reglas que ya rigen en Producción y Finanzas:
--   · `<tabla>_montos_finitos` en las diez tablas de Compras con montos que no lo tenían.
--   · `compras_vence_despues_de_emitir`: el vencimiento no es anterior a la emisión (lo mismo que una factura del Taller).
--   · `proveedores_textos_con_tope`: el nombre hasta 120 letras (en producción, el más largo mide 43, 2026-10-15).
--   El IGV con rango, la emisión que no es futura y la serie que no es vacía van en `registrar_compra` (parte 2): dependen del tipo de
--   comprobante y de la fecha de hoy.
--
-- CONTRATO (Liskov)
--   PROMETE: ninguna fila nueva o editada viola esos candados. Cada uno nace `not valid` y se valida si ninguna fila vieja lo viola (en
--            producción, ninguna, el 2026-10-15: todavía no hay facturas de compra); si alguna lo viola, avisa y vale para lo nuevo.
--   ASUME:   las columnas de esas tablas a la fecha.
--   NO HACE: no toca funciones, datos ni políticas; no pone tope al monto de una factura (una compra grande de mercadería es real).
--
-- CÓMO SE PEGA. Una sola parte con SOLO `alter table` (ADR-0195). Idempotente. Antes de la parte 2 (20261015171000), que no depende de esta.
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

-- 1. Ningún monto es NaN ni infinito. `abs(x) < 'Infinity'` es falso para NaN, +∞ y −∞; NULL sigue valiendo.
select pg_temp.candado('compras', 'compras_montos_finitos',
  $c$abs(subtotal) < 'Infinity' and abs(igv) < 'Infinity' and abs(total) < 'Infinity' and abs(pagado) < 'Infinity'
     and abs(notas_credito) < 'Infinity' and abs(saldo) < 'Infinity'$c$);
select pg_temp.candado('compra_items', 'compra_items_montos_finitos',
  $c$abs(costo_unitario) < 'Infinity' and abs(subtotal) < 'Infinity' and abs(precio_venta_sugerido) < 'Infinity'$c$);
select pg_temp.candado('compra_notas_credito', 'compra_notas_credito_montos_finitos',
  $c$abs(subtotal) < 'Infinity' and abs(igv) < 'Infinity' and abs(monto) < 'Infinity' and abs(aplicado) < 'Infinity'$c$);
select pg_temp.candado('despacho_diferencias', 'despacho_diferencias_montos_finitos', $c$abs(costo_unitario) < 'Infinity'$c$);
select pg_temp.candado('despacho_items', 'despacho_items_montos_finitos', $c$abs(precio_unitario) < 'Infinity'$c$);
select pg_temp.candado('despacho_recibidos', 'despacho_recibidos_montos_finitos', $c$abs(costo_unitario) < 'Infinity'$c$);
select pg_temp.candado('orden_compra_items', 'orden_compra_items_montos_finitos',
  $c$abs(precio_unitario) < 'Infinity' and abs(descuento) < 'Infinity' and abs(descuento_pct) < 'Infinity' and abs(subtotal) < 'Infinity'$c$);
select pg_temp.candado('planes_compra', 'planes_compra_montos_finitos', $c$abs(tope_inversion) < 'Infinity'$c$);
select pg_temp.candado('planes_compra_lineas', 'planes_compra_lineas_montos_finitos', $c$abs(precio) < 'Infinity' and abs(costo) < 'Infinity'$c$);
select pg_temp.candado('proveedor_creditos', 'proveedor_creditos_montos_finitos', $c$abs(monto) < 'Infinity'$c$);

-- 2. Las fechas de una factura y el nombre de un proveedor.
select pg_temp.candado('compras', 'compras_vence_despues_de_emitir',
  $c$fecha_vencimiento is null or fecha_emision is null or fecha_vencimiento >= fecha_emision$c$);
select pg_temp.candado('proveedores', 'proveedores_textos_con_tope', $c$char_length(nombre) <= 120$c$);
