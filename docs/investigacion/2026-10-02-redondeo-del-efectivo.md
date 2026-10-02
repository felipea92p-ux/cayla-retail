# Redondeo del efectivo — investigación (2026-10-02)

**Estado:** investigación terminada; la decisión de diseño está propuesta y **espera la aprobación de Felipe** (ADR-0310 reservado,
sin escribir). Nada de esto está construido. Hechos verificados el 2026-10-02 contra `origin/main` (5883513f) y producción
(solo lectura, solo agregados).

## 1. El pedido y el síntoma

Una integrante de AQP pidió que las ventas no queden con céntimos que no se pueden pagar con monedas. La captura de Caja
(AQP, 1-oct) dice «Efectivo en el cajón ahora S/ 603.44» = apertura 118.90 + ventas en efectivo 484.54: una cifra que no puede
existir físicamente. En producción esa caja cerró con `contado = 603.44`, `diferencia = 0.00` y trasladó 303.44 a la caja fuerte:
**cuadró porque se tecleó la cifra del sistema** (desde ADR-0186 el esperado se ve antes de contar), no porque el cajón pudiera
contener .44. Los 4 pagos en efectivo de ese turno: 37.90 + 62.15 + 74.90 + 309.59.

**Por qué apareció ahora:** ADR-0182 bajaba el precio de campaña al .90, así que todo total terminaba en 0 céntimos. ADR-0302
(1-oct) hizo el descuento exacto al céntimo (`round(precio × % / 100, 2)`), y desde entonces nacen .91, .92, .93… Antes del 1-oct
19 de 19 totales de ticket eran múltiplos de 0.10; desde entonces, 5 de 25 no lo son. Los dos pagos con céntimo raro de AQP
(62.15 y 309.59) vienen de líneas de «Prenda sin registrar» con precio tecleado a mano, no de descuentos.

## 2. La regla legal (Perú)

