# ADR-0419 · El campo de plata entiende la coma decimal y nunca adivina

- **Fecha:** 2026-10-15 · **Estado:** construido y verificado (prueba de la regla, vitest completo, el campo real en Chrome en inglés, en
  español de Perú y a 375 px). Solo web, sin migración. Rama `claude/monto-coma-decimal`.
- **Decisión de Felipe (2026-10-15):** «arregla lo de la coma decimal», tras el /chaos del detalle de Apartados.
- **Extiende:** la regla de las hojas del fondo (`leerMontoPlata`, ADR-0362 fase 6, decisión del 2026-10-14) a `CampoMonto`.

## El problema

`CampoMonto` (`components/ui/CampoMonto.tsx`) es el campo de plata de 20 pantallas (29 usos): el cobro de Vender, abonar y entregar un
apartado, Producción, Compras, Liquidación, el Plan de campaña… Era un `<input type="number">`, y el navegador **borra la coma sin avisar**:
«2,5» llegaba como 25. Probado en el /chaos de Apartados (2026-10-15): un abono escrito «2,5» se guardó como **S/ 25.00**, en Chrome en
inglés y en español de Perú. El botón decía «Registrar abono · S/25.00», pero nada más lo delataba.

## La decisión

`CampoMonto` pasa a ser un campo de **texto con teclado decimal** que lee con `leerMontoPlata`, la misma regla que Felipe eligió para las
hojas del fondo (una sola regla de plata, no una novena):

| Escrito | Se entiende |
|---|---|
| `2,5` · `12,50` | 2.50 · 12.50 |
| `1.299,50` · `1,299.50` | 1299.50 |
| `1,299` | 1299 (como se ve en pantalla, S/ 1,299.00) |
| `100.` (mientras se escribe) | 100 |
| `12.500` · `abc` · `1e3` | **no se adivina**: el campo queda en rojo con «No se entiende el monto: escríbelo así, 1299.50 o 1299,50.» y el formulario recibe 0, así que ningún botón guarda |

Al salir del campo se ve el número entendido («2,5» pasa a «2.5»): la persona ve lo que el sistema leyó antes de guardar. La regla y su
prueba: `lecturaCampoMonto` en `lib/monto-plata-reglas.ts`.

## Lo que se descartó

- **Dejar el `type="number"` y avisar.** El navegador ya borró la coma antes de que el código lo vea: no hay qué avisar.
- **Leer la coma siempre como decimal.** «1,299» se ve así en la pantalla del ERP (miles): leerlo como 1.299 daría S/ 1.30.
- **Redondear «12.345» a 12.35.** Un monto con céntimos de más es un error de tipeo; adivinarlo es justo lo que se quiere evitar.

## Se rompe si

- Alguien escribe «12.500» queriendo decir doce mil quinientos: el campo lo marca y no deja seguir hasta escribirlo como «12500» o
  «12,500». Es a propósito.

## Lo que queda (no entra aquí)

- **25 archivos con `<input type="number">` propios**, que no pasan por `CampoMonto`. Varios son plata: `LineasPago` (los pagos de la
  venta), `MovimientoCajaModal`, `HojaDeCobro` (el «Recibido»), `DevolucionesFlujo`, `CambioReemplazo`, `NuevaProformaModal`, `CompraFormV2`,
  `ProductoForm` (el precio); otros son cantidades. Cada uno es su propia pantalla.
- **Ocho lectores de montos distintos** en `lib/` (`leerMonto` de Caja, de Precio por sede, del filtro de precio y de corregir el pago;
  `parsearMonto` de Gastos y de Configuración; `parseMontoNota`; `leerNumero` de Compras). El de Caja borra las comas («1299,50» →
  129 950); Felipe dijo el 2026-10-14 que Caja sigue con el suyo hasta que él lo decida.
