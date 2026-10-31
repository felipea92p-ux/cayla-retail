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

## Y los dos filtros de tecleo de Caja (Felipe: «sí, ciérralos»)

El gasto rápido y el ingreso rápido no tienen un «lector» como los doce de arriba: tienen un **filtro de tecleo**
que limpia lo que se escribe y lo devuelve al campo. Por eso se habían dejado fuera: ahí lo pegado **se ve**, y
cerrarlo bien no era repetir una línea sino decidir qué ve la persona al pegar. Felipe dijo que se cerraran, y la
decisión fue: **el campo muestra lo que pegaste, y el aviso de abajo dice que no se entiende.** Es lo que ya hacía
`soloMonto` del plan de compra, y no hizo falta inventar validación: `parsearMonto` usa `leerMontoPlata`, que desde
hoy ya sabe distinguir «1 200» de un pegado. Lo único que hacía falta era **dejar de borrarlo** antes de que el
lector lo viera. El «S/» sí se sigue quitando con su espacio.

Verificado en la caja abierta de la tienda, con login real:

| En «Cuánto» del gasto rápido | Antes | Ahora |
|---|---|---|
| pegar «12 ⏎ 8 ⏎ 5» | el campo decía **1285** y «Cuánto» quedaba hecho: se registraba un gasto de S/ 1 285 | el campo dice **«12 8 5»** y la hoja sigue pidiendo «Faltan: … **Cuánto**» |
| pegar «12 ⇥ 8 ⇥ 5» | **1285** | «12⇥8⇥5», y «Cuánto» sigue faltando |
| escribir «1 200» | 1 200 | 1 200, y «Cuánto» queda hecho |
| escribir «20.50» | 20.50 | 20.50, y «Cuánto» queda hecho |

## Y los campos de días (Felipe: «sí, los días»)

Los dos campos de días —«Días para llegar a las tiendas» del plan y los plazos del reloj del pedido de la tienda
web— borraban todo lo que no fuera dígito, así que pegar tres celdas dejaba **1 285 días** escritos. Mismo arreglo:
dejar de borrar el blanco. Sus validadores (`leerDiasParaLlegar`, `/^\d{1,3}$/`, y `parametroFueraDeRango`,
`/^-?\d+$/`) ya eran estrictos y lo rechazan solos.

Como eran filtros escritos a mano dentro de los componentes, sin prueba, se sacó **uno solo** para los dos:
`soloCifrasEscritas` (en `numero-escrito.ts`, al lado de `sinBlancosDeMiles`), con su prueba y con el caso que
importa: que lo que el filtro deja pasar, los dos validadores lo rechacen. Si alguien los afloja, la prueba avisa.

## Y los tres últimos, Vender incluido (Felipe: «sí, los tres»)

Los tres filtros que quedaban daban **1285** con las mismas tres celdas. Aquí hubo que pensar distinto que en Caja:
dos son filtros de un **precio**, donde «1 200» sí es un separador de miles de verdad y el modal de Vender hace
`Number(precio)`. Si solo se conservaba el blanco, «1 200» también se habría roto. Así que el filtro **junta los
miles con la regla única y deja a la vista únicamente lo que esa regla no entiende**: el pegado queda escrito,
`Number` da `NaN`, y `pasoSiguiente` —que ya bloqueaba con un precio falsy— vuelve a pedir el precio.

| Filtro | Dónde | Cómo se cerró |
|---|---|---|
| `precioEscribible` | «Precio cobrado» de **Vender** | junta los miles, deja ver el pegado; el `.trim()` quita solo el blanco que deja el «S/» |
| `limpiarPrecio` | el precio del **alta de productos** | igual |
| `soloDigitos` | «Flojo/Normal/Bueno, prendas», «Lo que sobre %» y la curva de tallas | `soloCifrasEscritas`: son enteros, y `entero()` (`/^\d+$/`) los rechaza solo |

**Verificado en Vender a 375 px (PL-105)**, con login real y una prenda ya elegida (Abrigos · S · Blanco), de modo
que el precio fuera lo único que faltaba:

| En «Precio cobrado» | El campo | «Falta: Precio» | «Agregar al ticket» |
|---|---|---|---|
| pegar «12 ⏎ 8 ⏎ 5» | **«12 8 5»** | sí | **apagado** |
| pegar «12 ⇥ 8 ⇥ 5» | «12⇥8⇥5» | sí | **apagado** |
| escribir «1 200» | **«1200»** (se juntó) | no | encendido |
| escribir «59,90» | «59.90» | no | encendido |

Antes, «12 8 5» quedaba en **1285** y se cobraban S/ 1 285 por una prenda de S/ 59. Captura a 375 px con el campo
en «12 8 5» y «Falta: ● Precio» debajo.

**Dos pruebas existentes se pusieron en rojo al hacerlo** y estaban en lo cierto: `precioEscribible("S/ 39")` y
`limpiarPrecio("S/ 45.50")` devolvían el blanco que dejaba el símbolo. Se resolvió con un `.trim()` al final, que
toca los extremos y no los de adentro —que son justamente la huella del pegado—.

**Y una cosa que el candado NO cubre, dicha para que nadie se confíe:** persigue el borrado explícito
(`replace(/\s+/g, "")`), no el implícito de una clase negada (`replace(/[^\d]/g, "")`), que borra los blancos sin
nombrarlos. Cubrirlo daría 21 falsos positivos —identificadores de SVG, extensiones de archivo, nombres
compactados para comparar— y una lista de exentos que nadie leería. Esos tres se encontraron a mano, mirando uno
por uno los 24 sitios con ese patrón.

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
