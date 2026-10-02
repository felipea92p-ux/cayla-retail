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
- [x] **2. Los lectores entienden «redondeo»** (dos partes SQL + web, §8): el CHECK de medios y sus candados, `fn_cuenta_sellada`,
  `fn_resumen_caja` y `fn_ventas_del_dia` (Caja y la lista de ventas del día), Historial, y una prueba que obliga a revisar toda
  función que lea `venta_pagos`.
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

## 8. Verificación (2026-10-02)

### Actividad 1 — la regla

- Postgres desechable con las 410 migraciones del repo y el seed (más la nueva): `pnpm pruebas:redondeo-efectivo` **6/6**:
  27 ejemplos de la ley (INDECOPI y Felipe), y en **los 99 999 montos de 0.01 a 999.99**: redondeo de 0.00 a 0.09, efectivo en
  múltiplo de 0.10, nunca sube, es monótona y el redondeo es el único posible; sin monto/cero/negativo no hay redondeo;
  migración re-ejecutable; función inmutable que `anon` no ejecuta.
- **Control de mutación:** con la base cambiada a «al más cercano» la prueba da **4/6**, y con «siempre hacia arriba» también
  **4/6** (fallan los ejemplos de la ley y los 99 999 montos); con la regla real, 6/6.
- `lib/reglas-sin-uso.test.ts` en verde: no se agregó ninguna regla sin pantalla. Verificadores del repo: `adr:numeros`,
  `migraciones:versiones` y `migraciones:sin-drop-trigger` en verde.

### Actividad 2 — los lectores

Una venta de 79.88 (79.90 con 0.02 de descuento) pagada con **79.80 en efectivo y 0.08 de redondeo**, sembrada dentro de una
transacción, sobre un Postgres desechable con las 410 migraciones del repo (más las tres nuevas): `pnpm pruebas:redondeo-efectivo`
**22/22**.

- **Caja:** «Efectivo en el cajón» = 100.00 + 79.80 = **179.80**, una cifra que sí cabe en un cajón; las ventas en otros medios
  son 0 (el redondeo no es «Otro»); el redondeo viaja aparte (0.08) y «Cobrado en el turno» lista solo el efectivo.
  `fn_calcular_esperado_caja` **no se tocó**: la fila de efectivo ya trae lo físico.
- **Lista de ventas del día:** la venta dice «efectivo», no «efectivo + redondeo», y su total sigue siendo 79.88.
- **Historial:** «cómo se pagó» lista efectivo 79.80 y redondeo 0.08, y **suma el total vendido** (79.88) — por eso el redondeo es
  ahí una fila más, a propósito.
- **Cuenta sellada:** la fila de redondeo queda sin cuenta (no es plata); sembrando un banco para «transferencia» se comprueba que
  sin el parche habría caído en él.
- **El esquema rechaza lo que nunca debe existir:** redondeo de 0.10 o más, con `recibido`, con referencia, de 0, dos en una
  venta y un medio que no existe; y acepta los 8 medios (los 7 de antes, incluidos `qr` y `anticipo`, y `redondeo`).
- **Candado de huella:** si alguien cambió `fn_cuenta_sellada` desde que se escribió el parche, la parte 2 aborta en vez de pisarla.
- **Auditoría de lectores:** las 17 funciones que leen `venta_pagos` o `separacion_pagos` están anotadas una por una con lo que
  hacen con el redondeo; una función nueva que lea los pagos pone la prueba en rojo hasta que alguien la revise.
- **Control de mutación:** sin el parche de las tres funciones la prueba da **17/22** (fallan Caja, «cobrado», la lista del día,
  la cuenta sellada y las huellas); con un lector nuevo sin revisar, **21/22**; con los parches, 22/22.
- **Navegador:** las tarjetas reales de Caja con los datos reales de `fn_resumen_caja` (PostgREST local con JWT del líder):
  «Efectivo en el cajón ahora S/ 179.80», «Cobrado en el turno S/ 79.80» y la nota «− S/ 0.08 de redondeo en efectivo: se cobra al
  múltiplo de S/ 0.10, hacia abajo, y no suma a lo cobrado». Sin errores en la consola.
- **Web:** vitest 127 pruebas de las reglas tocadas en verde (`cobradoDelTurno`, `notaDeRedondeo`, `metodosDe`, `mezclaDePagos`);
  `tsc` y eslint en verde. Regresión SQL: `totales-caja-historial` (su reconstrucción «de antes» ganó la clave `redondeo`: el
  contrato cambió a propósito), `caja-cierre-traslado`, `cuenta-sellada` 76, `flujo-caja` 55, `cuentas-dinero` 88,
  `estado-resultados` 73, `balance` 69, `cierre-mes` 104, `separaciones` 78, `aprobar-devolucion-caja` 5, `registrar-cambio` 21 y
  `ventas-del-dia` 11, todas en verde.

**Para pegar en producción** (lo pega Felipe; las dos partes SOLAS y en este orden, antes de publicar la web):

1. Huellas de hoy (solo lectura, 2026-10-02) — son las que el parche exige, y coinciden con las de la base desechable: `fn_cuenta_sellada`
   `cbaaccb42a59272a88b854aa79bd9746`, `fn_resumen_caja` `72dab7b74ac3da0d541d6a575680b0ca`, `fn_ventas_del_dia`
   `3ab77169d3cc381e46db6b5b0e3e6f4e`. El CHECK de medios vivo trae los 7 medios (con `qr`).
2. Parte 1: `20261003110000_venta_pagos_candado_redondeo.sql` (toma la tabla unos milisegundos; con `lock_timeout = 3s` falla sin
   tocar nada si una venta la tiene tomada: se vuelve a pegar).
3. Parte 2: `20261003111000_redondeo_lectores.sql`. Huellas «después»: `fn_cuenta_sellada` `ebe23eeff86c0814d4faf0e78521bc00`,
   `fn_resumen_caja` `ab7495db3cc96abda90b61eb977e106b`, `fn_ventas_del_dia` `cde71227a0b7b41aae8ab1a8b67b49db`.
4. Sin filas de redondeo no cambia ni un número; con la web vieja o con la nueva no pasa nada (la clave `redondeo` que trae
   `fn_resumen_caja` la web vieja la ignora).


## 9. Lo que queda

Las actividades 2 a 8. Pendientes que salieron de la investigación y no son de esta lista: el cierre de caja se cierra
tecleando la cifra del sistema (desde ADR-0186 el esperado se ve antes de contar); y 77 de 84 líneas vendidas en producción son
«Prenda sin registrar» con precio tecleado a mano (de ahí salen céntimos como 62.15 y 309.59).
