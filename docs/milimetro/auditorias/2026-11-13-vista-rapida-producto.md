# Auditoría al milímetro — Catálogo ▸ Productos ▸ vista rápida · 2026-11-13 · claude/botones-alineacion-etiquetas-b7297f @ 47208c702

Medido con `window.__milimetro = { raiz: '[role=dialog]' }` sobre la vista rápida de «Pantalón Palazzo Arena» (local, Tienda Lima, base con seed).
Medidores: estados (`milimetro`, también con `{ foco: true }`), `espacio`, `tipografia`, `color`, `movimiento`, `textos`.
Tamaños: 1440 × 900 claro y oscuro, 375 × 812 claro, quieto.

**Números:** 0 graves, 0 medias, 0 leves en lo que cambió este PR (pie de botones, «¿Ficha repetida o creada por error?», matriz y aviso en vidrio).

## Graves
Ninguno.

## Medias
Ninguno.

## Leves
Ninguno.

## Decidido a propósito
- Los botones del pie a 40 px y 13,5 px: la letra de una hoja (ADR-0358, «Botones — las dos voces»); antes mezclaban 12,5 y 14 px.
- «Eliminar» como `btn-peligro` (la gota con letra roja) porque abre una confirmación (ADR-0358, `accion.eliminar`).
- La matriz, la ficha corta y el aviso son la placa del vidrio «Serena»; las celdas, vidrio claro sin desenfoque (ADR-0596, ADR-0623).

## Heredado (no lo toca este PR)
- `span.label-cayla «Pantalones»` del mosaico sin foto: 3,5:1 sobre el color de la prenda (`MosaicoPrenda`, color de dato). Va a `/color`.
- DM Sans sin cifras tabulares en 10 cifras que las piden: propuesta 1 del tablero (`docs/milimetro/propuestas.md`).
- «S/89.00» sin espacio tras «S/» (`rangoSoles`): lo marca `/textos`; es el formato de todo Catálogo.
- «Muestra — Fucsia» a 9 px (versalita del marco de la foto).

## Sin medir
- `graficos`: la vista rápida no tiene gráficos.
- 44 px con el dedo medido a 375 (0 blancos bajo 44); `tacto:medir` no se corrió.
- Foco: 17 controles, todos con anillo y ninguno tapado (1440 claro). En 375 no se repitió la pasada de foco.
