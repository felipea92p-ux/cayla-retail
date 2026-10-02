# ADR-0310 — Redondeo del efectivo: S/ 0.10, solo hacia abajo, y el redondeo es una fila visible

**Fecha:** 2026-10-02 · **Estado:** **EN CONSTRUCCIÓN** (actividad 1 de 8, §6); nada pegado en producción · **Decide:** Felipe
(aprobó el diseño y la lista de actividades el 2026-10-02: «hazlo») · **Rama:** `claude/sales-rounding-cash-36d9cd` ·
**Investigación y fuentes:** `docs/investigacion/2026-10-02-redondeo-del-efectivo.md`

## 1. El problema, primero

Una integrante de AQP pidió que las ventas no queden con céntimos que no se pueden pagar con monedas. La captura de Caja del
1-oct decía «Efectivo en el cajón ahora S/ 603.44»: apertura 118.90 + ventas en efectivo 484.54 (37.90 + 62.15 + 74.90 +
309.59). Esa cifra no existe físicamente, y el cierre de esa caja «cuadró» con diferencia 0.00 porque se tecleó la cifra del
sistema. Los céntimos sueltos nacieron con ADR-0302 (descuento de campaña exacto, 1-oct): antes del 1-oct 19 de 19 totales
de ticket eran múltiplos de 0.10; desde entonces 5 de 25 no lo son.

## 2. La regla (Perú)

La moneda más chica que circula es **S/ 0.10** (el BCRP retiró la de 0.05 el 1-ene-2019, Circular 0033-2018). La Ley 29571
art. 44 prohíbe redondear en perjuicio del consumidor, y INDECOPI lo aplica **siempre hacia abajo** (5.99 → 5.90, 2.69 → 2.60;
subir solo con aceptación expresa y para una donación). El redondeo vale **solo para el efectivo**, **una vez** y sobre la
parte de la cuenta que se paga en efectivo. Tarjeta, Yape/Plin y transferencia se cobran exactos.

| Deuda en efectivo | Se cobra | Redondeo |
|---|---|---|
| 100.02 | 100.00 | 0.02 |
| 100.12 | 100.10 (no existe la moneda de 2 céntimos) | 0.02 |
| 100.19 | 100.10 (**no** 100.20: subir es redondear en perjuicio) | 0.09 |

Es lectura de textos oficiales (no hay norma con la fórmula numérica; la fijan los ejemplos de INDECOPI): conviene que un
abogado la confirme. Costo para CAYLA: ≈ S/ 10 a 31 por cada 1 000 pagos en efectivo, varias veces menos que lo que regalaba
la regla del .90 de ADR-0182.

## 3. Decisión

```
DECIDÍ:    el efectivo se guarda ya redondeado (monto múltiplo de 0.10) y UNA fila extra en venta_pagos con metodo='redondeo'
           guarda la diferencia (0.01 a 0.09; siempre positiva, porque la ley solo permite bajar). La suma de todas las
           filas sigue igualando la suma de ítems. El comprobante SUNAT sale por la suma exacta de ítems, como hoy. El
           estado de pantalla `pagos` se queda exacto (lo que cubre el total) y el redondeo se calcula en el borde con una
           función pura: `redondeoDelEfectivo` en la caja y `retail.fn_redondeo_efectivo` en la base. La base calcula y
           exige el redondeo exacto de la ley; no confía en el navegador.
DESCARTÉ:  (a) una columna venta_pagos.redondeo con el monto exacto: el efectivo físico pasaría a ser monto + redondeo y los
           18 lectores del efectivo (esperado de caja, flujo, vuelto, el CHECK de recibido…) tendrían que aprender a sumar dos
           cosas; el que se olvide deja el cierre corrido en céntimos sin avisar, parecido a un faltante diario. En la fila
           'redondeo', lo que se olvida falla a la vista (un renglón «Redondeo» o un chip «Otro»), y el efectivo físico es
           exactamente el monto de la fila efectivo: el esperado, el flujo y el vuelto no se tocan.
           (b) «al más cercano» (Canadá, Australia): sube en las terminaciones 6-9, que es redondear en perjuicio;
           (c) redondear por línea: el error se cuadruplica (hasta 20 céntimos con 4 prendas contra 5 redondeando el total
           una vez) y la suma de las líneas dejaría de ser el total pagable;
           (d) que la base calcule el redondeo sola sin que la venta lo declare: la cola sin conexión debe viajar con lo
           que de verdad se cobró; la base lo VERIFICA contra la regla, no lo reescribe (ADR-0108).
SE ROMPE SI: un reporte nuevo suma todo venta_pagos como dinero recibido sin excluir 'redondeo'; se publica la web antes de
           las migraciones (la RPC rechaza el medio nuevo: por eso la bandera `fn_acepta_redondeo_efectivo`); o alguien rehace
           `venta_pagos_metodo_check` desde una lista vieja y suelta 'qr' o 'anticipo' (casi pasó con 0ed663f1).
```

