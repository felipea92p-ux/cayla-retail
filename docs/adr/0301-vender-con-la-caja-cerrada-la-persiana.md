# ADR-0301 · Vender con la caja cerrada: la persiana y el cartel «Cerrado»

> **Renumerado el 2026-10-01 (antes 0298 y luego 0299).** El 0298 ya era el del costo atípico (#661) y el 0299 quedó repetido con «Recibir mercadería es de proveedores» (que lo cita una migración y no se puede renumerar). Las menciones «ADR-0301» en el código y los documentos son las de este.

- **Fecha:** 2026-10-01 · **Estado:** construido y probado en local (escritorio 1440 × 900 y 1366 × 768, celular 375 px). Solo web, **sin migración**.
- **Pedido:** Felipe, 2026-10-01: con la caja cerrada, que el POS no solo pierda opacidad. Quiere que todo el fondo se desenfoque y
  que en el medio aparezca un aviso grande de «Abrir caja», «sofisticado, elegante y con muchas animaciones». De tres maquetas
  (`docs/maquetas/caja-cerrada-2026-10/`) eligió la **B · Persiana** y pidió quitar el botón «Abrir caja» de la fila del POS.
- **Complementa:** ADR-0136 (movimiento de modales: dos excepciones nuevas, ver abajo), ADR-0149 (loader y avisos), ADR-0186
  (contar el cajón al abrir), ADR-0036 (ventas sin conexión).

## Problema
Con la caja cerrada, `PuntoDeVenta.tsx` apagaba el catálogo y el ticket con `opacity-50` y dejaba un botón chico «Abrir caja»
en la fila de arriba. El POS se seguía viendo casi igual: una colaboradora nueva lo leía como «la pantalla anda lenta» o «no
me deja», no como «falta abrir la caja».

## Decidí
- **La persiana tapa toda el área de trabajo, no solo la tarjeta del POS** (`components/punto-de-venta/CajaCerrada.tsx`):
  `position: fixed` bajo la cabecera y a la derecha del menú lateral, que quedan nítidos y se pueden usar (cambiar de sede, ir a
  otra pantalla). Va por portal a `body`: una entrada de pantalla con `transform` volvería relativo su `fixed`. El alto de la
  cabecera se mide (`ResizeObserver`): no es el mismo en celular y en escritorio.
- **Detrás, el POS queda `inert`** (en lugar de `pointer-events-none` + `opacity-50`): ni el mouse ni el teclado llegan. Los
  `disabled` de cada control se quedan: son lo que dice «no se puede» si algo llegara por otro camino.
- **Un solo botón, grande, con el foco.** Enter abre la caja (con la caja cerrada el escáner no tiene dónde escribir). Si el
  modal «Abrir caja» se cierra sin abrir, el foco vuelve a ese botón.
- **El cartel dice desde cuándo y quién cerró** («Tienda Trujillo · desde ayer, 21:04»; abajo, «Último cierre ayer, 21:04 ·
  Rosa · En el cajón S/ 200.00»). Sale del mismo `getUltimoCierre` que ya leía `vender/page.tsx` para el fondo; lógica pura en
  `lib/caja-cerrada-reglas.ts`, con su prueba (hora de Lima, hoy/ayer/fecha, sin nombre, sin fondo, sede sin cierres).
- **El formulario no cambia:** es `AbrirCajaFormV2` dentro de `<Modal>`, como antes.
- **La salida espera al loader** (`lib/espera-estado.ts`, la misma regla que los avisos): al abrir, `router.refresh()` deja
  «Cargando» a la vista un rato más, y el cartel giraba entero detrás de él. Ahora la capa pasa por `por-abrir` (ya no se toca,
  el cartel sigue diciendo «Cerrado»), gira a «Abierto» cuando la pantalla queda libre y la persiana sube. Si el loader se
  colgara, gira igual a los 4 s.
- **El foco termina en el escáner.** El loader vuelve `inert` todo mientras está a la vista. Al irse, intentaba devolver el foco
  al botón del modal, que ya no existe, y el foco caía en el `body` (pasaba también antes de este cambio). Cuando el cartel
  empieza a girar, la persiana enfoca el buscador si el foco está en el `body`. Además, el destino del modal se decide al
  cerrarse y no al dibujarse (`focoTrasAbrirCaja` en `PuntoDeVenta.tsx`).
- **Las ventas sin conexión se siguen viendo** (ADR-0036): `PuntoDeVentaColaOffline` también se pinta dentro de la persiana,
  bajo el botón. «Descartar» se puede tocar con la caja cerrada.

## Excepciones a la regla de movimiento (ADR-0136), elegidas por Felipe con la maqueta
La regla dice «sin rebote, nunca en bucle». Al elegir la B, Felipe eligió también:
1. **Un rebote amortiguado, una sola vez:** el cartel cae colgado de su clavo y se mece hasta quedar quieto (1,7 s).
2. **Tres bucles suaves mientras la caja sigue cerrada:** el punto rojo del cartel que late (es señal, como el del chip
   «Vencida»), un reflejo de luz que cruza la persiana cada 8 s y el cartel que se mece ±0,9°. El meneo y el reflejo se paran
   en cuanto la caja abre.

Todo se apaga con `prefers-reduced-motion`; en ese caso la capa desaparece sin salida. Están escritos también en la
«Actualización 2026-10-01 (d)» del ADR-0136 y en `app/estilos/caja-cerrada.css`.

## Descarté
- **Desenfocar solo la tarjeta del POS:** la fila de «Más» y el resumen de hoy quedaban al lado, nítidos, y la pantalla no
  decía «esto está cerrado» de un vistazo.
- **Tapar también la cabecera:** con la caja cerrada hay que poder cambiar de sede (la caja de otra sede puede estar abierta).
- **Dejar el botón chico en la fila además del grande:** quedaba tapado por la persiana, y dos botones para lo mismo confunden.
- **Que el cartel gire al confirmar el formulario** (antes de que la base responda): diría «Abierto» de una caja que todavía
  podría rechazarse.

## Se rompe si
- `AppShell` deja de tener un único `<header>` fijo arriba: la capa mide el primero que encuentra.
- Alguien quita el `inert` del POS confiando en la capa: el teclado volvería a llegar al catálogo de atrás.
- Se cambian las duraciones de `caja-cerrada.css` sin `TIEMPOS_SALIDA` (la prueba exige que el giro y la subida terminen
  antes de desmontar).

## Cómo se verificó
`lib/caja-cerrada-reglas.test.ts` (11 casos), suite completa, `tsc` y eslint. En el navegador, contra la base local (Tienda
Trujillo, cerrada): la persiana llega al cargar y al cerrar la caja desde «Más ▸ Cerrar caja»; Enter abre el formulario; Escape
devuelve el foco al botón; al abrir, las fases medidas fueron `cerrada` → `por-abrir` (con el loader) → `girando` → `subiendo` →
desmontada (~2,3 s después de que el loader se fue), con el foco en «Escanea la etiqueta…». La caja de prueba se abrió y se
cerró dos veces, cuadrando con el mismo fondo (S/ 219.90): la base local quedó como estaba. Se verificó a 1440 × 900,
1366 × 768 (el botón queda a 589 px) y 375 × 812, sin nada fuera del ancho.

## Actualización 2026-10-01 (b) — el menú plegado y una hoja más ancha (Felipe, con captura)
- **Con el menú lateral plegado quedaba una franja del POS sin cubrir.** La capa usaba `sm:left-lateral`, pero va por portal
  a `body` y el token `--spacing-lateral` solo cambia dentro del contenedor de `AppShell` (`data-lateral="plegado"`): plegada,
  la capa seguía empezando a 272 px. Ahora mide la cabecera fija (su borde izquierdo es donde termina el menú; su borde de
  abajo, donde empieza el contenido) con `ResizeObserver`. Al plegar, el ancho de la cabecera cambia en cada cuadro y la
  capa la sigue durante toda la transición (medido: 272 → 220 → 140 → 93 → 76 px, siempre igual a la cabecera).
- **Pantalla grande:** desde 1800 × 1000 el cartel, el título y el botón crecen un escalón, para leerse de lejos.
- **La hoja «Abrir caja» era angosta y larga** (384 px; con «Nadie de turno» llegaba a ~840 px de alto). En Vender pasa a
  `max-w-xl` (576 px) y `AbrirCajaFormV2` recibe `enHoja`: sin tarjeta dentro de la hoja, sin repetir «Abrir caja» sobre
  el título, y las dos opciones lado a lado. Medido a 1366 × 768: ~440 px de alto, y ~650 px con «Nadie de turno» (termina
  a 709 px, a la vista). En `/caja` el formulario no cambia.
- Verificado a 2560 × 1440, 1920 × 1000 (plegando el menú), 1366 × 768, 1280 × 640, 1024 × 768, 768 × 1024, 640 × 800 y
  375 × 812: la capa calza con la cabecera y con los bordes, el botón queda a la vista y nada se sale de lado.
