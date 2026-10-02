# ADR-0311 — Redondeo del efectivo: S/ 0.10, solo hacia abajo, y el redondeo es una fila visible

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
- [x] **3. Diario y estado de resultados** (§8): el redondeo se asienta contra una cuenta de gasto propia (**6598**, provisional hasta
  el contador) y no contra el banco; el asiento cuadra solo, el Estado de resultados lo muestra y la anulación lo revierte.
  `fn_asientos` no se tocó.
- [x] **4. Papel y reimpresión** (§8): el ticket de 80 mm, la boleta A4, el modal «Venta registrada» y el detalle del Historial dicen el
  redondeo en «Forma de pago»; el total, el subtotal, el IGV y el QR de SUNAT siguen por el precio exacto.
- [x] **5. Vender cobra en efectivo redondeado de punta a punta** (§8): la RPC `registrar_venta` verifica el redondeo, la hoja de cobro lo
  muestra, la cola sin conexión lo soporta y la bandera `fn_acepta_redondeo_efectivo` lo enciende. Probado en la pantalla real.
- [x] **6. Apartados** (§8): `entregar_separacion` acepta la fila de redondeo en el saldo que se paga al entregar y verifica que sea la de la ley;
  el adelanto y los abonos no se redondean. La pantalla de entrega, el modal «Apartado entregado» y la boleta final lo dicen; la boleta sale por el
  saldo exacto. La bandera `fn_acepta_redondeo_efectivo` ahora exige las dos funciones (Vender y Apartados cobran con la misma).
- [~] **7. Cambios y devoluciones en efectivo — DIFERIDA a propósito** (§9): en producción hay 0 cambios, 0 devoluciones y 0 variantes con céntimos en el
  catálogo, y la dirección del redondeo de un reembolso (hacia arriba) es una lectura legal sin verificar. Construirla hoy metería una columna por tabla y siete funciones
  de dinero por un caso que nunca ocurrió. Vuelve cuando se cumpla el disparador de §9.
- [ ] 8. Condicional: declarar el redondeo en el comprobante SUNAT, solo prueba en el sandbox de Lucode.

**Orden en producción** (lo pega Felipe, nunca esta sesión): partes de las actividades 2 y 3 → publicar la web → `registrar_venta`
(actividad 5) → `entregar_separacion` (actividad 6) → bandera `fn_acepta_redondeo_efectivo` al final → recargar las tablets.

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


### Actividad 3 — el diario

Con la misma venta sembrada (79.88 = 79.80 efectivo + 0.08 redondeo), `pnpm pruebas:redondeo-efectivo` **31/31**:

- **Antes (línea base medida):** el asiento traía `104: 0.08` — una plata «en el banco» que nunca llegó — y la pérdida no llegaba al
  Estado de resultados. **Después:** `101: 79.80 · 6598: 0.08` contra el Haber de la venta (7011 + 4011): **cuadra sin una línea de
  ajuste** y no hay asientos descuadrados; ninguna línea cae en 104.
- **Estado de resultados:** el gasto «Redondeo de efectivo (a favor del cliente)» (6598) muestra 0.08, con 0 descuadrados.
- **Cierre de mes:** el chequeo «diario» sigue en verde (0 descuadrados): el redondeo no bloquea el mes.
- **Anular la venta** revierte el redondeo contra 6598 y Caja contra 101: queda en cero.
- Los demás medios no cambian de cuenta (efectivo 101, tarjeta 105, yape/plin/transferencia/qr 104, anticipo 122, saldo a favor 421).
- La migración se pega dos veces, deja una sola cuenta 6598 y la huella prometida; y **aborta si la función cambió** desde que se escribió.
- **Control de mutación:** con el redondeo cayendo otra vez en 104, la prueba da **26/31** (fallan el asiento, el «no es banco», el
  Estado de resultados, la anulación y la huella); con el parche, 31/31.
