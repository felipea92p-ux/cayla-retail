# ADR-0114 — Vender: el comprobante se imprime en la térmica de 80 mm (y los ajustes de la sesión)

**Fecha:** 2026-09-18
**Estado:** Aplicado en la rama `claude/local-work-3a718a` (commit `49ea93f`, fusionada con `main` el
2026-09-18; renumerado de ADR-0103, que `main` ya había dado a Familias, y luego de 0112 y 0113, que reclamaron otras
sesiones). Solo pantalla y un archivo de
configuración: **no hay migración, no se toca `registrar_venta`, ni el envío a SUNAT/Lucode.**
**Afecta:** `components/PuntoDeVenta.tsx`, `PuntoDeVentaCatalogo.tsx`, `PuntoDeVentaTicket.tsx`,
`ElegirTallaModal.tsx` (nuevo), `VentaRegistradaModal.tsx` (nuevo), `ReciboTermico.tsx` (nuevo),
`lib/recibo-reglas.ts` (nuevo), `lib/emisor.ts` (nuevo), `lib/vender-reglas.ts`, `app/globals.css`.

## Contexto

Al confirmar el cobro, el modal «Venta registrada» solo decía el total y «Boleta B001-000002
emitida». La clienta necesita el papel: el comprobante ya existía en la base (se emite dentro de la
misma transacción que la venta, `0011_venta_con_comprobante.sql`) pero **no había forma de
imprimirlo ni de ver lo que se cobró**. Además, en la misma sesión Felipe pidió varios ajustes al POS.

## Decisión 1 — Cómo imprimir: HTML de 80 mm con el diálogo del navegador

| Opción | Ganas | Pagas |
|---|---|---|
| **A. `window.print()` con HTML de 80 mm (elegida)** | Cero instalación; sirve con cualquier térmica ya instalada en Windows; el repo ya imprime etiquetas así | Márgenes y papel dependen del driver; sin corte automático ni cajón |
| B. ESC/POS crudo por WebUSB/WebSerial | Corte, cajón y velocidad | Solo Chrome; permiso por equipo; choca con el driver de Windows; mucho código frágil |
| C. Agente local (QZ Tray, PrintNode) | Impresión silenciosa muy robusta | Instalación y costo por tienda; excesivo para 3 tiendas |
| D. PDF de ticket de Lucode (`pdf.ticket`) | Es el documento oficial | Solo existe **después** de transmitir a SUNAT, hoy manual y con fallos posibles (principio 9) |

Se eligió **A** porque entrega el 100 % del valor hoy sin depender de hardware ni de un tercero. El
recibo es un componente aislado (`ReciboTermico`) y **todo número sale de una función pura**
(`lib/recibo-reglas.ts`): cambiar a B o C después es cambiar el «transporte», no el contenido. D queda
como «reimprimir el oficial» cuando la transmisión sea automática.

**Cómo funciona.** `#comprobante-print` se monta pegado a `<body>` (portal) mientras el modal está
abierto; en pantalla es `display:none`. En impresión, `body:has(#comprobante-print) > *:not(...)`
oculta todo lo demás con `display:none` — **no** `visibility:hidden`, que dejaría el alto ocupado y
sacaría metros de papel en blanco. Por eso Ctrl+P con el modal abierto también imprime el comprobante.
Solo negro sobre blanco (una térmica no tiene grises), papel de 80 mm con 72 mm de recibo y 4 mm de margen por lado (64 mm útiles: el cabezal de varias térmicas no llega al filo). `@page` va sin `size`
a propósito: `80mm auto` no es válido y `80mm` parte el ticket en cuadrados; el largo lo da el driver.

**Contenido (representación impresa de boleta/factura electrónica):** razón social, RUC, dirección,
tienda; tipo y serie-número; fecha y hora **de Lima**; cliente (nombre y DNI/RUC o «CLIENTE VARIOS»);
líneas con código de prenda, precio unitario y descuento; subtotal, IGV 18 % y total; «SON: … CON
81/100 SOLES»; medios de pago con recibido y vuelto; **QR con el formato de SUNAT**
(`RUC|tipo|serie|correlativo|IGV|total|fecha|tipo doc|num doc|`); leyenda y plazo de cambios (15 días,
`DIAS_PLAZO_CAMBIO`, R-38).

**Modal «Venta registrada» con información útil:** total y hora, **vuelto a entregar** (grande y
primero: es lo que la cajera hace con las manos), número y estado del comprobante, subtotal/IGV, pagos,
cliente y las líneas (desplegable). **Imprimir no cierra el modal:** si la térmica se atasca se
reintenta sin buscar la venta. Foco inicial en el botón principal.

