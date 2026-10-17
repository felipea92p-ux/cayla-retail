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

## Actualización 2026-10-15 (b): todos los campos de plata y el arqueo de Caja

Felipe: «haz esta tarea aquí» (los demás campos de plata) y, preguntado por Caja, **«Caja entra»**: se deja la decisión del 2026-10-14 (Caja con su
propio lector) porque el del arqueo leía «1299,50» como 129 950.

- **Una sola regla para leer plata escrita.** `leerMonto` de Caja (`caja-cierre-reglas.ts`: abrir caja, arqueo y traslado del cierre) ahora
  es `leerMontoPlata`. Cambia una cosa a la vista: «10.005» (céntimos de más) ya no se redondea a 10.01, se pide de nuevo, como en el resto.
- **Los 11 campos de plata que eran `type="number"` propios** pasan a texto con teclado decimal (`atributosMontoTexto`, en `CampoMonto.tsx`) y se
  leen con `numeroDeMonto` donde decía `Number(…)`: vacío es 0 como antes y lo que no se entiende es `NaN`, que ningún `> 0` deja pasar.
  Son: los pagos de la venta (`LineasPago`), «Otro monto recibido» del cobro (`HojaDeCobro`, con su borrador de texto para no perder la coma
  a mitad de escribir), el descuento en soles del ticket (`PuntoDeVentaTicket` y `PuntoDeVenta`), el monto a devolver (`DevolucionesPendientes`),
  el ingreso o egreso de Caja (`MovimientoCajaModal`), el costo en Llegó mercadería (`fijarCosto` ya no convierte en cada tecla), el costo de
  un extra en Recibir envío, el costo en Compras (`requisitosDeCompra` frena un costo ilegible: «La línea N tiene un costo que no se
  entiende»), el precio de maquila, y el precio y costo de la ficha, de Agregar colores o tallas y del cambio en bloque
  (`variantes-ficha-reglas.ts`).
- Un costo ilegible en Llegó mercadería y en Recibir envío no viaja: el aviso dice cómo escribirlo y el cursor va al campo.
- Quedan con `type="number"` solo cantidades, porcentajes (descuento %, IGV %), días y copias: no son plata.

## Lo que queda (no entra aquí)

- **Porcentajes con coma** («12,5 %» en el descuento o el IGV) siguen siendo `type="number"`: no son plata, pero tienen el mismo problema.
- **Los demás lectores de montos de `lib/`** (`leerMonto` de Precio por sede, del filtro de precio y de corregir el pago; `parsearMonto` de Gastos y
  de Configuración; `parseMontoNota`; `leerNumero` de Compras) leen texto que ya acepta la coma, cada uno a su manera: unificarlos es otro paso.

## Actualización 2026-10-16 (auditoría de Finanzas, G07)

La actualización (b) afirmaba que los lectores de Finanzas «ya aceptan la coma»: no era cierto para `parsearMonto` (gastos y configuración),
`leerMontoArranque` y `parseMonto` de Por pagar, que borraban las comas o leían «1,299» como 1.30. Desde ADR-0433, actividad 2, los cuatro (y el saldo
del banco de Cuentas y dinero) leen con `leerMontoPlata`; `lib/monto-lectores.test.ts` lo vigila.