- Regresión de Finanzas en verde: `balance` 69, `cierre-mes` 104, `estado-resultados` 73, `presupuesto` 78, `resumen-finanzas` 68,
  `roles-lider-editable` 13. Web: `resultados-reglas` 30 pruebas (la cuenta tiene su nombre y su «de dónde sale»), `tsc` y eslint.
  **No se probó en el navegador** la pantalla del Estado de resultados (el cambio web es un nombre y un texto, cubiertos por prueba).

**Para pegar en producción** (Felipe, SOLA, después de las dos partes de la actividad 2 y antes de publicar la web): huella «antes» de
`fn_asiento_cuenta_de_medio` `9d9d0c71a9867ab1f4f7262ba7f13c7a` (verificada hoy, solo lectura); «después» `6b4982f3847cb817c3a26155f043f047`.
En producción el plan de cuentas es el mismo: 6598 y el orden 46 están libres. **Pendiente del contador:** el código y el nombre de la
cuenta (si pide otro, se renombra ANTES del primer cierre de mes: el cierre congela la huella del diario con su código).

### Actividad 4 — el papel

- **Reglas:** `ReciboVenta` gana `redondeo` (aparte: `Σ pagos + redondeo = total`, con el efectivo ya redondeado) y `armarRecibo` lo
  recibe; la reimpresión (`armarDetalleVenta`) **separa la fila `redondeo` de `venta_pagos` de los pagos reales** (sin eso el papel
  habría impreso un renglón con el nombre vacío). 67 pruebas en verde: el vuelto sale del efectivo ya cobrado (80.00 − 79.80 = 0.20),
  `total`, `subtotal`, `igv` y el texto del QR son **idénticos con y sin redondeo**, y sin redondeo el papel queda como siempre.
- **Navegador, con datos reales:** `leerVentaDetalle` (el mismo camino de la reimpresión) sobre la venta sembrada, contra PostgREST
  local con el JWT del líder, dibujando `ReciboTermico` y `BoletaA4` reales. Ticket: «TOTAL S/ 79.88 · SON: SETENTA Y NUEVE CON 88/100
  SOLES · Forma de pago: Efectivo S/ 79.80 · Redondeo de efectivo S/ 0.08 · Ley 29571: múltiplo de S/ 0.10, hacia abajo». Boleta A4:
  igual en su columna de pago, con importe de venta 79.88, IGV 12.19 y TOTAL 79.88 intactos. **Hallazgo del navegador:** la primera
  versión de la línea de la ley (67 caracteres) se salía del papel de 80 mm; se acortó a 43 (`LEY_REDONDEO_TICKET`, con una prueba
  del largo) y ahora la fila mide 240 de 240 px.
- **No verificado visualmente:** el modal «Venta registrada» (`VentaRegistradaModal`) y el detalle del Historial (`DetalleVentaModal`)
  — son una fila más en listas que ya existían, con los mismos datos (`r.redondeo`, `d.redondeo`) que sí se probaron — y **ninguna
  pantalla a 375 px** (PL-105): el PR final de Vender (actividad 5) lleva su casillero y su captura.

### Actividad 5 — Vender

**La base** (`20261003130000` parche de `registrar_venta`, `20261003140000` la bandera). `pnpm pruebas:redondeo-efectivo` **58/58** con la RPC real:
- Venta de 79.88 = efectivo 79.80 (recibió 80) + redondeo 0.08: la suma de las filas es la suma de los ítems, la **boleta sale por 79.88
  exacto** (subtotal 67.69 + IGV 12.19), «Efectivo en el cajón» es 100.00 + 79.80, los bordes (0.01 y 0.09), el pago mixto (Yape 30.05 exacto +
  efectivo 49.80 + 0.03) y la tarjeta siempre exacta.
- **Compatibilidad:** una venta con el efectivo exacto y sin fila de redondeo (la cola sin conexión de una caja vieja) se **sigue aceptando**.
- **Lo que rechaza** (cada uno con el hint `venta_redondeo_invalido`): cobrar DE MÁS (efectivo 79.90 con un «redondeo» de −0.02), un redondeo
  que no es el de la ley, un efectivo que no es múltiplo de 0.10, un «redondeo» de 0.18, un redondeo sin efectivo, dos pagos en efectivo, dos
  redondeos y el redondeo como único pago.
