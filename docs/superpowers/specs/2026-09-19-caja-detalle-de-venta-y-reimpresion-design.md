# Caja: «Ver todo», detalle de venta y reimpresión (ticket y boleta A4)

**Fecha:** 2026-09-19 · **Estado:** aprobado por Felipe; construido (ver «Desvíos respecto de este spec» al final) · **Rama:** `claude/caja-cabecera-atelier`

## Qué se quiere

Desde la tarjeta «Movimientos recientes» de Caja:

1. Un enlace **«Ver todo»** (arriba a la derecha) que abre un modal con todos los movimientos, sin que la pantalla se alargue.
2. **Clic en una venta** → modal con todo el detalle de esa venta y dos botones para **reimprimir**: **ticket** (térmica de 80 mm) y **boleta A4**.
3. Que la reimpresión del ticket **salga con el vuelto**, como el original.

## Fuera de alcance

- Detalle de ingresos y egresos (no se pidió; siguen siendo filas sin clic).
- Notas de crédito/débito, envío del comprobante por correo o WhatsApp.
- Cambiar cómo se ve el ticket térmico que ya existe.

## Decisiones (y por qué)

| # | Decisión | Por qué |
|---|---|---|
| D1 | El vuelto se **guarda**: columna `venta_pagos.recibido`. | Hoy la pantalla de Vender lo sabe pero solo manda `{método, monto}`; sin guardarlo no hay reimpresión fiel. Una sola fuente de verdad (principio 4). |
| D2 | Las ventas anteriores a la migración **no tienen** `recibido`: su ticket sale sin línea de vuelto. | Es un dato que nunca se guardó; inventarlo sería mentir en un documento. |
| D3 | El A4 se arma **desde nuestra fila `comprobantes`** (más ventas/ítems/pagos), no desde Lucode. | De Lucode solo guardamos `pdfUrl/xmlUrl/cdrUrl`, `hash` y `estado` en `respuesta_sunat`. Lo estructurado (serie, número, cliente, ítems, subtotal, IGV, total) ya está en nuestra base y es lo mismo que se le mandó. Leer el XML de Lucode en cada impresión sería depender de una API externa (principio 9) sin ganar datos. |
| D4 | Se copia la **estructura** de la boleta A4 de Alegra (`Ticket de venta B002-00009380.pdf`), con el logo y la tipografía de CAYLA. **No** se copia «Autorizado mediante resolución N° 034-005-0004781». | Esa resolución es la de Alegra, no la de Lucode; `lib/emisor.ts` ya la deja vacía a propósito y solo se imprime si se configura. Tampoco «Generado en alegra.com». |
| D5 | Una venta **sin** comprobante no ofrece impresión: el detalle dice «Sin comprobante». | Hoy no ocurre (producción: 9 ventas, 9 con comprobante, porque `registrar_venta` emite la boleta en la misma transacción). Una venta guardada sin internet ni siquiera aparece en la lista hasta que sube. Solo es una salvaguarda. |
| D6 | Estados del comprobante: `aceptado`, `pendiente`, `enviado` → se puede imprimir (los dos últimos con la leyenda «pendiente de validación en SUNAT»). `rechazado` y `anulado` → botones apagados con el motivo. | Un papel que parezca válido y no lo sea es peor que no imprimirlo. **Propuesta, a confirmar.** |

## Diseño

### 1. Vuelto guardado (base + Vender)

- Migración `supabase/migrations/20260919210000_venta_pagos_recibido.sql`:
  - `alter table venta_pagos add column if not exists recibido numeric(12,2)`.
  - Candado: `check (recibido is null or (metodo = 'efectivo' and recibido >= monto))`. El vuelto se calcula (`recibido − monto`), no se guarda: una sola cifra que no se desincroniza.
  - `registrar_venta`: `create or replace` con la **misma firma** (`p_pagos` sigue siendo `jsonb`; solo se lee `recibido` de cada elemento y se inserta). Sin sobrecargas nuevas.
- Front: `PuntoDeVenta.tsx` (hoy línea ~771) envía `recibido` solo para efectivo; `lib/ventas-offline.ts` lo conserva en la cola (mismo RPC al reintentar). El arqueo/cierre de caja **no cambia**: sigue sumando `monto`.
- Producción: se entrega también `pegar-en-produccion-venta-pagos-recibido.sql` (con `retail.`). **Lo aplica Felipe**; yo no toco producción. Al aplicarlo hay que refrescar el volcado del diccionario (regla de oro de `docs/datos/`).

