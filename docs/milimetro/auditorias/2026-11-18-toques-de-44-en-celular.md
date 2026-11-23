# Auditoría al milímetro — cuatro toques del celular que llegan a 44 px · 2026-11-18 · `claude/responsive-skills-analysis-372bcd` (`1404be0f3`)

Medido: 430×932 y 375×812 claro con dedo (quieto, como arranca) · 430 oscuro · 430 con las animaciones vivas · foco con teclado en la cabecera ·
1440×900 claro con mouse. Servidor: `localhost:3015` y `localhost:3012` (`cayla-retail-dev-local-bin`, el código de esta rama) contra la base local,
cuenta Admin en Tienda Lima. Medidores de `/milimetro` (`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos`), servidos desde una
carpeta temporal y cerrada al terminar. El panel del navegador estuvo oculto toda la corrida: cada medición llevó antes una captura, que obliga a pintar.
Rutas: `/vender` (el ticket con una prenda), `/vender/apartados`, `/vender/historial` y la cabecera del marco.
Alcance: lo que cambia la rama (PR felipea92p-ux/cayla-retail#1959): la clase `area-dedo` en cuatro controles.

Resumen: **0 graves de la rama · 0 medias de la rama · 0 leves de la rama** · 1 media heredada de `main` anotada aparte (la versalita de «Opciones», 10,5 px) · el color de los textos quedó sin medir.

## Lo que cambia la rama, medido

| Control | Archivo | Con dedo, antes | Con dedo, después | Con mouse (1440) |
|---|---|---|---|---|
| El «%» de descuento de la línea del ticket | `components/punto-de-venta/LineaDelTicket.tsx` | dibujo y toque 94 × 27 | dibujo 94 × 27, toque 94 × 44 | no se midió a 1440 (el ticket es una hoja del celular) |
| «Opciones» de Apartados | `components/apartados/ApartadosPanel.tsx` | 110 × 36 | dibujo 110 × 36, toque 110 × 44 | 110 × 36, igual que antes |
| El chip «Pendiente de enviar» de Historial | `components/HistorialVentasLista.tsx` | 151 × 26 | dibujo 151 × 26, toque 151 × 44 | 151 × 26, igual que antes |
| El colibrí de la cabecera (solo de 401 a 639 px) | `components/AppShell.tsx` | 39 × 26 | dibujo y toque 44 × 44 | no se dibuja |

- **Blancos de menos de 44 px con dedo** (`espacio`): 0 en el ticket, 0 en Apartados (375 y 430) y 0 en Historial (375). Regla: 44 px con dedo, `app/estilos/tacto.css` (ADR-0611, mejora 5).
- **Blancos de menos de 24 px** (`espacio`, `[Norma]` WCAG 2.5.8): 0 en las cuatro vistas y a 1440.
- **Proximidad rota** (`espacio`): 0. El área nueva del «%» no pisa a ningún otro botón del ticket (medido contra todos los botones de la hoja).
- **La cabecera a 430 px:** sigue de 60 px de alto, la página no desborda y el colibrí queda centrado en su caja de 44.
- **Foco con teclado en la cabecera** (`milimetro` con `foco`): 5 controles medidos, 0 sin anillo, 0 con anillo flojo, 0 tapados.
- **Estados** (`milimetro`): 0 apagados, 0 sin etiqueta y 0 selecciones a ojo en la cabecera, en claro y en oscuro.
- **Textos** (`textos`): sin fallas medibles en Apartados a 430.
- **Movimiento** (`movimiento`): quieto, 0 animaciones; vivo, 11 animaciones, 0 bucles, todo quieto a los 1420 ms. Ninguna es de la rama.
- **Pruebas del repo:** `lib/tacto.test.ts` y `lib/hover-con-mouse.test.ts` en verde (10 pruebas).

## Graves

Ninguno.

## Medias

Ninguna de la rama.

## Leves

Ninguna de la rama.

## Heredado de `main` (no lo cambia esta rama)

1. **Media.** La versalita de «Opciones» de Apartados mide 10,5 px — `button.ap-opciones`, `components/apartados/ApartadosPanel.tsx:130` (`text-[10.5px]`) — regla del repo: las versalitas hablan a 11 px (CLAUDE.md, «Título de un campo» y «Botones») — va a `/tipografia`.
2. **A revisar, sin confirmar con `grep`:** «Reducir cantidad» apagado en el ticket con contraste 1,54 (`button.paso-cantidad-b`; pieza decidida `<PasoCantidad>`, y WCAG exime a los inactivos) — va a `/milimetro`, propuesta 3 («Apagado, pero que se pueda leer»).
3. **A revisar:** el título del vacío de Apartados con interlineado 1,20 (`h2.vacio-tit`, 22/26,4; pieza decidida `<Vacio>`) — va a `/tipografia`.
4. **A revisar:** el ícono del vacío se dibuja en 900 ms (`cayla-trazo-dibuja`, pieza `<Vacio>`: «el ícono de lo que falta que se dibuja una vez»); el medidor lo marca por pasar de 500 ms — va a `/movimiento`.

## Sin medir

- **El contraste de los textos** (`color`): en claro y en oscuro el medidor dio 0 textos medidos y 11 «tapados», con el panel oculto. Solo midió 2 controles (ninguno falla) y el anillo de foco (15,3:1). La rama no cambia ningún color.
- **1440 oscuro y 1440 con las animaciones vivas:** con mouse ningún control de la rama cambia, así que no se corrieron.
- **`graficos`:** ninguna de las cuatro vistas tiene gráficos.
- **El ticket en oscuro y con foco de teclado:** solo se midió en claro.
- **Un teléfono de verdad:** el dedo es emulado; no es Safari de iPhone ni hay teclado abierto.