**Adenda (misma tarde, tras simular una venta real): «Imprimir y nueva venta».** Medida la venta real
de punta a punta, el sistema tarda menos de medio segundo en total (tocar prenda → ticket 39 ms, confirmar
→ modal 197 ms); lo que cuesta son los **toques** (8, y 9 con el diálogo de impresión). Tras confirmar había
3 acciones (Imprimir, diálogo del navegador, Nueva venta). Ahora el botón principal —con el foco, o sea
**Enter**— imprime y cierra al recibir `afterprint` (con temporizador de respaldo de 4 s por si el navegador
no lo emite: sin él la caja quedaría trabada); cerrar ANTES desmontaría el recibo del `<body>`. Debajo, las
salidas raras: «Solo imprimir» (reintento, no cierra) y «Sin imprimir» (Esc hace lo mismo). Sin el diálogo
del navegador —Chrome con `--kiosk-printing` en la PC de caja— quedan **1 acción** y 2 toques menos por venta.
Guía de configuración en `docs/OPERACION-IMPRESORA-TERMICA.md`. Se descartó optimizar el viaje extra al
servidor tras el cobro: 197 ms no es un cuello de botella.

**El recibo sale de lo que se acaba de cobrar** (mismos ítems, descuentos y pagos que vio la cajera)
más lo que asignó la base (serie, número, fecha, estado). No se recalcula aparte: la suma de los
importes ES el total y `subtotal + IGV = total` al centavo con la misma cuenta que emite el comprobante.

## Decisión 2 — Los datos del emisor viven en el código (con override por entorno)

La identidad fiscal de CAYLA **no vivía en el repo ni en la base**: solo en la cuenta de Lucode y en
el ticket que hoy emite Alegra. Felipe entregó los datos el 2026-09-18 (ficha RUC y ticket actual) y
quedan en `lib/emisor.ts` como valores por defecto: **CAYLA S.A.C., RUC 20605964550, Mz. Q Lt. 26,
Urb. San Andrés V Etapa, Víctor Larco Herrera, Trujillo, La Libertad; +51 953 585 537;
caylaperu@gmail.com; www.cayla.pe; Régimen MYPE tributario; «Donde el estilo transforma»**.
Son datos públicos (van en cada boleta), no secretos: en el código, el ticket sale completo en
cualquier entorno sin configurar Vercel. Cada uno se puede sobreescribir con `NEXT_PUBLIC_EMISOR_*`
(pensado para cuando otra marca use el sistema).

**La «Autorizado mediante resolución N° …» NO se copió** del ticket de Alegra: esa es la resolución
del PSE de Alegra, no la de Lucode. `resolucion` queda vacía y se imprime solo si se configura
(`NEXT_PUBLIC_EMISOR_RESOLUCION`). Si falta el RUC o la razón social (override vacío), el ticket sale
sin QR y el modal avisa (`emisorCompleto`). Se descartó una tabla `emisor` o `ubicaciones.direccion`:
cambio de esquema en producción sin necesidad hoy.

**Diseño del ticket** (rediseño sobre el modelo de Alegra, que tenía la línea de ítem cortada, el
nombre del cliente enorme y una descripción genérica «Prendas Cayla»): logo del colibrí en negro
(`filter: brightness(0)`), marca espaciada, datos fiscales y de contacto completos, documento y número
enmarcados entre reglas dobles, ítems con su nombre y código, **TOTAL enmarcado entre reglas gruesas y
lo más grande**, «SON: …», forma de pago con recibido/vuelto, QR de SUNAT de 32 mm y pie con lema.
Solo negro sobre blanco (nada de grises ni fondos, que una térmica no imprime).

## Decisión 3 — Ajustes de Vender pedidos en la misma sesión

- **«Solo con stock»** pasa a interruptor propio en su fila (antes un chip perdido al final), **prendido
  cada vez que se entra**, con el conteo de agotadas ocultas. Revierte la decisión anterior de dejarlo
  apagado.
- **Tocar la tarjeta** abre un modal «Elige la talla» (grande, con stock por talla y dónde más hay de
  las agotadas). **Con una sola talla vendible se agrega directo**; con dos o más, modal; con ninguna,
  modal (explica dónde hay). Los chips de la tarjeta siguen como atajo. La tarjeta es un botón
  superpuesto (`absolute inset-0`) para no anidar botones.
- **Avisos de «no hay más stock»** por el sistema de avisos existente (`avisar`, arriba a la derecha,
  no toma el foco), no por una línea inline; más un **resaltado rojo suave de la tarjeta** (`anim-tope`,
  dos «respiros» + barrido de luz, sin temporizador: la `key` lo re-monta). Aprobado por Felipe.
- **Métodos de pago:** un color por método (efectivo cobrizo `#8f4a1e`, tarjeta plomo `#525a64`, yape
  morado `#6d3fa3`, plin verde `#1c6b56`, transferencia hazel `#6b5a1a`), todos AA sobre crema/papel y
  sobre su fondo de «elegido». **Son los mismos tokens que usa la dona de Caja:** allí efectivo pasa de
  azul a cobrizo, tarjeta de ámbar a plomo, y el segmento «Yape / Plin» sale morado.
- **Tocar de nuevo un método lo quita**, y al quitar uno **su monto pasa al siguiente** (`quitarPagoTraspasando`),
  para que la cajera no reescriba el total.