- Mismo `p_token` dos veces = **una** venta con **un** redondeo; anular la venta deja Caja en la apertura y el diario en cero.
- La bandera dice `true` solo si la base de verdad puede recibirlo (el medio en el CHECK, la regla y la validación de `registrar_venta`) y cae a
  `false` sola si falta alguna; las dos partes se pegan dos veces, dejan la huella `6783f397…` y **una sola firma de 18 parámetros**; el parche
  aborta si la función cambió o si falta la regla. **Paridad caja ↔ base: 0 diferencias en los 99 999 montos.**
- **Control de mutación:** con la validación del redondeo apagada dentro de `registrar_venta`, **49/58** (caen 9: todos los rechazos).
- Regresión: `registrar-venta` 28, `campana-redondeo` 9, `venta-contrato-ampliado` 13, los cuatro del Club (33, 30, 34, 29), caja, finanzas,
  separaciones, devoluciones y cambios, todos en verde. `club_registro_cartel` fija la huella viva de `registrar_venta`: ahora sigue la cadena
  (`20261002100000` → `20261003130000`) y exige que no se corte.

**La pantalla**, probada en el navegador con la **pantalla real de Vender** (`PuntoDeVenta` + `HojaDeCobro`) hablando con la **RPC real** por PostgREST local:
- Una prenda de S/ 79.88, Efectivo: «**Cobra S/79.80 en efectivo** · Redondeo de efectivo −S/0.08 · Ley 29571…», billetes 79.80 (exacto), 80, 90, 100, 200, y
  con S/100 el **vuelto es S/20.20**, una cifra que se puede dar en monedas. La boleta sale por **S/79.88** y el modal «Venta registrada» muestra el redondeo.
  La RPC recibió `[efectivo 79.8 (recibido 100), redondeo 0.08]` y la base quedó con exactamente eso.
- **Pago mixto:** Yape 30.05 queda exacto y al efectivo le quedan 49.83 → «Cobra S/49.80 · redondeo −S/0.03»; vuelto de 50 = S/0.20; registrado como
  `yape 30.05 + efectivo 49.80/50 + redondeo 0.03`.
- **Efectivo menor de S/ 0.10** (los 0.07 tras un Yape): no hay billetes que anotar, el recuadro dice «No hay moneda para S/0.07… Cóbralo con otro medio» y el botón queda
  apagado con la misma frase. Con 0.18 cobra 0.10 y redondea −0.08.
- **Celular, 375 px:** sin desborde horizontal (375 de 375); el recuadro y los billetes envuelven limpio.
- **Cola sin conexión:** con la red cortada para `registrar_venta`, la venta se guarda con el redondeo adentro («guardada sin conexión»), y al volver la red sube
  **sola, una vez**, con su fila de redondeo; la cola queda vacía.
- **Bandera apagada:** la caja cobra exacto como antes (sin recuadro de redondeo, el primer billete es S/79.88).
- **Web:** 166 pruebas de `vender-reglas` (incluida la invariante «lo que viaja suma EXACTAMENTE el total» en 9 999 totales, solo en efectivo y repartido), suite
  completa 303 archivos / 154 751 pruebas, `tsc` y eslint en verde.

**Las tres preguntas de CLAUDE.md.** *Concurrencia:* no se agregó estado compartido; el redondeo vive en la misma transacción de la venta, un índice único por venta
impide el segundo y la caja se toma `for share` como siempre. *Caída externa:* SUNAT/Lucode no ven el redondeo (el comprobante sale exacto); sin red, la cola
conserva la venta con su redondeo. *Persona sin contexto:* la cajera no elige nada: el recuadro le dice cuánto cobrar y por qué, y el botón le dice qué falta.

