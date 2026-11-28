---
paths:
  - "apps/web/components/**/*.tsx"
  - "apps/web/app/**/*.tsx"
  - "apps/web/lib/**/*.ts"
---

## Separar sin punto: ningún dato se separa con «·» (regla — ADR-0716, Felipe 2026-11-27; regla S10 de la familia)

**Felipe: el «·» «no se ve bien, considero que hay mejores maneras».** Ni el «·» ni otro signo («|», «—», «/») separan datos que se ven:
se separan con estructura. Antes de separar, pregunta qué relación tienen los datos. Vale para Retail y Dynamic, en todo texto nuevo o
editado:

| # | Si es… | Va así | Pieza |
|---|---|---|---|
| 1 | quién, dónde, cuándo | frase con la palabra que une: «Salida por venta», «de 10:00 a 11:00» | — |
| 2 | datos sueltos de una fila (talla, color, dónde, sede, rol) | piezas con espacio e ícono mudo, rótulo solo para el lector | `<LineaDeDatos>` |
| 3 | un nombre y su cuenta | nombre a la izquierda, cuenta dicha a la derecha, lo urgente en rojo profundo | `<CabeceraConCuenta>`, `<CuentaEnFrase>`, `cuentaEnFrase()` |
| 4 | un dato con su rótulo | rótulo arriba y valor abajo; en una línea, «Sede: todas» | `<ParDato>` |
| 5 | un valor con una nota | paréntesis: «Ajuste a mano (merma)» | — |
| 6 | un estado con su tiempo | frase corta: «En pausa hace 12 min» | — |
| 7 | una lista armada en código | «a, b y c», nunca `.join(" · ")` ni otro `new Intl.ListFormat` | `listaDicha()`; una prenda, `prendaDicha()` |
| 8 | un paso numerado | el número como pieza aparte | `<TituloGrupo paso>` |
| 9 | una celda vacía | «—» | — |
| 10 | un papel que se imprime | cada dato en su pieza, con espacio | — |
| 11 | el título de la pestaña | «\|», el único signo que queda | — |

Lo hace cumplir `apps/web/lib/sin-punto-medio.test.ts` (el analizador de TypeScript lee lo que se dibuja, sin comentarios) **en los
módulos ya limpios**, en su lista `MODULOS`, que solo crece; hoy, Movimientos. Un módulo nuevo se suma ahí cuando Felipe lo aprueba. Una
línea que de verdad necesita el signo (lee un dato que la base guarda así) lleva `// punto-medio-permitido: <por qué>`. Las tres piezas
viajan a Dynamic (`docs/familia/README.md`, «Separar sin punto»): si cambias cómo funcionan, dilo en el PR. Detalle, ejemplos y fuentes:
`docs/adr/0716-separar-sin-punto-medio.md`.
