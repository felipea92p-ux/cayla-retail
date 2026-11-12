# Auditar un gráfico — cómo se mide cada punto

La lista de 12 puntos está en `SKILL.md`. Aquí va **cómo se mide** cada uno y la tabla de contraste ya medida de los tokens de gráfico.

## 1. El 3:1 de las marcas (WCAG 1.4.11)

**Qué se mide:** cada parte del gráfico que hace falta para entenderlo (una barra, un tramo, una línea, el arco, la pista si de ella depende
leer «cuánto de cuánto») contra **lo que tiene al lado**: el fondo de la tarjeta o, en una barra de avance, la pista. Las líneas se miden
contra el fondo, no entre ellas. **2,99:1 no pasa.**

**Cuándo no hace falta:** si el valor de cada marca está **escrito a la vista** (cifra encima, monto al lado del tramo) o hay una **tabla
equivalente** en la misma pantalla. Un globito que sale al pasar el mouse **no cuenta** como valor a la vista. Que se vea «más elegante»
tampoco exime.

**Cómo, en el navegador** (`javascript_tool`): pega `referencia/medir.js`. Devuelve `fallan3a1` (marcas bajo 3:1, con
`cifrasEscritas` de su pieza: si son 0, la excepción no aplica) y, por pieza, `pista`. Mezcla la opacidad del elemento y de sus padres (una
barra apagada a 0,4 pierde contraste de verdad) y los fondos translúcidos hasta uno opaco. Si una fila dice `fondoIncierto: true` (vidrio o
degradado detrás), saca una captura y mide con un cuentagotas los dos colores reales.

**Cómo, sin navegador** (para un token): la fórmula de WCAG, luminancia relativa `L = 0,2126 R + 0,7152 G + 0,0722 B` con cada canal
linealizado (`c ≤ 0,04045 ? c/12,92 : ((c+0,055)/1,055)^2,4`), y `(L1 + 0,05) / (L2 + 0,05)`. Un color con opacidad se mezcla primero sobre su
fondo (`color-mix(in srgb, X p%, fondo)` = `X·p + fondo·(1−p)` por canal). `lib/tema-tokens.test.ts` ya mide así los textos; una línea de
CSS con un tono de gráfico bajo el 64 % lleva su `/* contraste: gráfico sobre <fondos> */` y la prueba la mide.