Los agentes se partieron al decidir: dos prefirieron la fila y el adversario la columna (la ley se fija con un CHECK de una
fila y no se reescribe el CHECK de medios). Se eligió la fila porque el arqueo debe leer un hecho guardado, lo que hay
físicamente, y porque sigue el precedente de `anticipo`. La objeción del adversario se recoge así: el redondeo se deriva en el
borde y nunca entra al estado editable ni a `METODOS_PAGO_VENTA`; la base exige que el redondeo sea exactamente
`fn_redondeo_efectivo` (solución única: para cada monto hay un solo redondeo de 0.00 a 0.09 que deja el efectivo en múltiplo de
0.10); índice único parcial (un redondeo por venta) y CHECK `monto < 0.10`; el CHECK de medios se rehace desde la definición
viva; y una prueba lista toda función que lee `venta_pagos` y exige que cada una esté revisada pensando en `redondeo`.

## 4. Estados imposibles

Redondeo ≥ 0.10 · dos filas de redondeo en una venta · redondeo sin fila de efectivo · efectivo con redondeo que no es múltiplo
de 0.10 · redondeo con `recibido` o `referencia` · fila de efectivo en 0 por redondeo. Los dos primeros y el último los hace
imposibles el esquema (CHECK e índice único parcial); el resto, la única RPC que escribe ventas (ADR-0119), que además lo vigila
una prueba de auditoría en `scripts/pruebas/redondeo_efectivo.mjs`.

## 5. Qué NO cambia

Los precios, los descuentos (ADR-0302 sigue exacto: el redondeo ocurre al pagar, no en el precio), el IGV, el comprobante y el
QR de SUNAT, y lo que se cobra con tarjeta, Yape, Plin o transferencia. Si Lucode o SUNAT no responden, nada cambia: el
comprobante sale exacto y el redondeo vive solo adentro. La cola de ventas sin conexión sigue aceptando el contrato viejo
(efectivo exacto, sin fila de redondeo) para no perder ninguna venta.

## 6. Actividades (cortes verticales; cada una con su commit)

- [x] **1. Regla en la base** `retail.fn_redondeo_efectivo`, verificada en los 99 999 montos de 0.01 a 999.99 (§8). Su gemela en
  TypeScript (`redondeoDelEfectivo`, en céntimos enteros) y la **paridad caja ↔ base** entran en la actividad 5: el repo no admite
  una función de reglas que solo usa su prueba (`lib/reglas-sin-uso.test.ts`) y ninguna pantalla la llama hasta entonces.