**Para pegar en producción** — lo pega Felipe, cada parte SOLA y en este orden (la web puede publicarse antes: sin la bandera cobra exacto):
1. `20261003100000` (la regla) → `20261003110000` (candado de `venta_pagos`) → `20261003111000` (lectores) → `20261003120000` (diario).
2. Publicar la web (fusionar el PR).
3. `20261003130000` (`registrar_venta`; huella «antes» `525479a95e59063b5f9e86f63119e27e`, la de producción hoy; «después» `6783f3971aff6967ca2ab54c07a4202a`).
3b. `20261003135000` (`entregar_separacion`, actividad 6; huella «antes» `7d38028b2cdf10ec50984b659cfbe63c`, la de producción el 2026-10-02; «después» `e2f37e6167abff613891c00c1c9a2ebb`).
4. `20261003140000` (la bandera) **al final** (ahora pregunta por `registrar_venta` Y `entregar_separacion`: sin la 3b dice `false` y las dos pantallas cobran exacto); después **recargar Vender (F5) en cada caja**: la bandera se lee al cargar.
5. `pnpm datos:generar:produccion` y `pnpm datos:comparar` (hoy el comparador marca `fn_acepta_redondeo_efectivo` como «no está en la foto»: es lo esperado hasta pegar).
Para **apagar** el redondeo: `create or replace function retail.fn_acepta_redondeo_efectivo()` devolviendo `false`.

### Cómo se pega (y cómo se sabe que se pegó) — 2026-10-02

El primer intento de pegar `registrar_venta` llegó al editor **cortado** (las líneas 14 a 96 de 145: una selección a mano) y Postgres respondió «unterminated
dollar-quoted string»; ese error es el bueno, porque no aplica nada. El malo es el corte que cae entre dos instrucciones: el editor de Supabase manda todo como UNA
consulta, Postgres la acepta, dice «Success» y no se aplicó casi nada (le pasó a la parte del diario: quedó la cuenta 6598 y `fn_asiento_cuenta_de_medio` sin parchar).
Dos arreglos:

- **Copiar el archivo entero, nunca seleccionarlo a mano:** `pbcopy < <ruta absoluta del archivo>` en la terminal deja en el portapapeles el archivo completo.
- **Cada archivo termina con una fila «QUEDÓ BIEN»** (su última instrucción, un `select` que mira el efecto real). Si al pegar no aparece esa fila, el texto llegó cortado o
  falta una parte anterior: se vuelve a copiar y a pegar, que es seguro repetir. `redondeo_efectivo.mjs` lo prueba: pega cada archivo como el editor (un solo texto) y
  comprueba que **ninguno de 312 textos cortados** (61 de los cuales Postgres acepta sin quejarse) produce esa fila; con la fila puesta al principio la prueba cae.

Ensayo del pegado real en una base idéntica a producción hoy (`registrar_venta` `525479a9…`, `entregar_separacion` `7d38028b…`, `fn_asiento_cuenta_de_medio` `9d9d0c71…`,
con la cuenta 6598 ya puesta): los siete archivos en orden, cada uno como un solo texto, dan siete «QUEDÓ BIEN».

**¿Qué falta pegar?** (solo lectura; cada columna es una parte, `true` = ya está):

```sql
select
  to_regprocedure('retail.fn_redondeo_efectivo(numeric)') is not null                                                                                   as p100000_regla,
  exists (select 1 from pg_constraint c where c.conrelid = 'retail.venta_pagos'::regclass and c.conname = 'venta_pagos_redondeo_valido')               as p110000_candado,
  (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname in ('fn_cuenta_sellada','fn_resumen_caja','fn_ventas_del_dia') and p.prosrc like '%''redondeo''%') = 3 as p111000_lectores,
  coalesce((select retail.fn_asiento_cuenta_de_medio('redondeo') = '6598'), false)                                                                      as p120000_diario,
  exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'registrar_venta' and p.prosrc like '%venta_redondeo_invalido%')     as p130000_registrar_venta,
  exists (select 1 from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'entregar_separacion' and p.prosrc like '%venta_redondeo_invalido%') as p135000_entregar_separacion,
  to_regprocedure('retail.fn_acepta_redondeo_efectivo()') is not null                                                                                   as p140000_bandera_creada;
```