### 2. «Ver todo» + detalle + ticket (Caja)

- En `CajaAbiertaPanel`: la lista `eventos` se calcula **completa** (hoy corta con `.slice(0, 8)`); la tarjeta muestra las 8 primeras y el modal todas. «Todos» = las mismas fuentes de hoy: ventas del día de la sede (`fn_ventas_del_dia`) + movimientos de esta caja.
- `MovimientosCajaModal` (nuevo): la lista completa con scroll interno y el mismo aspecto de fila. Las filas de venta son botones.
- `DetalleVentaModal` (nuevo): al abrir lee la venta y muestra hora, vendedor, cliente, prendas (talla, color, precio, descuento), pagos con vuelto, subtotal/IGV/total y el comprobante con su estado.
- Lectura: `lib/venta-detalle.ts` con el cliente de Supabase del navegador (RLS decide quién ve qué; mismo patrón que `PuntoDeVenta` con `comprobantes`) y una función **pura** que arma el `ReciboVenta` desde las filas, reutilizando `armarRecibo`.
- Ticket: reutiliza `ReciboTermico` y el patrón de impresión de `VentaRegistradaModal` (portal a `<body>` + `window.print()`).

### 3. Boleta A4

- `BoletaA4.tsx` + `lib/boleta-a4-reglas.ts` (cálculos y textos puros, con pruebas). Sirve para boleta y factura (`TITULO_DOCUMENTO`).
- Estructura (del PDF de referencia): cabecera con logo, razón social, domicilio fiscal, teléfono, correo, web; a la derecha RUC, título del documento y `No. serie-número`; recuadro de cliente (Señor(es), Dirección, Teléfono, DNI/RUC) y fechas de emisión y vencimiento; tabla de ítems (Cantidad, Unidad de medida, Ítem, Valor unitario, Descuento, Total) con «SON: … soles» al pie; QR (`textoQrSunat`) con moneda y fecha/hora; Notas; importes (Importe de venta, Op. gravada, inafecta, exonerada, IGV 18 %, Total); «Elaborado por» y «Aceptada, firma y/o sello y fecha»; pie «Representación impresa de boleta de venta electrónica».
- Datos que no tenemos y cómo se resuelven: dirección y teléfono de la clienta (no se guardan → el campo queda vacío); unidad de medida (siempre «Unidad»); vencimiento (= emisión, contado); «Elaborado por» = el vendedor; notas = «Visite www.cayla.pe para más.» y el plazo de cambio de `DIAS_PLAZO_CAMBIO`; hash de `respuesta_sunat` en letra chica.
- Mejoras sobre el original de Alegra: valor unitario con **2 decimales** (allá salía «S/42.288136»); el descuento se muestra como **importe** por unidad (es lo que guardamos), no como %.

#### Dirección de diseño (pedido de Felipe: mejorar la base de Alegra con lo mejor de las boletas)

La estructura de arriba es el piso legal; el aspecto se mejora así. Todo lo de esta lista es propuesta y se aprueba con la maqueta (ver «Orden de entrega»).

- **Jerarquía.** Lo que la clienta busca —el **total**— y lo que exige SUNAT —**RUC, tipo y número**— son lo más visible. En el original todo pesa igual y hay mucho vacío: la tabla tiene alto fijo, el QR flota lejos de los importes.
- **Cabecera.** El colibrí y el nombre CAYLA en terracota (la marca, nada más en color); razón social y domicilio fiscal compactos en 2–3 líneas, no 5 centradas. RUC, tipo y número van dentro de **un recuadro fino** a la derecha.
- **Tipografía.** La serif de la casa para la marca y las cifras grandes; DM Sans para los datos. Columnas de dinero alineadas a la derecha con cifras tabulares, para que los centavos caigan en línea.
- **Impresión que sobrevive.** Bordes y filetes finos con un tinte muy suave en los encabezados de tabla, sin depender de fondos oscuros: tiene que verse bien en láser en blanco y negro. Márgenes de 12 mm y nada bajo 8 pt.
- **Tabla de ítems.** Crece con las líneas (sin alto fijo); con muchas líneas pasa a la página siguiente **repitiendo el encabezado**. Cada ítem lleva el nombre arriba y, en gris debajo, código, talla y color. «Unidad de medida» se conserva (SUNAT la pide) pero en una columna angosta.
- **Banda inferior.** El QR con su hash a la izquierda; a la derecha los importes, con el **Total en un recuadro destacado**; «SON: … soles» justo debajo de la tabla.
- **Lo que Alegra no dice y a la clienta le sirve.** La tienda donde compró, la forma de pago con el vuelto y quién la atendió.
- **Firmas.** «Elaborado por» y «Aceptada, firma y/o sello» solo en la **factura**; en la boleta de contado sobran.
- **Estado.** Si el comprobante está pendiente de validación, una leyenda discreta lo dice (D6).
- Impresión: dos raíces (`#comprobante-print` para el ticket, `#boleta-a4-print`) con páginas nombradas de CSS (`@page ticket { size: 80mm auto }`, `@page a4 { size: A4 }`) para que un mismo `globals.css` sirva a ambos sin pisarse.

