# Ficha al milímetro — La fila de la lista de Campañas y ofertas

## 2026-11-17 · diseñar (rama `claude/ofertas-pending-branch-11c351`, actividad 1 de la maqueta `docs/maquetas/campanas-simple-2026-11/`)

Propósito: elegir un descuento (y, desde la actividad 6, una campaña) para abrirlo; dice de un vistazo **qué es** («Descuento −10 %») y **cuánto
abarca** (15 prendas).

Pieza del repo: **nueva**, por elección de Felipe mirando (2026-11-17, cara A · En la lista de la maqueta: «descuentos y campañas son la misma
fila»). No existe una pieza decidida de «fila de una lista que abre un detalle»: el pase de la billetera (`.sl-pase`, ADR-0481) es un acordeón con
sello de tinta, y `fila()` de `<Tabla>` es para registros en columnas. Vive en `components/campanas/` y no entra a `components/ui/` hasta que otra
pantalla la pida y pase por `/unificar` (ADR-0358, árbol regla 3).

Lo que se arma con piezas que ya existen: el título del grupo es el de la billetera (`.sl-pila-titulo` + `<Globito>`), el ícono es de lucide
(`lib/iconos.ts`), y las cifras usan la serif de las cifras grandes.

## Espacio
- Alto mínimo: 80 px (maqueta, `.it` línea 32); con el dedo ya pasa 44 px de sobra.
- Padding: 16 px arriba, abajo e izquierda; 20 px a la derecha (maqueta línea 32). Múltiplos de 4.
- Columnas: 44 px (la lente) · el texto (`minmax(0, 1fr)`) · la cifra (`auto`); gap 14 px (maqueta). **14 no es múltiplo de 4: se usa 16** (`/espacio`, escala de 4).
- Entre filas: 8 px. Entre el título del grupo y la primera fila, el margen de `.sl-pila-titulo` (sellos.css:91).
- Radio: `--radius-tarjeta` = 22 px (globals.css:332). La maqueta usaba 20 px escritos a mano; se toma el token más cercano.
- La lente: 44 × 44, círculo; el ícono dentro, 20 px (`h-5`, «junto a un título, en una tarjeta de opción», `lib/iconos.ts`).

## Tipografía
- «Descuento»: versalitas de 11 px, peso 600, `letter-spacing: 0.14em` (maqueta línea 42; la misma voz que `campo-etiqueta` y los títulos de grupo).
- El %: `--font-serif` (EB Garamond, globals.css:314), 32 px, interlineado 1,02, peso 500, cifras `lining-nums tabular-nums`, sin cortar (`nowrap`).
- La cifra de la derecha: serif 26 px, interlineado 1, mismas cifras; debajo «prendas» en DM Sans (`--font-sans`, globals.css:313) de 14 px, que es el piso de
  lectura del ERP (CLAUDE.md, familia `texto`).
- «Todas las tiendas» (bajo el %): 14 px, DM Sans.

## Color
- Reposo: el **vidrio claro** (`--vidrio-claro-fondo`, `--vidrio-claro-borde`, `--vidrio-claro-sombra`, recetas.css:299–302), sin `backdrop-filter`: la
  lista se desplaza (ADR-0623).
- Elegida (`aria-current="true"`): el **ahumado denso** (`--ahumado-denso-fondo`, `-borde`, `-luz`, recetas.css:72–74), con la letra en `--color-crema`; lo
  secundario, crema al 74 %.
- La lente: `--lente-fondo` + `--lente-luz` (recetas.css:83–84); en la fila elegida, crema al 14 % con borde crema al 22 % (maqueta línea 53).
- Texto secundario («Descuento», «prendas», «Todas las tiendas»): tinta al 65 %, que pasa el piso de 64 % en todo fondo y tema (CLAUDE.md «Modo oscuro», punto 4);
  sobre el ahumado, crema al 74 %. Se mide con `.claude/skills/color/referencia/medir.js` en claro y oscuro.
- Oscuro: las recetas ya traen su versión (recetas.css, bloque oscuro). Sin un hex ni un `rgb()`.

## Estados
Pieza: `<FilaDeLista>` · rama del árbol: nueva, elegida mirando la maqueta (2026-11-17).

| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | vidrio claro, borde de vidrio, la lente, el % y la cifra | nombre = «Descuento −10 %, 15 prendas» (el texto del botón) | medir.js · contraste | [Norma] 1.4.3, 4.1.2 |
| hover | solo `@media (hover: hover)`: sube 1 px y el borde pasa a tinta al 25 % | — | medir.js · hoverSueltos; `lib/hover-con-mouse.test.ts` | [Norma] MQ4 `hover` |
| focus-visible | el anillo único del ERP (`--foco-*`, 2 px con 2 px de separación, ADR-0351), no uno propio | — | medir.js `{ foco: true }` | [Norma] 2.4.7 |
| active | `scale: 0.985` en `--t-resp` | — | a ojo en vivo | [Práctica] respuesta ≤ 100 ms |
| selected | ahumado denso con la letra crema: no depende solo del color, cambia fondo, letra y lente | `aria-current="true"` | medir.js · seleccion | [Norma] 1.4.1, 4.1.2 |
| disabled | no aplica: la fila siempre se puede abrir | — | — | — |
| loading | no aplica en la fila: la lista llega con la pantalla (servidor) | — | — | — |
| error | si la base no responde, la sección Descuentos no se dibuja y la pantalla sigue (principio 9) | — | apagar la función en local | regla del repo |
| read-only | no aplica: abre, no guarda | — | — | — |
| vacío | sin descuentos, la sección no sale (la de «Nuevo descuento» llega en la actividad 4) | — | — | — |
| quieto | sin subir ni encoger ni entrar en cascada; queda el cambio de borde y de fondo | — | medir.js con `data-movimiento="quieto"` | [Norma] 2.3.3 · regla del repo ADR-0625 |

## Movimiento
- Al llegar: `cayla-cascada` (sube 10 px y aparece, globals.css:1885) en `--t-momento` (480 ms) con `--ease-cayla`, 40 ms entre fila y fila (como la maqueta), con tope
  en la fila 8 para que una lista larga no espere.
- Hover: `translate` y `border-color` en `--t-cambio` (160 ms); fondo y color en `--t-cambio`.
- Al presionar: `scale` en `--t-resp` (100 ms).
- Sin rebote ni bucle (ADR-0136). Quieto: `movimiento.css` lo deja en 0,01 ms (ADR-0625).
- Lo que reemplaza: las tarjetas de cifra de «Rebajas de tu tienda» (`<TarjetaCifra>`), que no tenían más movimiento que el de la tarjeta; la fila no tiene menos.

## Texto
- «Descuento» arriba y el % abajo, en grande: «−10 %» con el menos tipográfico (`textoPct`, `lib/rebaja-rapida-reglas.ts`).
- A la derecha, la cifra y «prenda» o «prendas».
- Si el descuento es de todas las tiendas: «Todas las tiendas» bajo el % (Felipe 2026-11-17: dos filas, la de todas lo dice).
- El grupo: «Descuentos» con su globito.

## Gráfico
No aplica.

## Accesibilidad
- 1.4.3 letra sobre vidrio claro y sobre ahumado denso → `color/medir.js`, claro y oscuro.
- 1.4.11 el borde del vidrio no lleva información: la fila se reconoce por su texto y su lente.
- 2.4.7 foco visible → el anillo global; Tab recorre las filas en orden.
- 2.5.8 blanco ≥ 24 px → 80 px de alto.
- 4.1.2 nombre y estado → `<button>` con `aria-current` en la abierta.
- 2.3.3 → arranca quieta (ADR-0625).

## Fuentes
- [Norma] WCAG 2.2: 1.4.1, 1.4.3, 1.4.11, 2.3.3, 2.4.7, 2.5.8, 4.1.2. Media Queries 4 (`hover`).
- [Práctica] escala de 4 px (`/espacio`).
- Regla del repo: ADR-0596 (vidrio), ADR-0623 (lo que se desplaza no se desenfoca), ADR-0136 / ADR-0625 (movimiento), ADR-0351 (anillo), ADR-0169 (tokens).
- Maqueta elegida: `docs/maquetas/campanas-simple-2026-11/index.html`, líneas 28–60.

## Propuestas
Ninguna: la fila no choca con una regla del repo.
