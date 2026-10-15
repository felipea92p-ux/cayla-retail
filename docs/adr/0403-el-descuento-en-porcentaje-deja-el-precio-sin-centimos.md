# ADR-0403 — El descuento en % deja el precio sin céntimos sueltos; el descuento en S/ vuelve

**Fecha:** 2026-10-14
**Estado:** construido en la rama `claude/price-rounding-money-input-56b2f7`. **SQL PEGADO en producción el 2026-10-14 a las ~15:30 (Lima)** con la orden de Felipe («ahora mismo», con el riesgo a la vista:
tiendas vendiendo y 29 campañas vigentes; `20261014173000_descuento_precio_sin_centimos.sql`, una sola parte, vía `apply_migration`); la web sale con el PR #1081 y hasta entonces las ventas con campaña se rechazan. **Reemplaza** la regla de [ADR-0302](0302-el-descuento-de-campana-es-exacto.md) (el descuento en % es exacto al
céntimo). **Complementa** [ADR-0311](0311-redondeo-del-efectivo.md) (el redondeo del efectivo al cobrar sigue igual).
**Decide:** Felipe, 2026-10-14, en chat: «al aplicar algún tipo de porcentaje de descuento, la prenda no [debe] quedar con un precio en el que se tenga
que pagar céntimos, sino que debería redondearse para que sea más sencillo el pago y más entendible», y «volver a integrar la parte de ingresar
cantidades de dinero y no solo porcentajes». Eligió, con las opciones delante: **al S/ 0.10 hacia abajo** y **también campañas y etiquetas**.

## El problema primero

S/ 89.90 con 20 % se cobraba a S/ 71.92. La colaboradora tenía que pedir 2 céntimos que no existen en una moneda, y con tarjeta o Yape el precio seguía así
(ADR-0311 solo redondea el efectivo, y solo al cobrar). El ADR-0302 había elegido el céntimo exacto para que el «−20 %» del papel fuera verdad; Felipe lo
revisó el 2026-10-14: prefiere un precio que se paga fácil a un % exacto al céntimo.

## Decisión

```
DECIDÍ:    un % sobre un precio deja el PRECIO FINAL bajado al múltiplo de S/ 0.10 de abajo, y el descuento es lo que falta para llegar ahí:
           descuento = precio − floor(precio × (100 − %) / 10) / 10. S/ 89.90 con 20 % → 71.92 exacto → 71.90, descuenta 18.00; S/ 39.00 con
           20 % ya cae en 31.20 y no cambia. Una sola cuenta para el % manual, la campaña, las etiquetas y la proforma
           (`descuentoUnitarioPorPorcentaje`, en céntimos enteros; su gemela en la base es `retail.fn_descuento_campana`, 37 306 combinaciones
           comparadas sin una diferencia). El descuento en S/ (el monto que se escribe) vuelve al apartado «Descuento», por prenda, y NO se redondea:
           lo que se escribe es lo que se descuenta. Los topes que miran el descuento a mano —el 15 % del argumento y el 35 % del Líder en
           `registrar_venta`, el 20 % de `crear_proforma`— ahora miden contra «lo que da ese % con esta misma regla» (+1 céntimo de holgura, igual que antes).
DESCARTÉ:  (a) al sol entero hacia abajo: hasta S/ 0.99 de descuento extra por prenda, un «20 %» se cobra como 21 %, justo lo que Felipe rechazó en
           ADR-0302; (b) al más cercano: a veces sube el precio sobre el % anunciado, que es redondear en perjuicio del consumidor (Ley 29571 art. 44);
           (c) ampliar el redondeo del efectivo a tarjeta y Yape: tocaría cinco lectores de caja y conciliación bancaria por un cobro que ya es exacto
           en el banco, y el precio del papel seguiría con céntimos; (d) dejar los topes del 15, 35 y 20 % como estaban: el botón «15 %» regalaría hasta
           9 céntimos más que `round(precio × 0.15, 2) + 0.01` y la base pediría «escribe el argumento» a una colaboradora que tocó el botón (la
           prueba lo reproduce: con la función nueva y los topes viejos, el 15 % y el 35 % de un precio de S/ 39.00 fallan); (e) redondear también el
           monto en S/: quien escribe un monto ya decidió cuánto quiere descontar.
SE ROMPE SI: la web y la base no cambian en la misma ventana: con la base nueva y la caja vieja (o al revés) cada venta CON CAMPAÑA se rechaza
           en el mostrador (`venta_campana_omitida` o `venta_campana_monto_no_coincide`); el descuento a mano en % pasa en los dos órdenes (la base solo
           mira topes), por eso va primero la base. También si un precio de lista termina en céntimos que no son múltiplo de 0.10 y alguien espera un
           descuento exacto (el extra sigue siendo de 0 a 0.09), o si una pantalla nueva calcula un % a mano con `round(precio × %, 2)` en vez de la regla única.
```