## Errores y degradación

- Si la lectura de la venta falla: el modal dice «No pudimos cargar esta venta» con «Reintentar»; la lista sigue usable.
- Sin internet: el detalle no abre (necesita la base); la lista y «Ver todo» siguen funcionando con lo ya cargado.
- Si el navegador no emite `afterprint`, el patrón existente de `VentaRegistradaModal` ya lo cubre.

## Pruebas y verificación

- Vitest, con la lógica pura: armar el recibo desde filas (con y sin `recibido`), vuelto por pago, valor unitario sin IGV, líneas del A4, estados imprimibles.
- Migración: `migration up --local` y un `insert` dentro de `BEGIN … ROLLBACK` que pruebe el candado (`recibido < monto` falla; NULL pasa).
- Navegador: «Ver todo» con más de 8 movimientos; clic en venta; ambos botones de impresión (vista de impresión); venta antigua sin vuelto.

## Orden de entrega (cada paso se prueba solo)

1. **Vuelto** (migración + Vender + cola offline).
2. **«Ver todo» + detalle + ticket.**
3. **Boleta A4**, en dos tiempos: primero una **maqueta** en HTML con los datos del PDF de referencia (la boleta B002-00009380) para que Felipe la apruebe o pida cambios; recién después se conecta a los datos reales.

## Riesgos y regla de despliegue

- **Orden con producción:** el detalle lee `venta_pagos.recibido`. Si el código llega a producción (Vercel despliega cada push a `main`) antes de la migración, esa lectura falla. **La migración se aplica primero.**
- **Redondeo del A4:** los totales por línea se muestran sin IGV y su suma puede diferir 1 centavo de «Op. gravada» (la base la calcula del total). Se decide en el plan: mostrar `subtotal` de la base y ajustar la última línea, o mostrar el total con IGV por línea.
- **Sin captura de la impresión real:** el aspecto de la térmica y del A4 impreso hay que mirarlo en la impresora de Felipe; en pantalla solo se ve la vista previa.

## Desvíos respecto de este spec (2026-09-19, al cerrar)

- **«Importe de venta» volvió** al bloque de importes (Felipe lo pidió al ver la maqueta): es el total con
  IGV, sobre la «Op. gravada». La dirección de diseño decía que se retiraba por repetir el TOTAL.
- **No hay `pegar-en-produccion-….sql` aparte**: la migración `20260919210000_venta_pagos_recibido.sql` ya lleva
  `retail.` y su `search_path`, y se pega tal cual.
- **La dirección de la clienta sigue sin guardarse.** El A4 la muestra solo en factura y en blanco; guardarla
  es un cambio aparte (columna en `comprobantes` y llevarla a Lucode).
- **El centavo de ajuste** quedó como decía el spec (opción A): se le da a la última línea de `lineasA4`.
- **Se agregó un texto lateral** de bajo contraste, «Generado por Cayla POS - Contacto: info@cayla.pe»: va en un
  canal de 6 mm DENTRO del área imprimible (Chrome no imprime en el margen de la hoja) y `fixed` al imprimir
  para repetirse en cada hoja.
- **El correlativo del A4 va a 8 dígitos** (`B002-00009380`, como la representación impresa de SUNAT); el ticket y
  el resto de la app siguen con 6.
- **Mientras se construía** salieron, por pedido de Felipe y en otra rama (`claude/vender-cobro-guiado`), el cobro
  guiado de Vender, el campo de monto que se vacía y el reparto del restante entre dos medios.
