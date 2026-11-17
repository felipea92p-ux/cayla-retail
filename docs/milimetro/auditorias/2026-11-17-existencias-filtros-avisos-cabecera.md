# Auditoría al milímetro — `/inventario` en el celular: «Filtros» y «Avisos» en la fila de íconos de la cabecera, la hoja «Avisos» y el menú «Más» que abre hacia donde cabe · 2026-11-17 · `claude/alerts-filters-layout-566ac2` (sobre `b149385ca`)

Medido: 375×812 claro quieto (así arranca el aparato) · 375 oscuro · foco con teclado · latido en vivo y en quieto · 1440×900 claro (que no cambie, y el menú hacia abajo con el mouse). Servidor: `localhost:3110` (base local, sede Lima).
«Filtros» y «Avisos» en la cabecera viven solo bajo 640 px: desde 640 px el botón de filtros sigue en la barra del buscador y el aviso sigue siendo la franja sobre las tarjetas (medido a 1440). El menú «Más» cambia en todo ancho.

Resumen: **0 graves · 0 medias · 0 leves abiertas** · 2 medias propias corregidas · 1 leve propia corregida · 1 leve heredada corregida · 3 heredados de piezas del sistema.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Fila de íconos a 375: «Ajustar stock», «Resumen», «Filtros», «Avisos» | cuatro de 44 × 44 px, a 12 px uno de otro (`gap-x-3`), en una sola línea (228 de 343 px) | 44 px con el dedo (ADR-0611 mejora 5); escala de 4 px | pasa |
| «Filtros» de la cabecera | abre la hoja de filtros; con un filtro puesto lleva su punto y se anuncia «Filtros · 1 puesto» | pieza `BotonFiltros` (ADR-0358, `accion.filtrar`) | pasa |
| Buscador a 375 | su caja mide 259 px: gana el lugar del botón (52 px con el dedo) y el texto de ayuda («Prenda, talla o código…» en Lima) cabe entero | — | pasa |
| Primera prenda a 375 | empieza en y = 428. La franja de antes (solo el título) medía ~106 px más 12 de aire en la captura de Felipe a 350 px; con su explicación, que antes no cabía, serían 247 px (medido forzándola a la vista) | — | pasa |
| Ícono «Avisos» | `PendienteDeCabecera` con su «1» en ámbar; el lector oye «1 aviso» | pieza de los pendientes de cabecera (ADR-0136 act. 2026-11-17) | pasa |
| Latido | vivo: `cayla-pulso` 2,2 s, sin fin; quieto: 0,01 ms, una vez (no se mueve) | ADR-0625: quieto es quieto; avisa el número | pasa |
| Hoja «Avisos» | 334 px de alto; la × de 44 × 44; «Cuadrar el piso» de 325 × 44; el aviso es `role="status"` y trae su explicación | una salida a la vista (`conCerrar`: la hoja solo se lee) | pasa |
| Foco con teclado en la fila | 4 de 4 con su anillo; ninguno tapado por la cabecera | WCAG 2.4.7 y 2.4.11 | pasa |
| Foco al cerrar la hoja «Avisos» | vuelve al ícono, con Escape y con la × | WCAG 2.4.3 | pasa (tras el arreglo 2) |
| Menú «Más», botón a 120–340 px del borde (no cabe arriba) | abre hacia ABAJO, entero, sobre la tarjeta siguiente; no pasa de la barra «Escanear prenda» (y = 756) | que ninguna opción quede tapada | pasa |
| Menú «Más», botón desde 352 px (cabe arriba) | abre hacia ARRIBA, a 10 px de la cabecera | ADR-0185: arriba no alarga la página | pasa |
| Menú «Más» con el mouse a 1440 (la tarjeta lleva `transform`) | la tarjeta sube a `z-index: 2` y el menú queda al frente en los tres puntos medidos | — | pasa |
| La página al abrir «Más» | 0 px de salto, la primera vez y las siguientes, en los dos lados | ADR-0185 | pasa (tras el arreglo 1) |
| Opciones del menú con el dedo | 47 px (las de una línea), 70 y 91 (las que dicen su motivo) | 44 px con el dedo | pasa (tras el arreglo 3) |
| Oscuro a 375 | la fila, el «1» en ámbar y la hoja se leen; nada queda claro sobre oscuro | ADR-0336 | pasa (a ojo, en captura) |

## Corregido en el camino

1. **Media (propia).** La primera vez que el menú «Más» abría hacia abajo, la página saltaba ~540 px y el menú quedaba junto al borde de abajo: el foco a la primera opción corría antes de que el menú cambiara de lado, y el navegador centraba la opción tapada. Ahora el foco no desplaza (`preventScroll`): el lugar ya garantiza que se ve. `components/existencias/PieTarjeta.tsx`.
2. **Media (propia).** Al cerrar la hoja «Avisos» con la ×, el foco caía al `body`: el clic de la × (un portal) subía por React hasta el ícono y se guardaba como «a dónde volver». Ahora solo cuentan los clics que nacen en el ícono. `components/existencias/AvisosExistencias.tsx`.
3. **Leve (heredada).** Las opciones de una línea del menú «Más» medían 39 px con el dedo y van una pegada a la otra. Ahora 47. `PieTarjeta.tsx`.
4. **Leve (propia).** El lector oía «1 pendientes» en el ícono de avisos. `PendienteDeCabecera` acepta `queCuenta` y aquí dice «1 aviso»; en Productos sigue igual.

## Heredado de piezas del sistema (no se toca aquí)

- Los puntos de color de la tarjeta (`vitrina-punto`): el elegido solo cambia de color. Es dato de la prenda; ya está en el tablero.
- «Página anterior» apagada sin motivo a la vista (`paginas-n`): propuesta 3 de `/milimetro`.
- Cifras de DM Sans sin tabulares: propuesta 1 de `/tipografia`.

## Sin medir

- El contraste de los cuatro íconos de la fila: son vidrio y el medidor de color no los resuelve desde el navegador; los cubre `lib/vidrio-contraste.test.ts`, que pasa.
- El medidor de color no leyó textos a 375 (los dio por tapados): lo que cambió usa solo piezas del sistema (`Aviso`, `Modal`, `BotonVer`, `Globito`), sin color propio.
- El latido no se vio correr en pantalla: este aparato tiene las animaciones apagadas. Se midió por su CSS con `data-movimiento="vivo"`.
- Una sede que ya cuadró su piso (en la base local ninguna): ahí el ícono no se dibuja; visto solo por el código.
- Un teléfono de verdad: todo se midió con el navegador emulando 375 × 812 con puntero grueso.
