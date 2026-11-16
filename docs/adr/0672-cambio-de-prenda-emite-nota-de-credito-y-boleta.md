# ADR-0672 — Un cambio de prenda emite su nota de crédito y su boleta nueva

- **Fecha:** 2026-11-16 · **Decidió:** Felipe (plan de 8 actividades y las tres decisiones de abajo, en el chat del 2026-11-16).
- **Estado:** actividad 1 construida y probada en una copia de la base local con las funciones de producción. **Sin pegar en
  producción:** la pega Felipe, con el OK del contador (actividad 7).
- **Sigue a:** ADR-0100 y ADR-0382 (la nota de crédito de una devolución), ADR-0380 (lo pagado manda), ADR-0390 (la devolución espera la
  boleta), ADR-0470 (cambio por varias), ADR-0655 (el mismo modelo conserva su descuento). Cierra el pendiente «Boleta y nota de crédito de un
  cambio» que dejaron ADR-0125, ADR-0177 y ADR-0470.

## El problema

Un cambio no emitía ningún comprobante. La boleta original seguía declarando la prenda que volvió, y lo que se cobró o se devolvió por la
diferencia no figuraba en ningún papel. Mientras tanto, el Diario (`fn_asientos`) asentaba esa diferencia con su IGV, y el registro de ventas
para SUNAT (`fn_impuestos_ventas`) no la veía, porque solo lee comprobantes. Al 2026-11-16, en producción, había 25 cambios: 12 de mismo precio,
11 con S/ 209.70 cobrados (unos S/ 31.99 de IGV) y 2 con S/ 10.10 devueltos, todos sin papel.

**Qué dice SUNAT.** La nota de crédito se emite por anulaciones, descuentos, bonificaciones, devoluciones y otros, y solo al mismo adquirente
del comprobante que modifica (Reglamento de Comprobantes de Pago, art. 10 num. 1; Informe 000057-2025-SUNAT/7T0000). No se encontró una norma
ni un informe que trate el cambio de prenda como tal: la lectura de abajo («un cambio es una devolución más una compra») es nuestra, y la
confirma el contador antes de pegarla en producción.

## Decisión

DECIDÍ: tratar el cambio como lo que es, dos hechos. La clienta **devuelve** una prenda y **compra** otra, y cada hecho lleva su papel, en el
mismo guardado y sin un paso más para la colaboradora:

- **Nota de crédito** sobre la boleta (o factura) original, por lo que se **pagó** por la prenda devuelta (ADR-0380). Lleva el motivo «06»
  si devuelve toda la venta y «07» si es parte, y sus ítems tienen la forma de una línea de venta, igual que en la devolución (ADR-0382). Va
  en la serie de la tienda de la boleta original, con su misma letra.
- **Boleta nueva** (o factura, si la original lo era), al mismo cliente, por la prenda que se lleva, en la serie de la tienda del cambio.
  Vale lo pagado **más la diferencia** (`cambios.diferencia`, la misma cifra que cobró o devolvió la caja). Su línea dice el precio de lista
  y el descuento aparte, si el mismo modelo lo conserva (ADR-0655).

Así, **boleta − nota = diferencia**, siempre. Una comprobación al final de la función lo exige o no guarda nada.

**La caja no se toca.** `fn_calcular_esperado_caja` cuenta los pagos de las ventas, los reembolsos de las devoluciones y la diferencia del
cambio; nunca los comprobantes. Por eso los dos papeles van **sin venta y sin pago** (`comprobantes.cambio_id`, `venta_id` vacío, candado
`comprobantes_cambio_sin_venta`): la venta original no se anula y la boleta nueva no es una venta. La caja del día de la compra, aunque esté
cerrada, no cambia; la del día del cambio sigue esperando solo la diferencia, como hoy. Ni Ventas, ni las metas, ni el Resumen cuentan la
prenda dos veces.

**Las tres decisiones de Felipe (2026-11-16):**

1. Si la boleta original todavía no está aceptada por SUNAT, **el cambio espera**, igual que la devolución (ADR-0390, hint
   `cambio_boleta_sin_aceptar`). La base no deja emitir una nota sobre una boleta sin aceptar (`fn_valida_nota_referencia_aceptada`).