## Qué cambió (y qué no)

- **Caja** (`apps/web/lib/vender-reglas.ts`): la regla, `descuentoUnitarioPorMonto`, `aplicarDescuentoMonto` y `descuentoPedido` (el modo elige cuál); el
  argumento pasado el 15 % se mide contra el descuento del 15 % con la regla nueva (`necesitaArgumentoEscrito`). Apartado «Descuento» de
  `PuntoDeVentaTicket.tsx`: un segmento «% | S/» (`SegmentoDeslizante forma="modo"`), atajos S/5, 10, 20, 50 y «Otro», y una línea bajo «Quedaría en» que
  explica por qué el % no da un precio «exacto». Etiquetas, apartados y proformas heredan la regla sin tocarse.
- **Base** (`20261014173000_descuento_precio_sin_centimos.sql`): el cuerpo de `fn_descuento_campana` (misma firma; la llaman `registrar_venta`,
  `separar_prendas` y `editar_separacion`), y tres reemplazos anclados: los topes del 35 y del 15 % en `registrar_venta` y el del 20 % en `crear_proforma`. Sin
  tablas, políticas ni disparadores. Re-ejecutable.
- **No cambia:** el redondeo del efectivo al cobrar (ADR-0311), el comprobante SUNAT (sale por la suma exacta de las líneas), el descuento del club
  (cumpleaños, aniversario) y los precios de lista.

## Producción

1. Pegar la migración (una parte, fuera del horario de tienda).
2. Publicar la web en la misma ventana y recargar Vender (F5) en cada caja antes de abrir.
3. **Reimprimir las etiquetas de campaña ya impresas**: dicen el precio exacto de antes (S/ 63.92) y la caja cobra S/ 63.90.
4. Si falla el paso 1 con «cambió desde que se escribió esta migración», `registrar_venta` o `crear_proforma` tienen otro cuerpo que el local: no se fuerza,
   se rehace el reemplazo sobre la versión viva (ADR-0288).

## Verificación (2026-10-14)

- Pila propia con las 592 migraciones al día: `pnpm pruebas:campana-redondeo` 16/16 (hay control negativo: con solo la función y sin parchar los topes
  fallan el 15 %, el 35 % y el 20 % de la proforma); `registrar_venta` 32/32, `club_cumpleanos` 34/34, `club_aniversario`, `club_venta_ligada`,
  `club_registro_cartel`, `redondeo_efectivo` 90/90, `apartados_proformas_candados`, `ventas_montos_validos` en verde. Las pruebas que vuelven a pegar el
  redondeo viejo conocen este parche (`registrar-venta-antes-de-precio-sede.mjs`).
- Web: 187 pruebas de `vender-reglas` (la propiedad exhaustiva ahora exige múltiplo de 0.10, nunca más que el % exacto y a menos de 10 céntimos de él) y
  toda la suite.
- Navegador, escritorio y 375 px (sin desborde): S/ 79.90 con 15 % → S/ 67.90, con 20 % → S/ 63.90, S/ 10 → S/ 69.90, S/ 13.33 (con argumento, pasa el 15 %) →
  S/ 66.57; el botón «Aplicar descuento» sigue apagado hasta tener motivo.

## Lo que queda abierto

- **Apartados con descuento manual y los vales del club** siguen con su propia cuenta: no entraron en lo que Felipe aprobó. El cumpleaños
  entró el 2026-10-15 (ver abajo); el vale de aniversario es un monto en soles, no un %, y por esta misma regla no se redondea.
- **Una proforma ya guardada** con el descuento exacto de antes sigue válida; al llevarla al carrito, si la campaña da más, gana la campaña (ya era así).
- Los reportes de «cuánto descuento se regaló» crecen hasta S/ 0.09 por prenda con %: es el costo de la decisión (≈ el que ADR-0311 midió para el efectivo).

## Actualización 2026-10-15 — el 10 % de cumpleaños también

**Decide:** Felipe, 2026-10-15, en chat, con una captura de la caja (Blusa Camisera Crop a S/ 59.90, «Cumpleaños del club · 10 % de la
compra −S/5.99», total S/ 53.91): «al aplicar el descuento de cliente por mes de cumpleaños, no me redondea como el otro descuento, haz que
también lo redondee para que no salgan esos céntimos de más».

