# ADR-0385 — No se cambia por una prenda sin precio

- **Fecha:** 2026-10-12 · **Estado:** construido, verificado en local y **SQL EN PRODUCCIÓN desde el 2026-10-12** (una sola parte:
  `20261012201000_cambio_sin_precio.sql`, pegada con el OK puntual de Felipe tras un ensayo que se deshizo; la huella de `registrar_cambio` en
  producción, `8fed9514…`, es idéntica a la de la base local donde corrieron las pruebas). La web llega al fusionar el PR #988.
- **Pedido:** al cerrar el ADR-0384 (el precio 0 solo vale en Empaque, también en la base) apareció el mismo hueco en Cambios, con dinero de por
  medio. Felipe: «Haz esta tarea aquí: Frenar el cambio por una prenda a S/ 0».
- **Número reservado** con `reserva/adr-0385` (y la versión de la migración con `reserva/migracion-20261012201000`), por el mecanismo del ADR-0381.

## El problema

`registrar_cambio` calcula la diferencia con el precio de la prenda NUEVA (`fn_precio_para_cambio`) y no miraba si era 0. Cambiar una blusa de
S/ 79.90 por una prenda en S/ 0 daba una diferencia de −79.90 que se le devolvía al cliente: **se llevaba la prenda gratis y su dinero de vuelta**,
sin pasar por Devoluciones (ni su plazo, ni su aprobación, ni su nota de crédito). Reproducido en local antes del arreglo: el cambio se registraba
y movía el stock.

Una prenda en S/ 0 existe a propósito: el conteo la propone así («déjalo en 0 y lo completa el Líder») y queda pendiente hasta que alguien le pone
precio. El ADR-0384 cerró venderla, aprobarla, crearla o dejarla así; Cambios era la puerta que quedaba.

## Decisión

1. **La base** (`registrar_cambio`, reemplazo anclado): si el precio de cambio es 0 o menos, `cambio_sin_precio`, antes de escribir nada; el
   `detail` nombra la prenda («referencia (código)»). Se mira el precio de CAMBIO: la misma prenda vale lo de la tienda donde se compró, otra prenda
   el de esta tienda; una prenda con precio base 0 y precio propio en la tienda se cambia al de la tienda.
2. **Sin excepción de Empaque**, a diferencia de la venta: en una venta la bolsa de obsequio va JUNTO a una compra; en un cambio, una prenda va por
   otra, y cambiar una blusa por la bolsa de obsequio sería una devolución completa por la puerta de atrás. Por eso la regla de Cambios es
   «precio mayor que 0», sin preguntar `fn_categoria_admite_precio_cero` (y sin depender del PR #982).
3. **La pantalla lo adelanta** en `validarCambio` (`lib/cambios-reglas.ts`), que ya alimenta el panel «Lo que revisa el sistema», el botón y a dónde
   va el foco: «X no tiene precio · Elige otra prenda, o pide que le pongan precio en su ficha». El `precio` de la prenda nueva es **obligatorio** en
   `validarCambio`, como `apartadoAqui`: olvidarlo no compila. Va antes que el stock: sin precio, que haya o no da igual.
4. **Las dos frases de tienda** en `lib/error-escritura.ts`: `cambio_sin_precio` (por si llega igual) y el candado
   `separacion_items_precio_unitario_check` de Apartados, que ya impedía apartar una prenda en S/ 0 pero llegaba con el nombre crudo.

**Convivencia con los PR abiertos:** #968 (y #978, que lo trae) cambia en `registrar_cambio` la línea de la diferencia y toca `CambiosFlujo.tsx` y
`registrar_cambio.mjs`. Este ancla es el «no existe» de la variante nueva (está en `main` y en producción, que ya tiene el #968), la línea de
`CambiosFlujo.tsx` que cambia no está en sus trozos, y la prueba vive en su propio archivo. Se pueden fusionar en cualquier orden.

## Lo que se descartó

- **Dejar pasar la bolsa de obsequio en un cambio** (la misma regla que la venta): abría la devolución completa por Cambios.
- **Frenar solo en la pantalla:** es lo que faltaba en la base y por eso existía el hueco.
- **Esconder del combo «¿Qué se lleva?» las prendas en 0:** la persona no entendería por qué no aparece. Se ven («desde S/ 0.00») y la revisión
  dice por qué no se pueden entregar.

## Se rompe si…

- Otra pantalla o un canal llama a `registrar_cambio` saltándose `validarCambio`: la base igual lo rechaza, con la frase traducida.
- Alguien redefine `registrar_cambio` copiando un cuerpo anterior a esta migración: el candado desaparece. Lo vigila `pnpm pruebas:cambio-sin-precio`.

## Verificación

- **Base local** (ROLLBACK): `pnpm pruebas:cambio-sin-precio` 6/6 (antes del arreglo, los casos 2 y 3 fallaban: el cambio en S/ 0 se registraba).
  Las otras 18 suites que llaman a `registrar_cambio` en verde, salvo las dos que ya fallaban en local por datos (motivos de caja, un patrón).
- **Web:** `tsc` limpio; vitest 439 archivos, 157 626 pruebas (casos nuevos en `cambios-reglas` y `error-escritura`).
- **Navegador local** (foto de la base antes, restaurada idéntica después): una venta de hoy en Trujillo cambiada por una Casaca en S/ 0 → «Beige ·
  Talla M no tiene precio» en la revisión y en el pie, «Revisar el cambio» no avanza y el foco va a la talla; igual a 375 px, sin scroll horizontal.

## Pendiente

- ~~Pegar la migración en producción~~ **hecho el 2026-10-12** (ensayo revertido, huella esperada `8fed9514…` calculada en producción e igual a
  la local, verificada después: el candado una vez, conserva el cambio del #968, permisos iguales).
- Proformas (`crear_proforma`) no se revisaron con una prenda en S/ 0.