| Hecho | Fuente |
|---|---|
| La moneda de S/ 0.01 se retiró el 1-may-2011 y la de S/ 0.05 el 1-ene-2019. Hoy circulan 0.10, 0.20, 0.50, 1, 2 y 5. **Lo mínimo que se puede pagar es S/ 0.10.** | [Circular 0033-2018-BCRP](https://busquedas.elperuano.pe/dispositivo/NL/1708052-1) (texto leído en El Peruano) |
| Art. 3: desde el 1-ene-2019, **solo en pagos en efectivo y sobre el monto total a pagar**, el redondeo toma como referencia el art. 44 de la Ley 29571. Art. 5: el céntimo sigue siendo la unidad de cuenta y los medios no efectivo no cambian. | Misma circular |
| Art. 44 (Ley 29571): **prohibido redondear en perjuicio del consumidor**, salvo que lo acepte expresamente al pagar. | [Código del Consumidor compilado](https://lexsoluciones.com/wp-content/uploads/2021/11/CODIGO-DEL-CONSUMIDOR-24.10.2021.pdf) |
| INDECOPI lo aplica **siempre hacia abajo**: 5.99 → 5.90, 2.69 → 2.60 (prohibido 2.70), 8.97 → 8.90 (prohibido 9.00). No aplica a tarjeta, transferencia ni billeteras: se cobra exacto. | [Nota INDECOPI 12-jun-2019](https://repositorio.indecopi.gob.pe/backend/api/core/bitstreams/68e2998e-77bc-4ea3-95ea-6dc24d14e053/content), [Tip 04-2019](https://cdn.www.gob.pe/uploads/document/file/1694248/4_Redondeo%20de%20precios.pdf.pdf), [TV Perú 19-mar-2026](https://www.tvperu.gob.pe/novedades/mas-conectados/redondeo-en-efectivo-conoce-cuando-debe-favorecerte-y-que-hacer-si-te-cobran-de-mas) |
| Subir solo es lícito con aceptación expresa y para una donación informada. Tottus fue sancionado (Res. 3570-2019/SPC) por quedarse S/ 0.01 de vuelto como donación sin consultar. Multas del Código: hasta 450 UIT. | [Res. 3570-2019/SPC-INDECOPI](https://img.lpderecho.pe/wp-content/uploads/2020/09/Resoluci%C3%B3n-3570-2019-SPC-INDECOPI-LP.pdf) |

**Consecuencia:** la unidad es **S/ 0.10**, la dirección es **solo hacia abajo**, el alcance es **solo el efectivo** y se aplica **una
vez, al total a pagar en efectivo** (nunca por línea ni al precio). El «más cercano» de Canadá o Australia no sirve: sube en las
terminaciones 6-9 y eso es redondear en perjuicio. Es lectura de textos oficiales; no hay norma con la fórmula numérica (la fijan
los ejemplos de INDECOPI) y **conviene que un abogado la confirme**.

| Total | Cobro en efectivo | Redondeo |
|---|---|---|
| 100.02 | 100.00 | −0.02 |
| 100.12 | 100.10 (no 100.12: no existe moneda de 0.02) | −0.02 |
| 100.19 | 100.10 (no 100.20) | −0.09 |

**SUNAT:** el comprobante electrónico tiene un campo opcional «Monto de redondeo del importe total»
(`cbc:PayableRoundingAmount`, RS 114-2019 campo 49, RS 123-2022) con redacción «de corresponder»; no lo prohíbe ni lo exige. Lucode
no lo documenta en la emisión (docs.apisunat.pe). El IGV se calcula sobre las líneas exactas; el campo de redondeo vive aparte.

## 3. Lo que cuesta

Simulación (2 000 000 carritos, céntimos enteros, precios reales de variantes, descuentos exactos) y producción:
- **Siempre hacia abajo a 0.10:** S/ 10 a 31 por cada 1 000 pagos en efectivo (S/ 45 si los últimos dígitos fueran uniformes).
- La regla vieja de ADR-0182 regalaba ≈ S/ 120 por cada 1 000 tickets con campaña: la ley cuesta varias veces menos.
- Turno de AQP del 1-oct bajo la ley: 37.90 + 62.10 + 74.90 + 309.50 = 484.40 (−0.14) → cajón 603.30.
- Con precios de lista (.90 / .00) y sin descuentos, el redondeo vale 0: todo el impacto viene de los descuentos exactos y de los
  precios manuales.
- Redondear **por línea** y sumar acumula error: máximo 20 c con 4 líneas contra 5 c redondeando el total una vez.

## 4. Cómo lo hacen otros

- **Países** (Canadá, Australia, Nueva Zelanda, Irlanda, Países Bajos, Bélgica, Italia, Israel, Chile, Singapur…): solo efectivo,
  sobre el total de la transacción, nunca por línea, impuesto calculado antes sobre el monto exacto, tarjeta exacta; Bélgica exige
  la línea «redondeo» en el ticket. Con unidad de 0.10 hay precedente (Israel 2008, Nueva Zelanda 2006, Chile 2017) pero resuelven
  distinto el empate .x5. Perú se aparta del «más cercano»: por ley es a favor del consumidor.
- **POS / ERP** (Odoo, Square, Shopify POS, Clover, Toast, Lightspeed, Dynamics Commerce): el redondeo es una línea o campo aparte,
  solo en el medio efectivo, nunca toca el impuesto, va a una cuenta propia de ganancia/pérdida y el cajón se concilia sobre lo ya
  redondeado. Shopify publicó para Perú «round down to nearest S/0.10». Cuatro patrones: línea separada (Odoo), propiedad del medio
  de pago, par (monto exacto + ajuste) y solo en pantalla (el más débil: el cajón no cuadra).

## 5. Diseño propuesto (pendiente de aprobación)

```
DECIDÍ: diseño A. venta_pagos guarda el efectivo ya redondeado (monto múltiplo de 0.10) y UNA fila extra metodo='redondeo'
        por la diferencia (0.01 a 0.09; siempre positiva porque la ley solo permite bajar). La suma de todas las filas sigue
        igualando la suma de ítems. El estado de pantalla `pagos` se queda exacto y el redondeo se calcula en el borde con una
        función pura espejo TS/SQL. El comprobante sale exacto (suma de ítems), como hoy.
DESCARTÉ: diseño B (columna venta_pagos.redondeo con monto exacto): el efectivo físico pasaría a ser monto + redondeo y 18
        lectores tendrían que aprender a sumar dos cosas; el que se olvide deja el cierre de caja corrido en céntimos sin
        avisar (parece un faltante diario). También descarté redondear por línea (error ×4) y «más cercano» (ilegal al subir).
SE ROMPE SI: un reporte nuevo suma todo venta_pagos como dinero recibido sin excluir 'redondeo'; se publica la web antes de las
        migraciones (la RPC rechaza el medio nuevo: por eso la bandera fn_acepta_redondeo_efectivo); o alguien rehace
        venta_pagos_metodo_check desde una lista vieja y suelta 'qr' o 'anticipo' (casi pasó con 0ed663f1).
```

**Los agentes se partieron al decidir.** Los dos que contaron lectores prefirieron A (4 de sus 11 objetos «rompen» a la vista en la
primera prueba; en B, 6 fallan en silencio con una cifra de dinero mal). El adversario prefirió B por una razón fuerte: la ley se
fija con un CHECK de una sola fila (para cada monto existe exactamente un redondeo en (−0.10, 0] que deja el efectivo múltiplo de
0.10) y no se reescribe el CHECK de medios. Se eligió A porque el control más importante, el arqueo, debe leer un hecho guardado
(lo que hay físicamente) y no una suma derivada, y porque A sigue el precedente de `anticipo`. Las condiciones de A que recogen la
objeción: el redondeo se deriva en el borde y nunca entra al estado editable ni a `METODOS_PAGO_VENTA`; la RPC exige que el
redondeo sea exactamente `monto_efectivo_exacto − floor10(monto_efectivo_exacto)` (solución única, no manipulable); índice único
parcial (un redondeo por venta) y CHECK `monto < 0.10`; el CHECK de medios se rehace desde la definición viva; y una prueba que
lista las funciones que leen `venta_pagos` y exige que cada una esté revisada pensando en `redondeo`.

**Estados imposibles:** redondeo ≥ 0.10 · dos filas de redondeo en una venta · redondeo sin fila de efectivo · efectivo con
redondeo que no es múltiplo de 0.10 · redondeo con `recibido` o `referencia` · fila de efectivo en 0 por redondeo.

## 6. Qué toca (lectores de `venta_pagos`)

17 funciones SQL viven en producción leyendo `venta_pagos` o `separacion_pagos`; 33 consumidores entre SQL y web. Bajo A hay que
tocar: el CHECK de medios, `registrar_venta`, `fn_asiento_cuenta_de_medio` (hoy un medio desconocido cae a la cuenta 104, banco),
`fn_cuenta_sellada` (hoy le estampa la cuenta de transferencia), `fn_resumen_caja`, `fn_totales_historial_ventas`,
`fn_ventas_del_dia` y, si el saldo en efectivo se redondea, `entregar_separacion`. **No se tocan** `fn_calcular_esperado_caja`,
`fn_flujo_lineas`, el CHECK de `recibido` ni el vuelto: leen `efectivo.monto`, que ya es lo físico.
`registrar_venta` (18 parámetros, md5 normalizado vivo `525479a95e59063b5f9e86f63119e27e`) exige hoy que la suma de pagos iguale la
de ítems sin tolerancia; esa igualdad se conserva. El diario cuadra solo (cada fila genera su Debe); el redondeo va a una cuenta
de gasto propia, **provisional hasta que el contador la valide** (6599 es «Diferencias de caja» y 659 es «Mermas»: no mezclar).

## 7. Actividades propuestas (/construir)

Paso 0, terreno: llevar la rama a `origin/main` (hoy 21 commits atrás: no tiene `HojaDeCobro.tsx`), fila en `SESIONES-ACTIVAS`,
Postgres desechable con las 393 migraciones, sonda de huellas md5 de las funciones a parchar.

1. Regla única `redondeoEfectivo` / `retail.fn_redondeo_efectivo` con paridad exhaustiva (0.01 a 999.99) y ADR-0310.
2. Los lectores entienden «redondeo» (Caja, Historial, cuenta sellada, CHECK de medios) con una venta sembrada.
3. Diario y estado de resultados: cuadra y se ve, cuenta provisional.
4. Papel y reimpresión: el recibo dice el redondeo; la boleta sigue exacta.
5. Vender cobra en efectivo redondeado de punta a punta (RPC, hoja de cobro, cola sin conexión, bandera). A 375 px.
6. Apartados: entregar con el saldo en efectivo redondeado (abonos y adelanto no se redondean).
7. Cambios y devoluciones en efectivo (condicionado a decisiones legales de Felipe).
8. Condicional: declarar el redondeo en el comprobante SUNAT, solo spike en el sandbox de Lucode.

Orden de construcción = orden de la lista. Orden en **producción**: lectores → diario → web → `registrar_venta` → bandera al final.

## 8. Cómo falla (principio 9)

Si Lucode o SUNAT no responden, no cambia nada: el comprobante sale exacto como hoy y el redondeo vive solo adentro. La cola sin
conexión sigue aceptando ventas con el contrato viejo (efectivo exacto, sin fila de redondeo) para no perder ninguna.

## 9. No verificado

- Qué cuenta del PCGE corresponde y cómo trata el contador el IGV de un comprobante exacto con 0.02 no cobrado (decide el contador).
- Si SUNAT/Lucode aceptan declarar el redondeo en el XML (nadie lo ha probado; no hay campo documentado en la emisión de Lucode).
- La dirección legal del redondeo cuando CAYLA entrega efectivo (reembolsos, diferencia a favor en un cambio): sin norma hallada.
- Pagos mixtos y abonos parciales: ninguna norma peruana los trata; la práctica internacional redondea solo la porción en efectivo.
- Textos y orden de pantalla de la hoja de cobro: no se han probado con una persona sin contexto ni a 375 px.
- El volumen real de ventas en efectivo (producción tiene 44 ventas reales: no permite estimar el costo mensual).
