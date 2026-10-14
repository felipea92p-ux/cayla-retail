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

- **Apartados con descuento manual, el cumpleaños y los vales del club** siguen con su propia cuenta: no entraron en lo que Felipe aprobó.
- **Una proforma ya guardada** con el descuento exacto de antes sigue válida; al llevarla al carrito, si la campaña da más, gana la campaña (ya era así).
- Los reportes de «cuánto descuento se regaló» crecen hasta S/ 0.09 por prenda con %: es el costo de la decisión (≈ el que ADR-0311 midió para el efectivo).
