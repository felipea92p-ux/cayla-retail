# Auditoría al milímetro · «Corregir color» con «+ acompañante» y el punto partido en las grillas (2026-11-13)

Rama `claude/combined-colors-catalog-pov-4c7991`. Local, 1024 × 768, claro y oscuro, animaciones quietas (de fábrica). Medidores de
`milimetro`, `color`, `espacio`, `tipografia` y `textos` corridos sobre `/productos/[id]/editar` con «Corregir color» abierto y la mezcla a medio
armar. Ficha: `docs/milimetro/punto-de-color-combinado.md`.

**Resultado en lo que cambió: 0 graves, 0 medias, 0 leves.**

| Medidor | Lo que dijo | Juicio |
|---|---|---|
| Estados | «Corregir 3 variantes» apagado sin motivo mientras no hay color elegido. | Ya estaba (la hoja se apaga sin cambio desde antes); no es de este cambio. Va como nota. |
| Estados | «Usar la mezclaArmando…» como espera escrita a mano. | Falso positivo: es la palabra oculta de `<Boton cargando textoCargando>`, que guarda el ancho. |
| Color | 0 textos que fallen, en claro y en oscuro. «Usar la mezcla» no concluyente (vidrio). | Botón negro con letra crema: se lee en la captura. |
| Color | 14 controles bajo 3:1. | Todos de la página de atrás (segmento Unidades/Precios, cajas de la matriz): ya estaban. |
| Espacio | 0 blancos bajo 24 px; 0 proximidad rota. Fuera de escala: solo piezas de la ficha de atrás. | Nada del cambio. |
| Tipografía | 1 lectura bajo 14 px: la bajada de la hoja (13,5 px, del `<Modal>`). | Ya estaba; es la pieza del sistema. |
| Textos | 2 cortados y 1 botón en dos líneas. | Todos de la ficha de atrás; ya estaban. |

## Segunda pasada: 375 px con el dedo y foco con teclado

| Medidor | Lo que dijo | Juicio |
|---|---|---|
| Foco (`{ foco: true }`) | 6 controles medidos: 0 sin anillo, 0 con anillo flojo, 0 tapados; 2 campos con halo. | Los halos son los de la caja que se enciende (ADR-0351). |
| Textos | El marcador «Busca el color que acompaña al azul marino» se cortaba a media palabra. | **Media, arreglada:** el marcador dice «Busca el otro color»; la base sigue en la etiqueta accesible y en el panel (ADR-0290). |
| A ojo | El buscador de acompañantes no se alineaba con el de arriba (que deja lugar a su punto). | **Leve, arreglada:** el bloque lleva el mismo margen (`pl-8`). |
| Espacio (dedo) | El «×» para quitar un acompañante medía 24 px. | **Media, arreglada:** `area-dedo` (44 px de área sin cambiar el dibujo), también en el «×» de las píldoras de color elegido. |
| Espacio (dedo) | Las filas de la lista del combo miden 40 px. | De `ComboBuscable`, la pieza del sistema: al backlog. |

Vender a 375 px (PL-105): el punto partido sale en el buscador, la tarjeta y la hoja de opciones, sin cambiar el tamaño de nada. Capturas en el PR.

No se midió: movimiento (no hay movimiento nuevo).
