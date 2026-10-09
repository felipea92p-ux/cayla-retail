# ADR-0367 — El gasto rápido de Caja: un mosaico por frecuencia

**Fecha:** 2026-10-09 · **Decide:** Felipe · **Estado:** aceptada (solo web, sin migración)

## Problema

En una tienda los gastos son chicos y se repiten: el agua, unas bolsas, el mototaxi, los S/ 0.80 del baño. Desde Caja, «Registrar gasto»
abría el formulario de Finanzas ▸ Gastos, que pedía comprobante (con factura marcada de entrada), proveedor, serie, categoría contable,
tienda, cuenta de salida y condición de pago. Para los S/ 0.80 del baño eran unos diez pasos, y por eso no se registraban.

## Decisión

Caja abre una hoja propia, `GastoRapidoModal` (maqueta A de `docs/maquetas/gasto-rapido-caja-2026-10/`, elegida por Felipe con dos cambios:
sin la fila de atajos y el mosaico ordenado por frecuencia):

1. **Diez conceptos en palabras de tienda** (Agua, Luz, Internet y celular, Baño, Movilidad, Envío, Bolsas, Limpieza, Útiles, Arreglo) y
   «Otro». Cada concepto ya trae su categoría contable de `categorias_gasto` (`lib/gasto-rapido-reglas.ts`, `CONCEPTOS`): nadie la elige.
   Baño va a Servicios básicos.
2. **Orden por frecuencia en ESA sede**, contando los gastos vigentes de los últimos 90 días; a igual frecuencia, el orden de fábrica.
   Los 4 primeros que se usaron al menos una vez llevan una ★ arriba a la derecha y cuántas veces se usaron. «Otro» va siempre al final.
   Una sede sin gastos ve el orden de fábrica y ninguna ★: una estrella con «0 veces» sería mentira.
3. **Sale del cajón abierto, al contado y con fecha de hoy.** No se pregunta: es lo que pasa en la tienda.
4. **«Otro» pide qué fue Y a qué se parece** (las categorías contables con sus ejemplos). La base sigue sin «Otros» (ADR-0195): una categoría
   comodín volvería a llenar el estado de resultados de cosas sin cuenta.
5. **La factura o boleta va en un desplegable** (tipo, proveedor de la lista, serie y número). Un proveedor nuevo o un pago a crédito siguen
   en el formulario completo, al que la hoja lleva con un enlace.
6. **Bajo el monto, «Lo de siempre»**: los montos más repetidos de ESE concepto en la sede (hasta 3). Siguen a lo elegido (ADR-0290).

La regla es la de Finanzas: la hoja arma un `BorradorGasto` y lo valida `validarGasto` antes de llamar a `registrar_gasto`; la prueba
`lib/gasto-rapido-reglas.test.ts` exige que la guía de foco y `validarGasto` digan lo mismo en 15 escenarios.

## Cómo se reconoce el concepto sin columna nueva

El gasto rápido guarda la descripción empezando por el nombre del concepto («Baño — del mercado»). Para contar, `conceptoDeGasto` mira el
comienzo de la descripción y, si no calza, la palabra que aparece antes («mototaxi al banco» es Movilidad, «Recibo Hidrandina» es Luz),
siempre dentro de la MISMA categoría contable («Agua de mesa» en Suministros no es el recibo del agua). Así cuentan también los gastos
anteriores a esta pantalla.

**Descarté** agregar `gastos.concepto`: era cambiar el esquema de una tabla en uso en producción y la firma de `registrar_gasto` (una RPC
de dinero) para ganar exactitud en un orden de botones. Si un día el orden se equivoca de forma que importe, esa columna es el siguiente
paso.

## Lo que se vigila

- `lib/gasto-rapido-reglas.test.ts`: cada concepto va a una categoría que existe; lo que guarda la pantalla se vuelve a reconocer; el orden,
  la ★ y los montos habituales; la coma del monto es decimal («0,80» no son S/ 80); y la guía igual a `validarGasto`.
- `lib/guia-de-foco-pantallas.ts`: el modal está `aplicada`.
- El movimiento es una excepción de ADR-0136 (actualización 2026-10-09).