(Con la parte del diario sin pegar, `fn_asiento_cuenta_de_medio('redondeo')` devuelve `104` y no `6598`, y la columna sale `false`. La bandera se pega al final y solo se mira si EXISTE; para saber si está encendida: `select retail.fn_acepta_redondeo_efectivo();`, que antes de pegarla falla con «function does not exist».)

### Actividad 6 — Apartados (2026-10-02)

**Qué se redondea.** Solo el **saldo que se paga al entregar** (`entregar_separacion`). Los céntimos de un apartado nacen del PRECIO de las prendas; el adelanto y
los abonos son montos que el cliente elige (nadie «debe» 50.02 de adelanto), así que no hay un total a pagar que redondear en ellos. `separar_prendas` y
`abonar_separacion` **no se tocaron** y siguen rechazando una fila de redondeo con «Medio de pago no reconocido» (probado).

**Base** (`20261003135000_entregar_separacion_redondeo.sql`, parche anclado con huella como el de `registrar_venta`): la lista de medios acepta `redondeo` y,
con una fila de redondeo, exige UN efectivo en múltiplos de S/ 0.10 y que el redondeo sea EXACTAMENTE `fn_redondeo_efectivo(efectivo + redondeo)`; sin fila se acepta
como siempre. La boleta final se emite por `v_saldo` exacto; `venta_pagos` queda `anticipo + efectivo (monedas) + redondeo` y suma el total del apartado.
Pruebas (`pnpm pruebas:redondeo-efectivo`, ahora **82/82**): la entrega de 29.88 = 29.80 (recibió 30) + 0.08 por la RPC real; boleta 29.88 (25.32 + 4.56); Caja
«Efectivo en el cajón» 129.80 con el redondeo aparte; el diario asienta 0.08 en la 6598 y todo cuadra; mixto, tarjeta exacta y efectivo exacto de siempre (compatibilidad);
9 rechazos (cobrar de más, redondeo que no es el de la ley, 29.85 + 0.03, sin efectivo, dos efectivos, dos redondeos, solo redondeo…); apartar y abonar con la fila se rechazan;
la misma entrega dos veces (mismo token) es UNA venta con UN redondeo; la migración se pega dos veces, deja la huella y UNA firma, aborta si la función cambió o si falta la regla.
**Control de mutación:** sin la validación del redondeo caen 8 escenarios; con la lista de medios sin `redondeo`, 12. Con la función real, 82/82. `separaciones.mjs` (78) y
`totales_caja_e_historial` siguen en verde.

**La bandera ya no es solo de Vender.** `fn_acepta_redondeo_efectivo` (20261003140000) ahora pregunta además por `entregar_separacion`: Apartados lee la misma bandera
(`vender/apartados/page.tsx`) y no puede ofrecer un redondeo que la base rechazaría. La migración del apartado lleva el número `…135000` para que, aplicando en orden, la bandera siga yendo
última.

**Web.** `cobroDelSaldo(pagos, saldo, redondear)` y `pagosParaRpcApartado(pagos, redondear)` (`lib/separaciones-reglas.ts`; el `redondear` solo lo pasa la entrega): el vuelto sale de las
monedas que se cobran, y un efectivo menor de S/ 0.10 no se puede entregar. 38 pruebas, entre ellas la invariante «en los 29 999 saldos de 0.01 a 299.99 lo que viaja suma exactamente el
saldo y el efectivo es múltiplo de 0.10». Con la bandera apagada todo viaja exacto, como antes.

**Verificado en la pantalla real** (`EntregarVista` montada contra PostgREST + la base desechable, con la RPC real): el saldo de 29.88 en efectivo muestra «Cobra S/29.80 en efectivo ·
Redondeo de efectivo −S/0.08 · Ley 29571…»; con S/50 el vuelto es **S/20.20**; la RPC recibió `[efectivo 29.8 (recibido 50), redondeo 0.08]` y la base quedó con
`anticipo 50.02 + efectivo 29.80/50.00 + redondeo 0.08`, boleta de **S/29.88**, apartado entregado y «esperado» de la caja en 129.80. El modal «Apartado entregado» y la boleta impresa traen
«Redondeo de efectivo S/0.08» y la ley. Yape 29.81 + efectivo 0.07: «No hay moneda para S/0.07… Cóbralo con otro medio» y el botón apagado con la misma frase. **375 px:** sin desborde
(375 de 375), el recuadro se lee entero. **Bandera apagada (`?r=0`):** sin recuadro, viaja `[efectivo 29.88]` y el modal no dice redondeo. Sin errores en consola.

