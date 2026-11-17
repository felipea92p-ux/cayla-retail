# Auditoría al milímetro — `/productos` ▸ el «+» que llena su fila y las insignias de la foto · 2026-11-17 · `claude/ajustar-boton-circulos-d87e2a` (PR #1927, `20a2cf0c1`)

Medido: 375×812 claro vivo · 1440×900 claro · 1440 oscuro · 1440 quieto · foco con teclado a 375. Servidor: `localhost:3010` (base local, sede Lima).
Alcance: solo lo que cambia el PR. La fila de acciones de la cabecera en el celular (`accionesLlenan` de `EncabezadoPagina` y `max-sm:grow` en «Nuevo producto»)
y las insignias sobre la foto de la grilla (la empresa abajo a la izquierda con «Descontinuado»; la campaña y «2 precios» arriba a la izquierda; «Muestra» arriba a la derecha).

Resumen: **0 graves · 0 medias · 0 leves en lo que cambió** · 2 hallazgos heredados (no los trae el PR) · 0 decididos a propósito.

## Lo que se midió

| Pieza | Medida | Regla | Resultado |
|---|---|---|---|
| «+» (Nuevo producto) a 320 / 350 / 375 / 390 / 430 px | ancho 288 / 48 / 73 / 88 / 128 px; alto 44; borde derecho = margen de la cabecera (16 px) en los cinco | 44 px con el dedo (ADR-0611 mejora 5) · sin desplazamiento lateral | pasa |
| Fila de acciones a 375 (`espacio`) | 0 blancos bajo 24 y bajo 44 con el dedo, 0 valores fuera de la escala de 4 | WCAG 2.5.8 `[Norma]` · regla del repo | pasa |
| Letra de la cabecera y de la tarjeta (`tipografia`) | 0 lecturas bajo 14 px en lo que cambió | regla del repo (ADR-0358 `texto`) | pasa |
| Estados de la cabecera (`milimetro`) | 0 apagados, 0 ocupados que se pulsan, 0 elegidos solo por ARIA, 0 bucles | `referencia/estados.md` | pasa |
| Foco con teclado (cabecera, 375) | 7/7 controles con anillo, 0 flojos, 0 tapados por lo que flota | WCAG 2.4.7, 2.4.11 `[Norma]` | pasa |
| Contraste en claro y oscuro (`color`, 1440) | 0 textos que fallen de forma concluyente; los botones de vidrio, por `lib/vidrio-contraste.test.ts` (verde) | WCAG 1.4.3, 1.4.11 `[Norma]` | pasa |
| Quieto (`movimiento` + `milimetro`) | 0 animaciones en bucle; nada del PR se mueve | ADR-0625 | pasa |
| Insignias de «Cartera Noa» a 375 | «MUESTRA» x 70–136, y 10; «CLAURE» x 10–79, a 10 px del borde de abajo (antes se pisaban 9 px) | sin encimarse | pasa |
| Las 20 tarjetas de Lima a 375 | 0 choques entre insignias, 0 insignias fuera de la foto | — | pasa |

## Heredado (ya estaba antes del PR; no lo cambia)

1. **«CLAURE» sobre una foto oscura no llega a 4,5:1.** `span.chip-cayla «CLAURE»` dentro de `.prod-sobre-foto` (`components/ProductosGrilla.tsx`, `InsigniaEmpresa`). El medidor de color lo
   deja «no concluyente» (rango 2,49–5,67:1, hay una imagen detrás). Calculado a mano en el centro del texto sobre el mosaico «Negro» de «Cartera Noa»: ~3,4:1 (pizarra
   `rgb(76,93,110)` sobre el vidrio de `.prod-sobre-foto`, blanco 0,92→0,6, y el degradado de `chip-cayla`). Igual antes del PR: el mosaico es de un solo color, arriba o
   abajo da lo mismo. Sobre foto clara pasa (5,67:1). `[Norma]` WCAG 1.4.3 → va a `/color`: el vidrio de lo que va sobre una foto (`.prod-sobre-foto`, `vidrio/pantalla.css`)
   tendría que tapar más, o la insignia ir maciza. Toca una receta de vidrio: es decisión de Felipe y llega a Dynamic.
2. **«Muestra — color» en versalitas de 9 px.** `span.prod-sobre-foto.label-cayla` (`ProductosGrilla.tsx`, `text-[9px]`), bajo el piso de 11 px de las versalitas; contraste
   4,16:1 (no concluyente, imagen detrás). Ya estaba así → va a `/tipografia`.

## Sin medir

- La insignia de campaña y «2 precios» junto a «Muestra» en una tarjeta angosta: la base local no tiene ninguna prenda en campaña ni con dos precios.
- «CLAURE» + «Descontinuado» apiladas: no hay prendas descontinuadas de CLAURE en la base local (es una columna de ~53 px en una foto de 182).
- La fila con dos pendientes a la vez a 375 (el «+» baja y ocupa la fila): visto a 320 px con uno solo.
- `tema:auditar`.
