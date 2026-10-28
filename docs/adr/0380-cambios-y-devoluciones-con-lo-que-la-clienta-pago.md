# ADR-0380 — Cambios y devoluciones se calculan con lo que la clienta pagó, no con el precio de lista

- **Fecha:** 2026-10-12 · **Estado:** construido y probado en una copia de la base local; **SQL EN PRODUCCIÓN desde 2026-10-12** (con OK de Felipe); la web nueva se publicó el mismo día al fusionar el PR #968.
- **Número:** nació como ADR-0378; se renumeró a 0380 al actualizar el PR, porque `main` ya tenía su propio 0378 (`0378-lucode-ya-tiene-el-numero.md`) y su 0379.
- **Pedido:** el hallazgo #1 («Crítica · Hoy · Ventas») del análisis de Ventas: «Cambios y devoluciones: calcular con lo que la clienta pagó, no con el precio de lista».
  Decidido con Felipe el 2026-10-12: la prenda nueva se compara a precio de lista («cambiarla por una de S/ 100 debe mostrar S/ 20 a cobrar»).

## El problema

`venta_items` guarda `precio_unitario` (el de lista) y `descuento_unitario` (campaña, club, lo que fuera); lo que la clienta pagó es la resta. Tres funciones seguían
contando con la lista:

| Función | Qué hacía mal | Ejemplo (polera S/ 100, campaña 20 %, pagó S/ 80) |
|---|---|---|
| `aprobar_devolucion` | El **tope del reembolso** ya usaba lo pagado, pero la **nota de crédito** salía por la lista | Reembolso S/ 80, nota de crédito por S/ 100: un papel más grande que la boleta |
| `registrar_cambio` | Diferencia = precio nuevo − precio de lista de lo devuelto | Por otra de S/ 100: «diferencia 0», la tienda regala S/ 20; por una de S/ 40: devuelve S/ 60 por una compra de S/ 80 |
| `emitir_nota` | Nada impedía que las notas de un comprobante sumaran más que el comprobante | — |

El arqueo cuadraba igual (el cajón recibe o entrega lo que la pantalla dijo), así que nadie lo veía: no es una caída, es un descuadre silencioso entre lo que se cobró y lo que se acredita.

## Decisión

DECIDÍ: medir todo contra **lo pagado por unidad = `precio_unitario − descuento_unitario`** (la misma cuenta que ya hacía el tope de reembolso y `valorPagado` de la web), en las tres capas a la vez:
1. `aprobar_devolucion`: `v_total_devuelto` suma lo pagado; la nota (total, IGV, subtotal) sale por eso.
2. `registrar_cambio`: `diferencia = (precio de la prenda nueva − lo pagado por la devuelta) × cantidad`. La prenda nueva sigue al precio que da `fn_precio_para_cambio` (ADR-0370: el de la tienda
   donde se compró si es la misma prenda; el de esta tienda si es otra), **a precio de lista, sin campaña**.
3. `emitir_nota`: una nota de crédito se rechaza si la suma de las notas vivas del comprobante (no `rechazado` ni `anulado`) pasaría de `total + anticipo_deducido` del original,
   con el comprobante original bloqueado mientras se cuenta.
4. Web: `derivarReemplazo` (`lib/cambio-reemplazo-reglas.ts`) calcula la misma diferencia reutilizando `valorPagado`; la ficha de la prenda devuelta muestra lo que pagó y, si hubo descuento,
   «Pagó con S/ 20.00 de descuento (lista S/ 100.00)»; la cifra «valor del mes» de Cambios (`cambios-estadisticas.ts`) también cuenta lo pagado.

DESCARTÉ: **comparar la prenda nueva con la campaña (el mismo 20 %)** porque abre un hueco: comprar en campaña y cambiar por la prenda más cara, o por una sin campaña, sin que la tienda cobre la diferencia real.
DESCARTÉ también **«la misma prenda conserva su pago; otra prenda va a lista»** (la opción que se recomendó) porque Felipe pidió la regla de una línea: la prenda nueva a lista contra lo pagado.
**Consecuencia que se aceptó:** cambiar la talla de una prenda comprada con descuento cobra el descuento (S/ 20 en el ejemplo). Si en tienda resulta molesto, el cambio es de una línea
en `registrar_cambio` y en `derivarReemplazo` (para la MISMA prenda, restar el mismo `descuento_unitario` al precio nuevo); no se tocó ningún dato.
DESCARTÉ **reescribir las notas y los cambios ya emitidos** (son comprobantes y movimientos de caja reales; corregir uno es una nota nueva, decisión de Felipe). Y **un tope «el efectivo devuelto no pasa de lo pagado»
en `registrar_cambio`**: con la nueva fórmula es imposible de violar (el reembolso es `pagado − precio nuevo ≤ pagado` mientras el precio nuevo no sea negativo), sería código muerto.

