# ADR-0187 — Por pagar muestra la parte de MI tienda, gestione quien gestione la factura

- **Fecha:** 2026-09-23
- **Estado:** construido; migración `20260924100000_por_pagar_parte_de_mi_tienda.sql` **por pegar en producción ANTES de
  fusionar la web** (la web llama a `fn_deuda_visible`; sin la función, la web muestra las filas como antes, sin romperse).
- **Anterior:** ADR-0184 (Compras por tienda: cada tienda ve y paga lo suyo).

## Problema

Una factura de S/ 10,000 que registra Trujillo (la **gestora**) y trae mercadería mitad para Trujillo y mitad para Arequipa.
Desde ADR-0184, Arequipa ya veía sus S/ 5,000 en «Mis partes». Pero Trujillo veía en Por pagar los S/ 10,000: las cifras de
arriba, la deuda por vencimiento, las salidas de caja, la concentración, los subtotales y la fila sumaban `compras.saldo`, el
saldo de la factura entera. Y el modal de pago venía lleno con 10,000, aunque la base (`fn_pago_no_supera_tienda`) solo le deja
pagar 5,000. Felipe (2026-09-23): «que cada tienda vea su parte».

## Decisión

1. **Una sola regla para «cuánto debo»: `fn_deuda_visible(p_ids)`.** Líder: el saldo de la factura entera (la deuda con el
   proveedor es de la empresa, no cambia nada). Cuenta con un módulo de Compras: por cada factura vigente con saldo en la que una
   de sus tiendas tiene parte, la suma de `fn_saldo_de_tienda` de sus tiendas, más su parte y lo que pagó. Sin módulo, nada.
   `gestionada` dice si la factura la gestiona una de sus tiendas.
2. **Las cifras suman lo que deben MIS tiendas, gestione quien gestione.** «Deuda total» = las filas de la lista + «Mis
   partes». Así Arequipa ve 5,000 en su deuda aunque la factura la gestione Trujillo, y Trujillo ve 5,000, no 10,000.
3. **Los subtotales bajo la lista (`por_pagar_tramos`) solo suman las facturas que gestiono**: tienen que cuadrar con las
   filas (ADR-0111, H3). Las partes ajenas siguen en «Mis partes», con su propio botón de pagar.
4. **La fila dice que es una parte**: «Tu parte · total S/ 10,000.00». Total, pagado y saldo son los de mi tienda; el modal de
   pago se llena y se topa con eso. Si mi tienda ya pagó lo suyo y la otra no, la factura sale de MI lista.
5. **El papel sigue siendo uno.** Comprobantes y el detalle de la factura muestran el total: es el documento del proveedor.

## Alternativas descartadas

- **Guardar el monto de cada tienda en una tabla.** Permitiría que la suma de las partes no diera el total (principio 2). La
  parte sigue saliendo de `compra_parte_por_tienda`, que se calcula.
- **Partir la lista en SQL (`listar_compras`).** Es `security invoker` sobre `compras_resumen`, la usan Comprobantes y otras
  pantallas y trae la fila entera de la vista. Se deja igual y la página reemplaza los montos de la página que ya trajo
  (≤ 50 filas, una llamada).

## Caso borde conocido

Si el líder paga parte de una factura **sin atribuirla a una tienda**, `fn_saldo_de_tienda` topa cada tienda con el saldo real
de la factura, pero la suma de las dos puede pasarlo hasta que ese pago se reparta. El pago nunca puede pasarse (la base topa
con el saldo real); solo la cifra de cada tienda puede verse más alta.

## Cómo se verifica

- `pnpm pruebas:por-pagar-parte-de-mi-tienda` (12 pruebas SQL): la gestora ve su mitad; la otra tienda la suya; el líder el
  total; pagar mi parte me la saca a mí y no al líder; las cifras suben exactamente mi parte; los subtotales solo lo que gestiono.
- `pruebas:compras-por-tienda` 34/34, `compras-indicadores` 144/144, `dinero-compras` 30/30, `compras-parte-por-tienda` 20/20.
- `lib/compras-mi-parte-reglas.test.ts` (`conMiParte`).