**Las tres preguntas de CLAUDE.md.** *Concurrencia:* la RPC ya tomaba `for update` sobre el apartado (la segunda caja lo ve entregado) y el índice único impide un segundo redondeo en la venta.
*Caída externa:* SUNAT/Lucode no ven el redondeo (la boleta final sale exacta, como antes); si no responden, el comprobante se encola igual y nada de esto cambia. *Persona sin contexto:* quien entrega
no elige nada: el recuadro le dice cuánto cobrar en efectivo y por qué, y el botón le dice qué falta.

## 9. Lo que queda

**Actividad 7 diferida (decisión de criterio, 2026-10-02; Felipe puede pedirla igual).** Números de producción (solo lectura, 2026-10-02): 49 ventas, **0 cambios, 0 devoluciones**,
**0 de 599 variantes activas con céntimos en el precio** (así la diferencia de un cambio —precio nuevo menos precio viejo, de lista— es siempre múltiplo de S/ 0.10 mientras el catálogo lo sea)
y 2 pagos en efectivo con céntimos, ambos de ventas. El único camino que hoy deja un efectivo sin moneda en esas dos operaciones es una línea con precio tecleado a mano, o un reembolso de una venta con
descuento porcentual (63.92). Para cerrarlo hacen falta una columna en `cambios` y otra en `devoluciones`, parchar `registrar_cambio`, `aprobar_devolucion`, `fn_calcular_esperado_caja`, `fn_flujo_lineas`,
`fn_dinero_libro`, `fn_bal_causas_dinero` y `fn_asientos` (la más parchada del repo) y las pantallas de Cambios y Devoluciones, además de fijar una regla que ninguna norma peruana trata (¿un reembolso en efectivo se redondea
hacia arriba, a favor del cliente, o se devuelve exactamente lo que se cobró en efectivo, que ya es múltiplo de 0.10?). **DECIDÍ** diferirla; **DESCARTÉ** construirla ahora porque su costo (siete funciones de dinero más
dos tablas, con la dirección legal sin verificar) es muy superior a lo que cuesta no tenerla (S/ 0.01–0.09 por operación, y hoy cero operaciones); **SE ROMPE SI** una caja entrega un reembolso en efectivo de una venta con
descuento porcentual y el arqueo del día amanece con una diferencia de céntimos que nadie sabe explicar. **Disparador para construirla:** la consulta de abajo devuelve algo distinto de cero, o la integrante vuelve a ver un
cajón con céntimos tras un reembolso.

```sql
select (select count(*) from retail.devoluciones where estado = 'aprobada' and reembolso_metodo = 'efectivo' and mod(round(reembolso_monto * 100)::int, 10) <> 0) as devoluciones_en_efectivo_con_centimos,
       (select count(*) from retail.cambios where metodo_pago_diferencia = 'efectivo' and mod(round(abs(diferencia) * 100)::int, 10) <> 0) as cambios_en_efectivo_con_centimos,
       (select count(*) from retail.variantes where activo and mod(round(precio * 100)::int, 10) <> 0) as variantes_con_centimos;
```

Mientras tanto, la mitigación sin código: al aprobar un reembolso en efectivo, el líder elige el monto (ya es libre hasta el tope) y puede entregar un múltiplo de 0.10 y el resto por Yape.

**Actividad 8:** solo con el OK explícito de Felipe y el sandbox de Lucode. Pendientes que salieron de la investigación y no son de esta lista: el cierre de caja se cierra
tecleando la cifra del sistema (desde ADR-0186 el esperado se ve antes de contar); y 77 de 84 líneas vendidas en producción son
«Prenda sin registrar» con precio tecleado a mano (de ahí salen céntimos como 62.15 y 309.59).
