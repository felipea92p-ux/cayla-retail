# 2026-10-31 — Se cerró el pegado de celdas en todos los lectores de cifras, y se le puso candado

**QUÉ HICE.** Hoy más temprano se arregló que pegar varias celdas de una hoja de cálculo en un campo de cantidad o
de plata inventara un número (tres celdas con 12, 8 y 5 entraban como 1 285). Ese arreglo alcanzó a tres lectores;
quedaban nueve más con el mismo agujero, y Felipe pidió cerrarlos todos. Están cerrados —y al cerrarlos
aparecieron **tres que nadie había contado**, así que son **doce**—. Además, ahora hay un candado en el CI que
impide que nazca el décimo tercero.

**POR QUÉ ASÍ.** Lo importante no fue repetir doce veces el mismo arreglo, sino **borrar** en vez de agregar. Cinco
de los doce colgaban de UNA sola función, `leerNumero` (`orden-compra-alta.ts`), que usan las órdenes de compra,
las de insumos, la factura del proveedor, recibir mercadería y el envío de una orden: se arregló ahí, en la raíz, y
después se les QUITÓ a tres llamadores el borrado de blancos que hacían por su cuenta —que era justamente lo que
dejaba ciega la regla—. Lo mismo en el saldo de arranque del Balance, cuyo comentario ya decía «con la regla única
de `leerMontoPlata`» mientras la anulaba una línea antes.

Y el candado es la parte que de verdad cambia el futuro. Lo de hoy no fue mala suerte: fue que la regla vivía en un
lugar y nada impedía que el siguiente lector la ignorara. Ahora una prueba recorre `lib/` y `components/` y falla si
alguien vuelve a borrar todos los blancos de un texto; lo legítimo (un teléfono, un RUC, un código de barras, el XML
de SUNAT) lo dice en su línea con `// blanco-fijo: <motivo>`. Es el mismo molde que ya usa el repo para las comas de
Finanzas.

**QUÉ SE ROMPERÍA SIN ESTO.** Plata y stock inventados en los sitios donde más caro sale y nadie mira: la **factura
de un proveedor**, el **saldo de arranque de todo el Balance**, el **costo al recibir mercadería**, el **monto de un
pago corregido**, el tope de inversión de una campaña. Ninguno de esos números deja rastro de que estuvo mal: cuadra
con su libro, cuadra con su total, y las invariantes de la base pasan en verde. Se descubre meses después, contando.

---

## Los doce, y cómo se cerró cada uno

Los nueve que Felipe aprobó:

| Lector | Qué decide | Cómo se cerró |
|---|---|---|
| `orden-compra-alta.ts:78` `leerNumero` | **la raíz de cinco**: órdenes de compra y de insumos, factura del proveedor, recepción, envío | usa `sinBlancosDeMiles`; el «S/» y el menos se miran antes |
| `recepcion-envio-reglas.ts:820` `leerCosto` | el costo al recibir mercadería | se le quitó el borrado que anulaba la regla |
| `recepcion-envio-reglas.ts:1526` `leerPrecioVenta` | el precio de venta al recibir | igual |
| `envio-orden-reglas.ts:90` `leerCantidad` | cuántas prendas se envían | igual |
| `balance-reglas.ts:468` `leerMontoArranque` | el saldo de arranque del Balance | solo normaliza el menos tipográfico; los blancos los decide `leerMontoPlata` |
| `plan-compra-reglas.ts:398` `leerNumeroDeMonto` | tope, precio y costo del plan | usa `sinBlancosDeMiles` |
| `plan-compra-reglas.ts:409` `leerDescuento` | el descuento de una campaña | igual, **y** su campo (`soloDescuento`) dejó de borrar los blancos antes de que el lector los vea |
| `precio-sede-reglas.ts:98` `leerMonto` | el precio por sede | usa `sinBlancosDeMiles` |
| `rendimiento-meta-reglas.ts:409` `leerSoles` | la meta de una persona | los blancos se miran ANTES del borrado ancho |

Los tres que apareció el candado, y que nadie había contado:

| Lector | Qué decide |
|---|---|
| `corregir-pago-reglas.ts:56` `leerMonto` | **el monto de un pago corregido**, en céntimos |
| `configuracion-reglas.ts:23` `parsearPorcentaje` | cuánto sube la meta |
| `configuracion-reglas.ts:293` | el porcentaje del aviso de gasto |

## Cómo se verificó

1. **La prueba de regresión primero, y falló:** `lib/pegado-de-celdas.test.ts` con los doce lectores · **23 pruebas
   en rojo**, todas del pegado. Ninguna de las 34 del separador de miles falló: «1 200» ya funcionaba en todos, y el
   arreglo no debía tocarlo.
2. **Después el arreglo**, y las 64 en verde.
3. **En el navegador**, con la pila privada y login real de líder, sobre «Saldos de arranque» del Balance (el caso
   que destapó la revisión):

| En el campo «Capital» | Antes | Ahora |
|---|---|---|
| pegar «12 ⏎ 8 ⏎ 5» (espacios ordinarios, medido) | se aceptaba: S/ 1,285.00 | `aria-invalid="true"`, el campo en rojo |
| pegar «12 ⇥ 8 ⇥ 5» (tabulación) | se aceptaba | `aria-invalid="true"` |
| escribir «1 200» | 1 200 | 1 200, sin marca |
| escribir «−300» (menos tipográfico) | −300 | −300, sin marca |

**165 052 pruebas** en verde (763 archivos), `typecheck`, `knip`, `knip:produccion` y `lint` limpios. La base se
restauró a su foto («idéntica, 304 tablas»).

**Lo que NO se verificó en pantalla, y se dice:** el campo de descuento del plan de campaña (`soloDescuento`). Su
modal pide un recorrido que no logré abrir desde el navegador; el cambio es de una línea y deja ese filtro igual que
`soloMonto`, dos líneas más arriba del mismo archivo, pero **no lo vi funcionando**.

## Y de paso, «S/.» quiere decir lo mismo en todas partes (Felipe: «sí, unifícalo»)

**«S/.» es la abreviatura de toda la vida del sol: «S/. 25» son veinticinco SOLES.** Varios lectores dejaban el
punto suelto y leían veinticinco **céntimos** —cien veces menos, en silencio— y otros directamente lo rechazaban:
la misma cosa escrita igual daba **tres respuestas distintas** según en qué pantalla se escribiera.

No era una decisión nueva: `/chaos` ya lo había encontrado el **2026-10-28** en el alta de productos («S/. 59» →
0.59) y allá se arregló (`tabla-alta-reglas.ts`). Lo que faltaba era llevarlo al resto.

| Lector | Antes de hoy | Ahora |
|---|---|---|
| `leerNumero` (órdenes, factura del proveedor, recepción, envío) | **0.25** | 25 |
| `leerCosto` / `leerPrecioVenta` (recibir mercadería) | **S/ 0.25** | S/ 25.00 |
| `leerCantidadInsumo` / `leerPrecioInsumo` | **0.25** | 25 |
| `leerMonto` (precio por sede) | rechazado | 25 |
| `leerMonto` (corregir un pago) | rechazado | S/ 25.00 |
| `leerMontoPlata` y `leerCostoUnitario` | 25 (ya estaban bien) | 25 |

Lo vigila un bloque nuevo de `lib/pegado-de-celdas.test.ts`: para cada lector, «S/. 25» y «S/.25» tienen que valer
exactamente lo mismo que «S/ 25». Los que no llevan símbolo de moneda (la meta, el porcentaje, el descuento) quedan
fuera por su naturaleza, no por olvido.