```
DECIDÍ:    la parte del club de cada prenda es la MISMA regla de este ADR aplicada a lo que la prenda ya cobraba sin el club (su campaña o su
           descuento a mano, en cascada como CL-11): club = fn_descuento_campana(precio − descuento_sin_club, pct). S/ 59.90 al 10 % → 53.91
           → 53.90, el club pone 6.00; 79.90 con campaña de 20 % → 63.90 al 10 % → 57.51 → 57.50, el club pone 6.40 (el total sigue en 28 %).
           En la caja es `descuentoClubLinea`, que ahora llama a `descuentoUnitarioPorPorcentaje`: una sola cuenta del % en todo el ERP.
           La base (`registrar_venta`, migración 20261015182000, dos reemplazos anclados) la recalcula igual y, POR UN TIEMPO, también
           acepta la cuenta vieja (`round(… × pct / 100, 2)`, con el mismo céntimo de holgura).
DESCARTÉ:  (a) redondear el TOTAL de la compra en vez de cada prenda: el ticket impreso muestra el descuento de cada prenda y la nota de
           crédito devuelve por prenda; con el redondeo en el total, una prenda devuelta sola saldría con céntimos y otra cuenta distinta
           de la del cartel; (b) cambiar base y web a la vez sin aceptar la cuenta vieja: Vender nunca se recarga sola (ADR-0422) y una caja
           abierta desde antes de publicar seguiría mandando 5.99; la diferencia llega a 9 céntimos y la holgura es de 1, así que cada
           canje de esa caja se rechazaría con «El % del club pudo cambiar» hasta que alguien apriete F5, en plena venta; (c) aceptar la
           cuenta vieja para siempre: deja dos reglas vivas para lo mismo, justo lo que este ADR cerró.
SE ROMPE SI: la web se publica ANTES de pegar la migración (con la caja nueva y la base vieja, casi todo canje se rechaza con
           `cumple_descuento_distinto`); o alguien vuelve a escribir la cuenta del club a mano con `round(… × pct / 100, 2)` en una pantalla
           nueva; o se quita la transición mientras una caja siga abierta desde antes de la publicación.
```

**Una consecuencia que conviene saber:** con el S/ 0.10, toda prenda que cobra algo recibe algo del club, aunque cueste céntimos (una línea
de S/ 0.04 queda en 0.00). Por eso «un canje que no regala nada» (`cumple_sin_monto`) hoy solo se alcanza con la cuenta vieja; cuando se
quite la transición, solo con una compra que ya no cobraba nada.

**Verificación (2026-10-15):** pila propia con todas las migraciones de `main` + 20261015182000 (pegada dos veces: re-ejecutable):
`club_cumpleanos` 35/35 (caso nuevo de la transición: con 0.49 a mano la regla nueva da 8.01 y la vieja 7.94, las dos pasan y 7.97 no) con
control negativo (sin el parche, 4 en rojo; sin la transición, 2 en rojo), y en verde `redondeo_efectivo` 90/90, `club_registro_cartel`
38/38, `registrar_venta` 32/32, `club_aniversario` 29/29, `campana_redondeo` 16/16, `club_venta_ligada` 30/30, `club_permisos` 89/89,
`apartados_proformas_candados`, `ventas_montos_validos` y `analisis_lecturas`. Web: `club-cumple-canje-reglas` con la tabla de paridad nueva
y la propiedad de S/ 0.00 a S/ 300.00 con 6 % (precio múltiplo de 0.10, nunca menos que el %, a menos de 10 céntimos). Navegador (Chrome sin
ventana contra la pila, escritorio y 375 px sin desborde): Falda Ariana a S/ 64.90 con «Canjear 10 %» → «−S/6.50», total S/ 58.40; el
cobro con tarjeta y boleta guardó `descuento_club_unitario` 6.50, subtotal 58.40 y `club_canjes.monto` 6.50.

**Producción: PEGADO el 2026-10-15 (~13:36 Lima)** con la orden de Felipe, antes de publicar la web: sonda de solo lectura (huella de
`registrar_venta` `87a7ac58…`, cada ancla una vez, 0 canjes de cumpleaños vivos), ensayo de la migración entera terminado en excepción
(producción intacta después) y `apply_migration` (registrada como `20261015183602`). Después: huella `d6a866b1…` (la del ensayo), una sola
firma, permisos solo para `authenticated`, la cuenta nueva y una transición. La transición se quita con su propia migración una vez que
todas las cajas hayan recargado después de la publicación.
