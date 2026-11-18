# Auditoría al milímetro — los descuentos de Campañas y ofertas · 2026-11-18 · `claude/ofertas-pending-branch-11c351`

Medido: 1440×900 claro (quieto, que es como arranca) · 1440 oscuro (tema guardado y la página recargada, no a mitad del cambio) · 375×812 claro con
puntero táctil · foco con teclado. Servidor: `localhost:3012` contra la base propia de la rama (Tienda Lima). Los siete medidores de `/milimetro`, con la raíz
en cada pieza nueva (`.lc-panel`, `.lc-descuentos`, la hoja `[role=dialog]`).
Alcance: lo que nace con ADR-0677 (actividades 1 a 5 de la maqueta `docs/maquetas/campanas-simple-2026-11/`): la fila de un descuento y «Nuevo
descuento» en la lista, el panel del descuento (cabecera, «Agregar», la grilla de prendas con su ×) y la hoja «Nuevo descuento / Cambiar el %».
Las fichas de cada pieza: `docs/milimetro/fila-de-lista-campanas.md` y `docs/milimetro/panel-de-descuento.md`.

Resumen: **0 graves · 0 medias · 1 leve decidida a propósito** (el aire de 26 px bajo «Descuentos», el mismo que entre dos pilas) · falsos positivos y heredados anotados.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| Contraste, claro (panel y lista) | 75 textos y 2 controles de vidrio: 0 fallan | WCAG 1.4.3, 1.4.11 `[Norma]` | pasa |
| Contraste, oscuro (panel) | 0 textos y 0 controles que fallen; 25 «APCA débil» de segunda mirada, sin falla WCAG | WCAG 1.4.3, 1.4.11 `[Norma]` | pasa |
| Contraste de la hoja (1440 claro) | 0 textos; el interruptor «En todas las tiendas» sale «borde 0», pero apagado lleva su aro `inset 1.5px var(--color-borde-control)` (`app/estilos/campos-y-casillas.css:405`), que el medidor no lee | WCAG 1.4.11 `[Norma]` | pasa (falso positivo del medidor) |
| Foco con teclado (panel y hoja) | 0 sin anillo, 0 flojos, 0 tapados; el halo del campo se mira a ojo (pieza decidida, ADR-0351) | WCAG 2.4.7, 2.4.11 `[Norma]` | pasa |
| Estados (`medir.js`) | 0 apagados por lo que falta (la hoja usa `<Boton confirma>`), 0 errores mal puestos, 0 etiquetas que falten, 0 selecciones que solo diga ARIA | ADR-0611 mejora 4 · repo | pasa |
| «Guardando…» | sale como «espera escrita a mano», pero es el texto apilado de `<Boton cargando>` (mantiene el ancho) | `accion.guardar` (ADR-0358) | decidido a propósito |
| `:hover` | ninguno nuevo fuera de `@media (hover: hover)` (los dos que lista el medidor son de otras pantallas) | `lib/hover-con-mouse.test.ts` | pasa |
| Letra | 0 textos de lectura bajo 14 px, 0 líneas de más de 80; las cifras en DM Sans piden tabulares y la letra no los trae | `/tipografia` propuesta 1 (transversal) | heredado |
| 375 px | sin desborde; 0 blancos bajo 24; la flecha «Volver a la lista» mide 34 px y su área de dedo llega a 42–44 (la pieza `<Volver>` decidida) | ADR-0611 mejora 5 | pasa (pieza decidida) |
| Proximidad (375) | el medidor marca «adentro 16 > afuera 12»; medido: el panel queda a 16 px de su fila y a 24 de la siguiente, así que se lee como suyo | `/espacio` | falso positivo |
| Aire bajo «Descuentos» | `margin-bottom: 26px` fuera de la escala de 4 (`app/estilos/campanas-lista.css:16`), copiado de `.sl-pila + .sl-pila` para que la lista y la billetera respiren igual | `/espacio` `[Práctica]` | leve, decidido a propósito |
| Movimiento | quieto: 0 animaciones y 0 bucles; las del panel usan `--t-*` y `--ease-*` (ficha del panel) | ADR-0136, ADR-0625 | pasa |
| Textos | sin fallas medibles | `/textos` | pasa |

## Lo que no se midió

- `graficos`: las piezas nuevas no tienen gráficos.
- El movimiento «vivo» con el medidor (se revisó en las fichas de cada actividad, no aquí).
- Un teléfono real (el puntero táctil es emulado).