SE ROMPE SI: (a) el precio de la prenda nueva en una tienda cae por debajo de lo que la clienta pagó con campaña muy agresiva en otra tienda: se le devuelve la diferencia, correcta pero visible;
(b) **un apartado entregado**: el comprobante final lleva solo el saldo y el adelanto vive en otra boleta; por eso el techo de `emitir_nota` es `total + anticipo_deducido` (sin sumar el anticipo, devolver
toda la prenda de un apartado se bloquearía); si algún día el anticipo se documenta distinto, el techo se revisa; (c) una venta con descuento a nivel de TICKET que no se reparta en las líneas
(`descuento_unitario`): hoy `registrar_venta` cobra la suma de las líneas, así que no existe, pero si naciera un descuento solo del total, «lo pagado» por línea dejaría de ser exacto.

## Dos suites tenían el error que esta migración corrige

Al correr las pruebas existentes contra la copia con la migración, dos fixtures acreditaban más que lo cobrado o ignoraban el descuento de la línea que elegían:
`notas_credito_serie_por_letra.mjs` emitía dos notas sobre una boleta de S/ 100 por 100 + 10 (ahora 90 + 10), y `concurrencia_linea_de_venta.mjs` cambiaba «la última venta de la base» sin método
de pago (esa venta traía S/ 10 de descuento; ahora pasa `tarjeta`, porque la suite mide el candado de la línea, no el precio). Es la señal de que el tope hace lo que debe.

## Verificación

- Copia aislada de la base local (`pg_dump` → base nueva, con las migraciones de `main`): `pnpm pruebas:registrar-cambio` 25/25 y `pnpm pruebas:aprobar-devolucion-caja` 8/8; los casos nuevos **fallan** contra la función vieja
  (4/4 y 2/2), así que sí prueban el cambio. Pegada dos veces: idempotente. Regresión: notas de crédito 42/42, series 17/17, arreglos en vivo 47/47, candado de dinero 20/20, carné/pasaporte 20/20, separaciones 80/80, concurrencia 4/4.
- Un hallazgo del propio ensayo: el chequeo de «ya aplicado» del reemplazo anclado de `aprobar_devolucion` daba la corrección por hecha (el texto nuevo ya existía en la línea del tope de reembolso) y no cambiaba nada; el ancla lleva ahora `into v_total_devuelto`.
- `vitest`: 424 archivos, 157.372 pruebas (8 casos nuevos en `cambio-reemplazo-reglas.test.ts`).

## Producción

**Aplicada el 2026-10-12** con `apply_migration` (el archivo se llamó `20261012120000` y se renombró a `20261012120100` porque el PR #964 (Plan de campaña) tomó ese mismo timestamp; Supabase la registró como `20261012143814`, sin relación con el nombre del archivo) (historial de Supabase `cambios_y_devoluciones_con_lo_que_pago`), tras comprobar en solo lectura que cada función tenía una sola firma y el texto a reemplazar una sola vez. Verificado después: `md5(prosrc)` de las tres funciones igual al calculado de antemano (`aprobar_devolucion` 94dfe580…, `registrar_cambio` 36b15583…, `emitir_nota` 196885b8…), permisos sin cambios. **Ventana hasta publicar la web:** una línea con descuento mostrará «Sin diferencia» en Cambios mientras la base pide S/ 20 y responderá «Hay una diferencia de S/ 20 — indica cómo se cobra»: un error claro, sin guardar nada; las devoluciones ya salen bien. Esa ventana se cerró al fusionar el PR #968 (2026-10-12). La regla era pegar el SQL junto con la web, y aquí se pegó antes: quien repita este patrón, que fusione primero o pegue en el mismo momento.

Una sola parte (solo `create or replace` de tres funciones, sin tablas ni políticas).

**Notas ya emitidas con el precio de lista:** ninguna. Una consulta de solo lectura del 2026-10-12 encontró **0 notas de crédito** en producción, así que no hay papel viejo que corregir.

## Lo que este ADR no arregla: la nota de una devolución PARCIAL lleva todas las líneas

`aprobar_devolucion` llama a `emitir_nota` sin `p_items`, y `emitir_nota` copia los ítems del comprobante original (`coalesce(p_items, v_original.items)`). Desde este ADR el **total** de la nota es lo pagado por lo devuelto, pero en una devolución parcial (motivo «07») los **ítems** siguen siendo todas las líneas de la boleta, y eso es lo que `itemsParaLucode` manda a SUNAT. Ejemplo: boleta con una polera de S/ 80 y una blusa de S/ 60; se devuelve la polera → nota por S/ 80 que declara las dos prendas (S/ 140). Se vio en el código el 2026-10-12, sin probarlo contra Lucode. Está latente: en producción hay 0 devoluciones en 30 días. Arreglo propuesto: que `aprobar_devolucion` pase `p_items` armados con lo devuelto. Es SUNAT, así que espera el OK de Felipe (backlog de este ADR).

**Actualización 2026-10-12:** construido en el ADR-0382 (`20261012200000`): la nota lleva solo lo devuelto. Sin pegar en producción.
