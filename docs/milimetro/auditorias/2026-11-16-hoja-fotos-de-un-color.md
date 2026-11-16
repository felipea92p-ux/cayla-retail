# Al milímetro · la hoja «Fotos de <color>» de Editar producto — 2026-11-16

**Pieza:** `HojaDeFotos` en `apps/web/components/ficha-producto/FotosPorColor.tsx` (Catálogo ▸ Productos ▸ Editar ▸ tocar la tarjeta de un color con fotos).
**Rama:** `claude/determined-keller-rk19hj`. **Qué cambió** (Felipe 2026-11-16: «hay como una colisión de las opciones»): la hoja pasa de `mediana` (576) a
`ancha` (768); «Principal» y «Quitar» van en una fila que se parte (`flex flex-wrap`, cada uno `flex-auto`) en vez de una grilla de dos columnas fijas;
«Principal» dice «Hacer principal»; el combo «Pasar a otro color…» lleva `w-full min-w-0`; «Ponerla primera» va al final; el foco cae en la hoja
(`focoEnLaHoja`); y, arreglado durante esta auditoría, «Listo» va en `pie-hoja-fijo`.

**Cómo se midió:** una página temporal (ya borrada) que dibuja `HojaDeFotos` sin base de datos, con dos casos: **crudo** (2 fotos del color, la principal
es de otro color: las dos dicen «Hacer principal» y la segunda «Ponerla primera») y **principal** (3 fotos, la primera es la principal). Playwright,
`window.__milimetro = { raiz: "[role=dialog]" }`, los seis medidores enteros (no hay gráficos). La foto es un pantalón dibujado, no una foto real.

## Números

**0 graves · 0 medias · 0 leves en lo que cambió.** 1 media propia arreglada en el camino. 2 notas de antes, fuera de este cambio.

| Medidor | 1440 claro | 375 claro | 1440 oscuro | quieto |
|---|---|---|---|---|
| estados | sin fallas (2 hover globales de otras piezas) | igual | igual | 0 bucles |
| foco (`{ foco: true }`) | 10 controles, 0 sin anillo, 0 flojos; 1 «tapado» falso (abajo) | — | — | — |
| espacio | 0 blancos < 24, 0 fuera de escala, proximidad bien | 0 blancos < 44 con el dedo | — | — |
| tipografía | 0 lectura < 14, 6 tamaños (27 título, 15, 14, 13,5, 13, 12,5 botones) | 0 | — | — |
| color | 11 textos, 0 fallan; 0 rojos de marca en vista | — | 14 textos, 0 fallan (tras el arreglo); APCA flojo en 9 (solo informa) | — |
| movimiento | apertura: 7 animaciones, todo quieto a los 354 ms, 0 bucles | — | — | 0 animaciones |
| textos | sin fallas | — | — | — |

**Encimados (medido con las cajas de cada botón y combo):** antes, 3 a 4 cruces por caso a 1440 y a 375 («Quitar» × «Principal», combo × combo,
combo × «Ponerla primera»); después, 0 en los cuatro casos.

## Arreglado en el camino (media, propia)

1. **«Listo» bajo el borde de la hoja con tres fotos o más** — `HojaDeFotos`, la fila de «Listo» — medido en el caso «principal» a 1440×900: el botón
   quedaba cortado por el borde de la hoja (el medidor de color leyó 1,0:1 porque medía su mitad tapada). Lo empeoró este cambio: la hoja ancha hace las
   fotos más grandes y la hoja más alta. Regla: CLAUDE.md «Botones a la vista en una hoja larga» (`pie-hoja-fijo`). Arreglo: la fila de «Listo» lleva
   `pie-hoja-fijo pt-2`. Medido después: «Listo» de 807 a 847 px con la hoja hasta 876, a la vista en 1440 claro, 1440 oscuro y 1024×768.

## Estados

| Estado | Qué se ve | Qué se anuncia | Medido |
|---|---|---|---|
| default | `btn-sutil` / `btn-peligro` / `btn-enlace` / `btn-primario`, combo `caja-campo` | nombre accesible en todos | 0 textos que fallen |
| hover | el de `btn-cayla` y `.mov-boton`, dentro de `(hover: hover)` | — | `lib/hover-con-mouse.test.ts` en verde |
| focus-visible | `--foco-*` en los botones, el halo en el combo | — | 10/10 con anillo |
| active | `.mov-boton` (escala y onda) | — | pieza del sistema, sin cambio |
| selected | no aplica: la principal no es un botón elegido; lo dicen la insignia «PRINCIPAL» sobre la foto y el texto «Es la principal» (no solo color) | — | a la vista en las capturas |
| disabled | `bloqueado` apaga todo mientras la ficha guarda (de antes, sin cambio) | `disabled` | 0 apagados en la medición |
| loading | no aplica: la hoja no guarda; los cambios esperan a «Revisar y guardar» de la ficha | — | — |
| error | no aplica: sin campos | — | — |
| read-only | no aplica | — | — |
| vacío | «Ya no quedan fotos aquí…» (ver notas de antes) | — | sin medir: el caso no se dibujó |
| quieto | sin animaciones; la hoja aparece sin moverse | — | 0 animaciones, 0 bucles |

## Decidido a propósito

- **La entrada de la hoja** (`vidrio-enfoca` en título, frase y contenido, con `filter`): es la cascada de `<Modal>` (ADR-0136, ADR-0596), no de esta pieza.
- **El foco en la hoja al abrir** (`focoEnLaHoja`): el medidor de color dice «sin outline» sobre la hoja; es el diálogo enfocado (tabIndex −1), no un control.
- **«Ponerla primera» de 93×19 px**: bajo 24 px de alto pero separado de todo (WCAG 2.5.8, excepción por espacio); con el dedo, 44 px por `tacto.css`.
- **«Listo» sobre la gota**: el medidor de color no concluye sobre el degradado de vidrio (1,12:1 leído); lo mide `lib/vidrio-contraste.test.ts`, en verde.

## Notas de antes (fuera de este cambio)

- **El `<input type="file">` escondido de `BotonFoto` no tiene nombre** (`components/alta-producto/FotosAlta.tsx:90`): es `sr-only` con `tabIndex={-1}`,
  así que no se alcanza con Tab (el «foco tapado» del medidor es falso), pero un lector de pantalla en modo lectura lo encuentra como «archivo» sin nombre
  (WCAG 4.1.2). El botón de al lado ya tiene su `aria-label`. Arreglo probable: `aria-hidden` en el input. Lo usa también Nuevo producto: va aparte.
- **El vacío es una frase gris suelta** («Ya no quedan fotos aquí…», `FotosPorColor.tsx:424`), no `<Vacio tamano="chico">` (ADR-0358, familia `vacio`).

## Sin medir

- Con fotos reales y con la base: la página temporal no tiene sesión ni datos.
- El estado vacío (cero fotos en el color) y el `bloqueado` mientras la ficha guarda.
- A 375 px, la hoja apila «Hacer principal» y «Quitar» uno bajo otro: no se enciman, pero la hoja queda alta (anotado en el backlog de la rama).
