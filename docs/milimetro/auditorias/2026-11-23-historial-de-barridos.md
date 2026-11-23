# Auditoría al milímetro — Historial de barridos (`/inventario/barrido/historial` y su detalle) · 2026-11-23 · `claude/keen-turing-w667at`

Medido: la lista `/inventario/barrido/historial` y el detalle `/inventario/barrido/historial/[id]` (un barrido confirmado), con los
medidores de estados, espacio, tipografía, color y textos inyectados enteros con Playwright; el de foco con la página en «modo teclado»
(un Tab real). Servidor de la rama (`localhost:3100`) contra la base local, cuenta Líder en Tienda Lima. 1440 × 900 en claro y en oscuro y
375 × 812 en claro. Sin gráficos ni movimiento propio (las piezas son las del sistema).

Resumen: **0 graves · 0 medias · 2 leves (de piezas compartidas)** · contraste sin fallas en claro y en oscuro, foco visible y sin tapar (33 controles en la lista, 24 en el detalle), ningún blanco bajo 24 px.

## Lo que se midió

| Medidor | Vista | Resultado (Medido) |
|---|---|---|
| estados (`milimetro`) | lista y detalle, 1440 y 375 | 0 apagados, 0 errores, 0 campos sin etiqueta, 0 bucles |
| foco (`{ foco: true }`) | lista 1440/375, detalle 1440/375 | 33 / 15 / 24 / 6 controles: 0 sin anillo, 0 flojo, 0 tapado |
| color | lista y detalle, claro y oscuro | 0 textos ni controles bajo su contraste |
| espacio | lista y detalle, 1440 y 375 | 0 blancos bajo 24 px |
| tipografía | lista y detalle, 1440 y 375 | 0 textos de lectura bajo 14 px |
| textos | lista y detalle, 1440 y 375 | sin fallas |

## Leves (de piezas compartidas)

1. **`<Vacio tamano="chico">`** declara 14 px de relleno a los lados, fuera de la escala de 4 px. Es la pieza decidida (ADR-0358); va a `/espacio` cuando se toque.
2. **El globito de `TituloSeccion`** («Quiénes escanearon 1») dibuja su número en 10,5 px: la misma leve del barrido y del repo entero (propuesta 1 de `/tipografia`).

## Sin medir

- El área de 44 px con el dedo (`pointer: coarse`): pendiente con `pnpm --filter web tacto:medir` en la actividad 10.
