# ADR-0106 — «Atelier»: el diseño visual de Cambios y Devoluciones

**Fecha:** 2026-09-19 · **Estado:** aceptado (elegido por Felipe entre tres maquetas) ·
**Alcance:** solo presentación. Ninguna regla, RPC ni tabla cambia; los flujos de
[ADR-0104](0104-cambios-flujo-guiado-motivo-y-estado-de-prenda.md) y
[ADR-0105](0105-devoluciones-mismo-modelo-que-cambios.md) siguen tal cual.

## Contexto

Con el flujo guiado ya construido, Felipe pidió verlo «más estético y sofisticado, con más
animaciones» antes de decidir. Se armaron tres propuestas interactivas con los mismos datos
—**A · Atelier** (papel y hilo), **B · Tablero** (cabecera oscura, vidrio) y **C · Vitrina**
(la prenda al centro)— y eligió la A, pidiendo solo aterrizar más a CAYLA la cabecera.

## Decisión

Atelier: lo más cercano a la identidad que ya existe (crema, papel, tinta, taupe, la serif
de la casa) y la única que no pide un segundo sistema de color. Lo que la define:

- **El hilo.** Una línea taupe cose el recorrido: la línea de tiempo de la actividad (un nudo
  por día), el hilo de los pasos (punteado, con el tramo cosido en tinta y una chispa que lo
  recorre) y el que une la prenda que sale con la que entra. Se dibuja al aparecer.
- **Cabecera aterrizada a CAYLA** (`EncabezadoPagina`): arriba, la sede y la fecha y hora de
  Lima —viva, `FechaHoraLima`— con un hilo trazándose al lado; el título en la serif a 46 px
  (más presencia que el 30 de las otras pantallas, sin gritar); y a la derecha el resumen de la
  sede (`ResumenSede`), cada cifra centrada sobre su etiqueta. La maqueta llevaba el título a
  66 px y el mes/fecha inventados: aquí son los reales y la escala se ajustó a la de la app.
- **Movimiento con significado.** Las cifras suben hasta su valor, los checks se trazan al
  cumplirse cada revisión, el anillo se llena, las prendas se ladean al pasar el mouse y los
  botones oscuros tienen un destello. Lo que se repite para siempre (hilo que corre, botón que
  gira) es adorno y se detiene con `prefers-reduced-motion`; lo que informa, se acorta a 1 ms.
- **Lo nuevo que sí informa**: el panel «Lo que revisa el sistema» lleva un anillo con cuántas
  revisiones van y el plazo (verde/rojo), y desde el paso 3 muestra el **impacto** en inventario
  y caja mientras se elige, no solo en la confirmación. Cada talla dice cuántas hay en el piso.

- **Botones como «Cobrar» de Vender** (ajuste del mismo día, pedido de Felipe): las primeras
  versiones eran píldoras (`rounded-full`) con texto normal y no se parecían a nada del resto del
  sistema. Ahora `BotonPrincipal`, `BotonSecundario`, `BotonRojo`, «Iniciar cambio/devolución» y
  «Buscar» usan la esquina apenas redondeada (`rounded-md`) y la etiqueta en mayúsculas chicas
  (`label-cayla`, 11 px); si hay monto —«Confirmar cambio S/ 10.00»— va a la derecha en la serif.
  Los atajos «Escanear prenda» y «Sin comprobante» siguen siendo píldoras, a pedido suyo; el campo
  de búsqueda pasó de píldora a `rounded-xl` para que el botón cuadrado quepa bien dentro.

## Cómo está hecho

- `globals.css`: `anim-sube`, `hilo-dibuja`, `hilo-vertical`, `hilo-corre`, `check-trazo`,
  `anillo-progreso`, `boton-brillo`, `aguja-hilo` y sus keyframes `cayla-*`, con su bloque en
  `prefers-reduced-motion`. Reutiliza el barrido `cayla-brillo` que ya existía.
- Piezas nuevas: `ui/EncabezadoPagina`, `ui/FechaHoraLima`, `ui/CifraAnimada`. Piezas
  reestilizadas (sin tocar su lógica): `BuscadorVentas`, `ComprasAgrupadas`, `FlujoGuiado`
  (`Pasos`, `PanelValidaciones`, botones), `CambioResumen`, `CambioReemplazo`.
- Como Cambios y Devoluciones comparten esas piezas, **las dos pantallas cambian a la vez**.

## Se descartó

- **B · Tablero** y **C · Vitrina**: más llamativas, pero cada una pedía un lenguaje aparte
  (vidrio sobre fondo oscuro; tarjetas de prenda a gran tamaño con foto) que las alejaba del
  resto del sistema. Las maquetas ya no existen en el repo; si se retoma alguna, se rehace.
- **Un título de 66 px**: se veía bien sola y desentona junto a las demás pantallas.

## Verificación

Con los componentes reales y datos de ejemplo (ruta temporal, ya borrada) a 1620 px: inicio,
paso 3 con el impacto en vivo, paso 4 y el flujo de Devoluciones. `tsc`, `eslint` y las 437
pruebas en verde. **No** se hizo clic real con la sesión de Felipe sobre datos reales.