**Tabla medida (2026-11-12, contra `--color-papel` #fbf8f2 en claro y #26241f en oscuro; recalcula si cambia un token):**

| Token (como marca) | Claro | Oscuro | Lectura |
|---|---|---|---|
| `--color-tinta` | 16,44 | — | el acento: pasa siempre |
| `--color-grafico-alza` (= `--color-verde`) | 6,56 | 6,33 | pasa |
| `--color-grafico-baja` | 3,82 | 6,89 | pasa |
| `--color-grafico-neutro` (las barras de arena de `BarrasTiempo`) | **1,56** | 3,34 | **no pasa en claro**: necesita la cifra escrita o la tabla |
| `--color-sand` (pista de `BarraAvance` / `BarraApilada`) | **1,24** | **1,40** | no pasa: la pista es contexto; el relleno contra ella sí pasa (tinta 13,3) |
| `--color-taupe` (referencia punteada, la meta) | 5,58 | — | pasa |
| tinta al 40 % (`.linea-proyeccion`, «si sigue así») | **2,49** | — | no pasa: va con su `cifraProyeccion` escrita o no se lee |
| tinta al 30 % (`<Sparkline>` en una fila) | **1,93** | — | no pasa; va `aria-hidden` y el número está al lado: es forma, no dato |
| `--color-avance-medio` | **2,87** | 8,44 | no pasa en claro; es relleno de una barra con su número al lado |
| `--color-naranja` | 3,13 | — | pasa justo |
| `--color-metodo-efectivo` | **2,37** | — | relleno con su nombre y monto al lado |
| `--color-metodo-tarjeta` / `-yape` / `-plin` / `-transferencia` | 6,59 / 6,85 / 6,03 / 5,34 | — | pasan |
| `--color-camino-google` / `-otros` | 3,12 / 3,12 | — / 7,04 | pasan justo |
| `--color-sede-tru` / `-aqp` / `-lim` / `-emp` | 5,34 / 3,67 / 4,02 / 3,12 | — | pasan |
| `--color-reparto-verde-claro` / `-menta` / `-terracota` / `-arcilla` / `-ocre` / `-pizarra-claro` | 2,42 / **1,48** / 3,49 / **1,89** / 2,13 / 2,06 | — / 4,09 / — / 4,09 / — / 3,86 | la mayoría no pasa en claro: el comentario del token ya exige el nombre escrito al lado |
| Rejilla: `.linea-rejilla` (sand) · `.barras-tiempo-eje-y` (tinta 12 %) | 1,24 · 1,28 | — | la rejilla no es dato: no pide 3:1 (ver punto 5) |

Leída de un golpe: **lo que cumple sin ayuda es la tinta y los colores oscuros; casi todo lo claro (arena, menta, arcilla, efectivo) cumple solo
por la excepción de la etiqueta.** Por eso, en este repo, la etiqueta directa no es estética: es lo que hace legal al gráfico.

## 2. Que sea una pieza del sistema

```bash
# Dibujos a mano que las firmas de /unificar buscan (pista, no veredicto):
grep -rn --include=*.tsx -E "<polyline|strokeDasharray|role=\"progressbar\"|flex items-end" apps/web/components apps/web/app | grep -v "components/ui/"
pnpm --filter web vitest run lib/unificar.test.ts   # la deuda de cada familia grafico.* solo baja
```
`medir.js` también devuelve `sospechososAMano`. Lo de «aparte» (ver `elegir.md`) no es deuda.

## 3. La forma correcta

Escribe la pregunta de la pantalla en una línea y búscala en el mapa de `elegir.md`. Si la pieza no coincide con la relación, es hallazgo.

## 4. Barras desde cero, sin doble eje, escala común

Barras: las piezas arrancan en cero; mira que nadie pase un `max` menor que la mayor barra (`BarrasTiempo` lo corrige solo: `tope =
max(max, mayor)`). Doble eje: no existe en las piezas; si aparece, es un dibujo a mano. Escala común: en múltiplos pequeños, cada pieza recibe el
**mismo** `max` (o `minY`/`maxY`, o `total`); compáralo leyendo el JSX o la altura de dos barras de igual valor en dos piezas.

## 5. Alto y rejilla

`medir.js` → `bajo80px` (piezas que se leen como magnitud con menos de 80 px; `Sparkline`, `BarraApilada`, `BarraAvance` y `Anillo`
quedan fuera: o son forma, o son una sola dimensión de largo) y `rejillaJunta` (rayas a menos de 8 px). Un gráfico de menos de 80 px no lleva
rejilla.

## 6 a 9. Etiquetas, acento, paleta, daltonismo

- Etiquetas: cuenta en el DOM las cifras escritas (`cifrasEscritas`) contra el número de marcas. Leyenda solo si hay más de tres series y no
  caben los nombres junto a la marca.
- Acento: una sola marca en tinta (o la serie de hoy). Cuenta rojos de la pantalla: ADR-0169 pone el máximo en 2, y un rojo de gráfico cuenta.
- Paleta: `grep -n "color-" <archivo>` → todo color es un token de DATO con nombre o `grafico-*`; ningún hex (`lib/tema-colores.test.ts` ya
  lo hace fallar).
- Daltonismo: dos colores vecinos con ΔE2000 bajo 8 se confunden (`lib/color-parecido.ts`, `UMBRAL_PARECIDO`). Con simulación de
  deuteranopía, el trío `grafico-*` se validó con ΔE ≥ 11 (comentario en `globals.css`). En Chrome: DevTools ▸ Rendering ▸ *Emulate vision
  deficiencies* ▸ deuteranopia / protanopia, y captura.

## 10. Oscuro

Corre `medir.js` otra vez con `document.documentElement.setAttribute("data-tema","oscuro")` y compara. Lo que pasa en claro y
falla en oscuro lo rompió el tema (urgente, ADR-0336). `pnpm --filter web tema:auditar` mide los textos, no las marcas.

## 11. Movimiento

`medir.js` → `movimiento.entrada` y `movimiento.transicion` de la primera marca, y `animaciones` (si dice «quieto», enciéndelas con el
botón «Animaciones» de la cabecera y vuelve a medir). Revisa: una vez, sin bucle (`animation-iteration-count: 1`), sin rebote (ninguna curva con
un valor fuera de 0–1 en `cubic-bezier`), `--ease-cayla`; la versión quieta llega al estado final (con `backwards` en CSS lo hace). En JS:

```bash
grep -rn "matchMedia(\"(prefers-reduced-motion" apps/web/components   # debe ser prefiereQuieto() / useQuieto(); lo vigila lib/movimiento-reglas.test.ts
```
Para la transición de datos: cambia la sede o el período y mira si las barras se deslizan (misma `clave`) o se rearman de cero (la `key` cambió:
se perdió la identidad, Heer & Robertson).

## 12. Accesibilidad

- `sinEtiqueta` de `medir.js`: piezas sin rol o sin `aria-label`. `decorativa` solo vale si el texto de al lado dice lo mismo.
- Teclado: con `respuesta.onElegir` (`BarrasTiempo`, `BarraApilada`) cada barra es un `<button>`; con `onElegir` en `<Linea>` se recorre con
  ← → y Enter. Prueba Tab, flechas y Enter sin mouse.
- Hover: lo que solo dice el globito al pasar el mouse no llega al dedo ni al teclado (ley 6 de `/formidable`): ese valor tiene que estar
  escrito, en `etiqueta`, o en la tabla.
- Lector de pantalla: VoiceOver (⌘F5) sobre la pieza; tiene que decir la conclusión, no «imagen».