- [ ] 2. Los lectores entienden «redondeo»: Caja, Historial, cuenta sellada y el CHECK de medios, con una venta sembrada.
- [ ] 3. Diario y estado de resultados: el redondeo cuadra y se ve, con una cuenta provisional hasta el contador.
- [ ] 4. Papel y reimpresión: el recibo dice el redondeo; la boleta y el QR siguen exactos.
- [ ] 5. Vender cobra en efectivo redondeado de punta a punta (RPC, hoja de cobro, cola sin conexión, bandera).
- [ ] 6. Apartados: el saldo en efectivo al entregar (abonos y adelanto no se redondean).
- [ ] 7. Cambios y devoluciones en efectivo.
- [ ] 8. Condicional: declarar el redondeo en el comprobante SUNAT, solo prueba en el sandbox de Lucode.

**Orden en producción** (lo pega Felipe, nunca esta sesión): partes de las actividades 2 y 3 → publicar la web → `registrar_venta`
(actividad 5) → bandera `fn_acepta_redondeo_efectivo` al final → recargar las tablets.

## 7. Decisiones tomadas con la recomendación (Felipe dijo «hazlo» sin contestar una por una)

Quedan provisionales y se pueden revertir; cada una se anota de nuevo en la actividad que la usa.

- El redondeo es **siempre**, sin interruptor ni «cobrar exacto» si el cliente trae monedas, y **no se construye** la donación
  (subir a los 0.10 siguientes con aceptación expresa): un solo camino, nada que la cajera decida ni explique.
- **Efectivo parcial menor de S/ 0.10** (por ejemplo 0.07 que sobra tras un Yape): el cobro se bloquea con «cóbralo con otro
  medio». Nadie puede entregar 7 céntimos, y regalar el monto de otro medio no es redondeo.
- **Apartados:** solo se redondea el saldo al entregar; los abonos y el adelanto no (no son «el total a pagar»).
- **Cambios y devoluciones**, cuando es CAYLA la que entrega efectivo: se redondea hacia ARRIBA, a favor del cliente (hasta
  S/ 0.09 por devolución), y el tope del reembolso es lo que de verdad se pagó en efectivo. Es criterio legal no verificado
  (ninguna norma peruana lo trata): confirmar con un abogado.
- **Cuenta contable:** provisional, propia y de gasto (no la de faltantes de caja ni la de mermas), hasta el visto bueno del
  contador. **Comprobante exacto** (el céntimo no cobrado es gasto): que el contador lo confirme por escrito.
- **Actividad 8 (SUNAT):** no se hace sin el OK explícito de Felipe y el sandbox de Lucode; mientras tanto el comprobante sale exacto.

## 8. Verificación de la actividad 1 (2026-10-02)

- Postgres desechable con las 410 migraciones del repo y el seed (más la nueva): `pnpm pruebas:redondeo-efectivo` **6/6**:
  27 ejemplos de la ley (INDECOPI y Felipe), y en **los 99 999 montos de 0.01 a 999.99**: redondeo de 0.00 a 0.09, efectivo en
  múltiplo de 0.10, nunca sube, es monótona y el redondeo es el único posible; sin monto/cero/negativo no hay redondeo;
  migración re-ejecutable; función inmutable que `anon` no ejecuta.
- **Control de mutación:** con la base cambiada a «al más cercano» la prueba da **4/6**, y con «siempre hacia arriba» también
  **4/6** (fallan los ejemplos de la ley y los 99 999 montos); con la regla real, 6/6.
- `lib/reglas-sin-uso.test.ts` en verde: no se agregó ninguna regla sin pantalla. Verificadores del repo: `adr:numeros`,
  `migraciones:versiones` y `migraciones:sin-drop-trigger` en verde.

## 9. Lo que queda

Las actividades 2 a 8. Pendientes que salieron de la investigación y no son de esta lista: el cierre de caja se cierra
tecleando la cifra del sistema (desde ADR-0186 el esperado se ve antes de contar); y 77 de 84 líneas vendidas en producción son
«Prenda sin registrar» con precio tecleado a mano (de ahí salen céntimos como 62.15 y 309.59).