2. Si la venta **no tiene boleta ni factura del ERP** (nota de venta, emitida afuera con Alegra, liberada o anulada), no hay papel que
   corregir: el cambio se guarda y no emite nada.
3. Se imprime **solo la boleta nueva**. La nota queda en Comprobantes (pantalla: actividad 4).

**Piezas** (`20261116220000_cambio_emite_sus_comprobantes.sql`):

- `comprobantes.cambio_id`, con su candado y un solo papel de cada tipo por cambio.
- `fn_emitir_nota_interna`: el cuerpo de `emitir_nota` sin el permiso de sede. `emitir_nota` queda como «permiso + interna», con la misma
  firma, el mismo comportamiento y los mismos permisos (la prueba de la devolución pasa 16/16).
- `fn_emitir_comprobantes_del_cambio`: arma y reserva los dos papeles.
- `registrar_cambio` la llama al final, con un reemplazo anclado. El cambio por varias prendas se conecta en la actividad 2.

DESCARTÉ:

- **Emitir solo por la diferencia** (una boleta por lo que se cobra de más, o una nota por lo que se devuelve, y nada si el precio es igual).
  Es lo que se recomendó primero. Es más cómodo, pero la boleta original seguiría declarando la prenda que volvió, un cambio de color quedaría
  sin papel y un papel «por diferencia» no describe ninguna prenda vendida ni devuelta.
- **Anular la venta original y venderla de nuevo.** `anular_venta` descuadraría la caja del día de la compra, porque esa caja cuenta las
  ventas no anuladas. Además, ya se niega con cuatro candados: caja cerrada, otro día, boleta aceptada o un cambio previo.
- **Hacer el cambio como devolución con reembolso más una venta nueva.** Saca y mete plata del cajón que nunca se movió.
- **Llamar a `emitir_nota` tal como está.** Pide permiso sobre la tienda de la boleta original, y el cambio puede hacerse en otra tienda
  (ADR-0370): una colaboradora de Trujillo no podría cambiar una compra de Lima.
- **Diferir la nota hasta que la boleta original sea aceptada**: la misma razón que en ADR-0390, porque es una cola más que alguien tiene que
  vigilar.
- **Pedir el DNI si la boleta nueva pasa de S/ 700**, que estaba en el plan. Vender tampoco lo exige hoy (solo Apartados,
  `separaciones-reglas.ts`), y la boleta nueva va al mismo cliente de la original. Si se exige, se exige en los dos lugares a la vez.

SE ROMPE SI:

- **Alguien corrige el texto de una prenda sin registrar después de vender:** la nota repite el texto corregido (el mismo caso que ADR-0382).
- **Un cambio se hace sobre una venta pagada en parte con un adelanto (apartado):** la nota tiene como techo `total + anticipo_deducido`
  (ADR-0380), igual que la devolución.
- **La boleta original queda rechazada para siempre:** el cambio no se puede hacer hasta resolverla en Comprobantes, igual que la devolución.
- **La boleta nueva no se puede repartir en céntimos exactos entre sus unidades:** no pasa con precios por unidad, que es como se calcula la
  diferencia, y si pasara, la función se niega y no guarda nada.

## Verificación (actividad 1)

- **Copia desechable de la base local** (`cambio_comprobantes`), con las migraciones de `main` aplicadas como `postgres`. Las funciones que
  importan tienen la misma huella que producción (`registrar_cambio` 7ce86624, `registrar_cambio_varias` 1847610e, `emitir_nota` 196885b8,
  `aprobar_devolucion` cf2a6529, `fn_precio_mismo_modelo` 7310f632). `emitir_comprobante` solo difiere en los saltos de línea de Windows.
- `pnpm pruebas:cambio-comprobantes`: 13/13. Incluye los tres casos de negocio con la caja y el registro de ventas, el descuento, la venta
  parcial, la boleta sin aceptar, la nota de venta, la factura, el doble clic, otra tienda, el mutante y el pegado doble.
- Regresión en la copia: `registrar_cambio` 29/29, `registrar_cambio_varias` 26/26, `cambio_mismo_modelo` y `cambio_sin_precio` en verde.
  La devolución (`aprobar_devolucion_caja`) da 16/16 aprobando con Felipe: la base local no tiene la cuenta de Sandra y, sin ella, la misma
  prueba falla igual sin esta migración (2/16).
- La migración se pegó dos veces en la copia: es idempotente.
