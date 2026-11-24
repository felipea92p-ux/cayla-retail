# Auditoría al milímetro — Recibir ▸ Contar: la foto del modelo («Cargando foto…», «Quitar fondo» y la ×) · 2026-11-24 · `claude/mejora-recepcion-mercaderia-2c864b`

Medido: la caja de la foto de la placa (`PlacaDelModelo.tsx`, `.rc-placa-foto-caja`) sobre `/recibir/envio/<id>` con un envío sin aviso de
prueba (anulado después), a 1440 × 900 claro, 1440 oscuro, 1440 quieto y 375 × 812 claro. La IA se simuló para dejar la franja «Quitando el
fondo…» a la vista sin pagar. Medición propia de la pieza con Playwright (tamaños, letra, contraste del texto sobre el velo en el peor fondo,
señal de espera con las animaciones apagadas y desborde), más `lib/tema-colores`, `tema-tokens`, `letra-suelta`, `beige-plano`, `hover-con-mouse`,
`movimiento-reglas` y `unificar` en verde.

Resumen: **1 grave · 0 medias · 0 leves de esta rama, arreglado.**

## Hallazgos

| # | Qué | Dónde | Medido | Regla | Severidad | Estado |
|---|---|---|---|---|---|---|
| 1 | La × para quitar la foto era la chica | `PlacaDelModelo.tsx`, `BotonQuitarFoto` | 20 × 20 px | `[Norma]` WCAG 2.5.8: blanco ≥ 24 px con mouse | Grave | Arreglado: `grande` (28 × 28 px), como en «Fotos y colores» |

## Lo que cumple

| Pieza | Medido | Regla · nivel |
|---|---|---|
| Franja «Cargando foto…» / «Quitando el fondo…» | 13 px (`--text-xs`), seminegrita, tinta sobre papel al 86 % | Escala de letra, ADR-0691 |
| Contraste de la franja, peor fondo | claro: 11,9:1 sobre foto negra · 16,6:1 sobre blanca; oscuro: 14,5:1 · 8,8:1 | `[Norma]` WCAG 1.4.3 (≥ 4.5:1) |
| La franja se anuncia | `role="status"` y `aria-busy` en la caja | `[Norma]` WCAG 4.1.3 |
| Señal de espera | `HiloEnEspera` con `data-senal`: quieto, sigue a 1,1 s | Regla del repo (ADR-0625) |
| Interruptor «Quitar fondo» | `<Interruptor>` de siempre (38 × 22 px, la etiqueta también se toca) | Pieza decidida (ADR-0358) |
| La × | `BotonQuitarFoto grande`, 28 × 28 px, sin pregunta (no se subió nada) | Pieza de «Fotos y colores»; ley 7 de `/formidable` |
| 375 px | sin desborde horizontal; los botones bajan a dos líneas | ADR-0462 |
| Oscuro | velo y texto salen de los tokens (papel y tinta se invierten) | ADR-0336 |

## Sin medir

- Los medidores completos de las siete skills (`referencia/medir.js`) no se corrieron sobre esta pieza: se midió solo lo que cambió.
- La IA de verdad (tiempo y resultado): la prueba la simula para no pagar.