- **Globo del «!» (`Ayuda`) ya no se corta:** iba pegado al borde izquierdo del botón con ancho fijo y el
  panel del ticket (que scrollea por dentro) lo recortaba a media frase. Ahora, al abrir, mide el área
  realmente visible (ventana ∩ cada ancestro con `overflow`) y se acomoda dentro: se corre a la izquierda,
  se encoge si hace falta y se abre hacia arriba si no cabe abajo. Arreglado en el componente, no en la
  pantalla: `Ayuda` se usa en 15 lugares (Facturación, Proformas, formularios, Buscar…), que se benefician
  igual. Se descartó un portal a `<body>`: dentro de un `Modal` (Radix) un clic en el globo contaría como
  «afuera» y cerraría el modal.
- **Atajos F1–F5** (mejora #3 de la simulación de venta): cada tecla es un medio, en el orden del selector
  (F1 efectivo, F2 tarjeta, F3 yape, F4 plin, F5 transferencia); la regla es pura (`metodoDeAtajo`, con
  pruebas) y el padre la aplica en un `keydown` global, con las mismas guardas que el escáner (caja abierta,
  ningún modal). **En «cobrar»** hace lo mismo que tocar el chip (agrega con lo que falta; si ya estaba, lo
  quita y su monto pasa al siguiente). **En «armar», con prendas**, paga TODO con ese medio y salta al cobro —
  la tecla es una elección explícita de la cajera, no un default (ADR-0044); sin visual nuevo en «armar»
  (la fila «Cobrar con» se probó y se descartó por poco estética). `preventDefault` solo cuando actúa: F1
  abriría la ayuda de Chrome y F5 recargaría y perdería el ticket; con el ticket vacío, con modal abierto o
  con Ctrl/Alt/Shift/Meta o la tecla mantenida no se intercepta nada (Ctrl+F5 y Ctrl+R siguen recargando).
  Se enseña con una «F1»–«F5» chiquita en la esquina de cada chip y un `aria-keyshortcuts`. Verificado con
  teclado real en la app: F3 desde «armar» → cobro con Yape; F1 agrega, F3 quita y traspasa, F5 no recarga.
  **No incluye Enter para confirmar el cobro** (el foco vive en el escáner, donde Enter significa «agregar
  el código»): sería otra decisión.
- **Pie del ticket:** subtotal e IGV (18 %) junto al total, sin crecer (`desgloseIgv`, misma cuenta que
  `ComprobantesPanel`).

## Consecuencias / pendiente

- **Falta probar con la impresora real** (papel «80 mm rollo», márgenes ninguno, escala 100 %). Lo
  verificado es el HTML en modo impresión (solo el recibo visible, 72 mm exactos), no el papel. Para
  cero diálogos: Chrome con `--kiosk-printing` en la PC de caja.
- **Falta la resolución de autorización del PSE** (Lucode) si se quiere imprimir como el ticket de
  Alegra: `NEXT_PUBLIC_EMISOR_RESOLUCION`. No se copió la de Alegra (no es la de Lucode).
- **⚠️ Numeración al cambiar de PSE:** el último ticket de Alegra que vimos es `B001-00005806`
  (2026-09-18). Si la serie de boletas de este sistema también es `B001` y arranca en 1, SUNAT
  rechazará duplicados. Antes de emitir en producción hay que **continuar el correlativo o usar una
  serie nueva** — se verifica en `series_comprobantes`, no en este ADR.
- **El QR se probó como texto** (formato y orden, con pruebas), no escaneado con un lector.
- **«Nota de venta» NO existe** como opción de Vender: `TipoReciboFiscal` es `boleta | factura`. Es un
  documento sin valor tributario (ADR-0007) — decisión de negocio y de esquema aparte.
- **Reimprimir desde «Ventas de hoy»** no está: hoy solo se imprime al cobrar. Habría que reconstruir el
  recibo desde `venta_items` + `venta_pagos` + `comprobantes` (el vuelto no se guarda en la base).
- La **dirección por tienda** no existe (`ubicaciones` no la tiene); se imprime el domicilio fiscal.
- Una venta **sin conexión** no imprime: no tiene serie ni número hasta que suba.
- `comprobantes.estado` queda «pendiente de enviar» hasta transmitir; el ticket se imprime igual (la
  boleta puede transmitirse dentro del plazo de SUNAT). No se cambió esa integración.

## Verificación

- 414 pruebas en verde (29 archivos): +25 en `recibo-reglas.test.ts` (armado del recibo, QR de SUNAT,
  fecha de Lima, «SON: …»), +3 de `desgloseIgv` (incluye todos los totales de S/0.01 a S/500.00) y
  +6 de `quitarPagoTraspasando`. `tsc` y `eslint` sin errores.
- Navegador (Chromium de Playwright, ruta temporal sin sesión, borrada): modal con vuelto/pagos/cliente;
  recibo en modo impresión con solo `#comprobante-print` visible (72 mm); factura con RUC; emisor sin
  configurar (alerta, sin QR); venta sin conexión (sin botón de imprimir).
- **No se probó de punta a punta con una venta real** (el panel del navegador no tenía sesión): el
  cableado de `cobrar()` → `armarRecibo` compila y usa columnas existentes de `comprobantes`, pero la
  primera venta real es la prueba definitiva.
