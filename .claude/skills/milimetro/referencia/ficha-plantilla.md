# La ficha al milímetro: plantilla y un ejemplo resuelto

## Qué es

Una **ficha al milímetro** es la hoja de identidad de una pieza: qué pregunta responde, con qué pieza del repo se hace, y **cada valor** que la dibuja
(px, token, contraste, duración, curva, texto literal), cada uno con su fuente, su nivel de confianza y cómo se comprueba. No es una opinión de diseño:
si un valor no tiene `archivo:línea` o una medición, la ficha dice «sin medir».

La arma `/milimetro diseñar <pieza>`. Cada sección la escribe la skill que sabe de eso; `/milimetro` escribe **Estados** y **Accesibilidad** y junta todo.
Se guarda en `docs/milimetro/<pieza>.md` (historial: se agrega una fecha, no se sobrescribe).

## La plantilla (formato común del set)

```
# Ficha al milímetro — <pieza>
Propósito: qué pregunta responde o qué acción permite (1 línea)
Pieza del repo: <componente existente o «nueva: justificar»>
## Espacio      (de /espacio)      medidas en px y tokens: alto, padding, gap, radio, área de toque, densidad
## Tipografía   (de /tipografia)   familia, tamaño/interlineado, peso, cifras, medida
## Color        (de /color)        tokens por estado, contrastes medidos
## Estados      (de /milimetro)    default · hover · focus-visible · active · selected · disabled · loading · error · vacío · quieto
## Movimiento   (de /movimiento)   qué se mueve, propiedad, duración (token), curva (token), coreografía, versión quieta
## Texto        (de /textos)       cada texto literal, con su regla
## Gráfico      (de /graficos, si aplica)
## Accesibilidad                   criterios WCAG que toca y cómo se verifica
## Fuentes                         [Evidencia]/[Norma]/[Práctica] por decisión
## Propuestas                      si la pieza choca con una regla del repo que convendría mejorar
```

Reglas para llenarla:
- La línea **Pieza del repo** dice la rama del árbol: «decidida (fecha)», «forma A del censo (fecha)» o «nueva: va a `/unificar`».
- **Estados** usa los once de `estados.md` (los diez de la plantilla más **read-only**). Ninguno queda vacío: valor o «no aplica: <por qué>».
- Cada valor lleva su origen entre paréntesis: `(globals.css:569)`, `(medido 1440×900 claro)`, `(token --t-resp)`.
- Un valor del repo que choca con una fuente más fuerte no se «corrige» en la ficha: va a **Propuestas**.

---

## Ejemplo resuelto: `<Boton peso="primario">` en una hoja

Medido **leyendo el código** el 2026-11-12 (rama de trabajo, sin servidor levantado). Cada valor dice de dónde sale. Para confirmarlo en el navegador,
corre el fragmento del final con `javascript_tool` sobre una hoja que tenga el botón (cualquier `<Modal>` que guarde).

```
# Ficha al milímetro — Botón principal de una hoja (<Boton peso="primario">)
Propósito: hacer la acción principal de la hoja (Guardar, Cobrar, Registrar); una por pie.
Pieza del repo: <Boton peso="primario"> (components/ui/campos.tsx:1058), que dibuja `btn-cayla btn-primario`.
                Rama del árbol: decidida — familias `boton` y `accion.nuevo` (2026-10-07), `accion.guardar` (2026-10-14).

## Espacio
- Alto: 40 px — `min-height: 2.5rem` (vidrio/campos-y-botones.css:84). El contenido solo mide ~35 px (13,5 × 1,25 + 2 × 8 + 2 de borde), así que manda el mínimo.
- Con el dedo: 44 px — `min-height: 44px` con `pointer: coarse` (estilos/tacto.css:10).
- Padding: 8 px arriba y abajo (globals.css:569, `0.5rem`), 18 px a los lados (`padding-inline: 1.125rem`, vidrio/campos-y-botones.css:84).
- Gap entre ícono y palabra: 6 px (`0.375rem`, globals.css:569); el «+» va en su propia caja con 6 px (`gap-1.5`, campos.tsx `conMas`).
- Radio: píldora, `--radius-boton` = 999px (globals.css:345, aplicado en vidrio/campos-y-botones.css:84). El «radio de control (8 px)» del comentario de globals.css:566 y su `--radius-md` quedan pisados por el vidrio.
- Borde: 1 px, `--ahumado-borde` (tinta al 55 %, vidrio/recetas.css:66).
- Ancho: el de su palabra (`white-space: nowrap`); mientras guarda NO cambia (PalabraEnEspera apila las dos palabras en la misma celda).

## Tipografía
- Familia: `--font-sans` = DM Sans (globals.css:328; app/layout.tsx:18).
- 13,5 px / interlineado 1,25 / peso 500 (globals.css:569).
- En la cabecera de una pantalla (`data-voz="cabecera"`): VERSALITAS de 11 px, peso 600, `letter-spacing: 0.13em`, 12 px arriba y abajo, mismo alto de 40 px
  (globals.css:1807). La voz la pone el lugar, no la pieza (ADR-0358).

## Color
- Fondo: `--ahumado-fondo`, degradado de tinta al 72 % → 93 % (vidrio/recetas.css:63); en oscuro, 74 % → 92 % (recetas.css:412), y como en oscuro `tinta` es crema,
  el botón queda claro con la letra oscura.
- Letra: `--color-crema` (globals.css:594 `.btn-primario`).
- Luz: `--ahumado-luz` (filo de 1 px arriba + sombra corta, recetas.css:67).
- Hover: `--ahumado-hover`, rojo profundo al 78 % → 94 %, y el borde rojo profundo al 70 % (vidrio/campos-y-botones.css:113). Nunca rojo de marca ni gris (ADR-0358).
- Contraste: el peor tramo del degradado se mide sobre página, tarjeta y hoja, en los dos temas, en reposo y con hover: ≥ 4.5:1 (lib/vidrio-contraste.test.ts, `BOTONES`).
  No se mide con un cuentagotas: el fondo es un degradado translúcido.
- Menos transparencia o más contraste pedidos por el aparato: versión maciza (vidrio/aguanta.css).

## Estados
| Estado | Qué se ve | Qué se anuncia | Cómo se mide | Nivel · fuente |
|---|---|---|---|---|
| default | ahumado + crema, 40 px | nombre = su palabra («Guardar cambios») | vidrio-contraste.test.ts | [Norma] 1.4.3, 4.1.2 |
| hover | solo `@media (hover: hover)`: ahumado rojo profundo, sube 2 px con `--shadow-md`, una luz cruza una vez; el «+» gira 90°, la flecha avanza 4 px (globals.css:1770–1781) | — | medir.js `hover`; hover-con-mouse.test.ts | [Norma] MQ4 `hover` · [Práctica] M3 0.08 |
| focus-visible | el anillo único: 2 px de tinta con 2 px de separación (globals.css:476–483, ADR-0351). El `overflow: hidden` del botón no lo recorta: el outline va por fuera | — | medir.js `{ foco: true }` | [Norma] 2.4.7, 2.4.13 |
| active | `scale: 0.97`, vuelve a 0 px, `--shadow-sm` (globals.css:1773); la onda desde el punto tocado (`<OndaBotones>`, globals.css:1800) | — | a ojo en vivo; /movimiento | [Práctica] M3 0.10; ~100 ms |
| selected | no aplica: un botón de acción no queda elegido (lo elegido es `pildora-cayla[aria-pressed]`) | — | — | — |
| disabled | **no se apaga por lo que falta**: `confirma={guia}` frena el clic en la captura, cada campo dice su error y el foco va al primero (campos.tsx:1058–1085). Solo `disabled` mientras guarda: opacidad 0,5 y `not-allowed` (globals.css:583) | `disabled` | medir.js `apagados`; boton-confirma.test.ts | regla del repo ADR-0611 · [Práctica] Axess Lab |
| loading | «Guardando…» (o `textoCargando`) en la misma celda, sin cambiar de ancho; el hilo crema de 2 px barre abajo (`HiloEnEspera claro`, `data-senal`, 1,1 s lineal) | `aria-busy="true"` + `disabled` | medir.js `cargando`; /chaos (doble clic) | regla del repo ADR-0358 `accion.guardar`, ADR-0625 |
| error | no aplica en el botón: el error de un dato va bajo su campo (`<Campo tono="error">`), el de la hoja en `<Aviso tono="error">` sobre los botones | — | medir.js `errores` (en la hoja) | regla del repo (familia `aviso`) |
| read-only | no aplica: un botón no guarda un dato | — | — | — |
| vacío | no aplica: un botón siempre tiene su palabra | — | — | — |
| quieto | de fábrica (ADR-0625): sin subir, sin encoger, sin luz ni onda (globals.css:2709–2715); queda el cambio de color. Mientras guarda, el hilo sigue (`data-senal`) | — | medir.js con `data-movimiento="quieto"` | [Norma] 2.3.3 · [Práctica] Val Head |

## Movimiento
- Al pasar el mouse: `translate` y `box-shadow` en `--t-cambio` (160 ms); color, fondo y borde en `--t-resp` (100 ms); todo con `--ease-cayla` (globals.css:1752).
  La luz (`cayla-brillo`) corre una vez en `--t-momento` (480 ms). El giro del «+» y el avance de la flecha van en **300 ms escritos a mano** (globals.css:1774–1778):
  no es un token (lo decide `/movimiento`).
- Al presionar: `scale` en `--t-resp`. La onda: `cayla-onda` en `--t-hoja` (260 ms).
- **A confirmar en el navegador:** `app/globals.css` define `@keyframes cayla-onda` **dos veces** (líneas 1678 y 2618, las dos fuera de capa). La segunda pisa a la
  primera, así que la onda del botón correría con `scale(0.6 → 2.2)` y opacidad 0,55 → 0 en vez de `scale 0 → 1` y opacidad 1 → 0. Va a `/movimiento`.
- Sin rebote ni bucle (ADR-0136). Versión quieta: ver «Estados».

## Texto
- Verbo + qué («Guardar cambios», «Registrar gasto»); con «+ » al inicio, el signo se vuelve ícono y el lector oye solo la palabra (campos.tsx `conMas`).
- Mientras guarda: «Guardando…», o el verbo de lo que hace con `textoCargando` («Anulando…», «Desactivando…»). Las reglas de redacción las da `/textos`.

## Gráfico
No aplica.

## Accesibilidad
- 1.4.3 contraste de la letra → lib/vidrio-contraste.test.ts (peor tramo, dos temas).
- 1.4.11 contraste del contorno: el botón negro se distingue por su relleno; el anillo de foco, 2 px de tinta → medir.js `{ foco: true }`.
- 2.4.7 / 2.4.13 foco visible y su tamaño → medir.js `{ foco: true }` y Tab en vivo.
- 2.5.8 blanco ≥ 24 px: 40 px con mouse, 44 px con dedo → `pnpm --filter web tacto:medir`; `/espacio`.
- 4.1.2 nombre y estado: `aria-busy` mientras guarda; el «+» no se lee.
- 2.3.3 movimiento por interacción: se apaga (arranca quieto) → `data-movimiento="quieto"`.

## Fuentes
- [Norma] WCAG 2.2: 1.4.3, 1.4.11, 2.4.7, 2.4.13, 2.5.8, 2.3.3, 4.1.2. Media Queries Level 4 (`hover`).
- [Práctica] Material 3, capas de estado (hover 0.08 · pressed 0.10); Axess Lab, «Disabled buttons suck».
- Regla del repo: ADR-0351 (anillo), ADR-0358 (familias boton, accion.nuevo, accion.guardar, movimiento único), ADR-0596 (vidrio), ADR-0611 mejora 4 (confirma),
  ADR-0625 (quieto), ADR-0136 (sin rebote).

## Propuestas
- Apagado legible y alcanzable fuera de «mientras guarda» (propuesta 3 de /milimetro).
- Los 300 ms del ícono y la `@keyframes cayla-onda` repetida: los resuelve /movimiento.
```

### Comprobar en el navegador (pega en `javascript_tool` sobre una hoja abierta)

```js
(() => {
  const b = document.querySelector('[role="dialog"] .btn-primario') || document.querySelector('.btn-primario');
  if (!b) return { error: 'No hay ningún .btn-primario a la vista: abre una hoja que guarde.' };
  const s = getComputedStyle(b), r = b.getBoundingClientRect();
  return {
    texto: b.textContent.trim(), ancho: Math.round(r.width), alto: Math.round(r.height),
    padding: s.padding, radio: s.borderRadius, borde: `${s.borderWidth} ${s.borderColor}`,
    letra: `${s.fontFamily.split(',')[0]} ${s.fontSize}/${s.lineHeight} ${s.fontWeight}`, color: s.color, fondo: s.backgroundImage.slice(0, 80),
    transicion: s.transitionProperty + ' · ' + s.transitionDuration, voz: b.closest('[data-voz]')?.dataset.voz || 'hoja',
    tema: document.documentElement.dataset.tema || 'claro', movimiento: document.documentElement.dataset.movimiento,
    ondaQueCorre: [...document.styleSheets].flatMap((h) => { try { return [...h.cssRules]; } catch { return []; } })
      .filter((x) => x.name === 'cayla-onda').map((x) => x.cssText.replace(/\s+/g, ' ').slice(0, 90)),
  };
})();
```

Esperado (claro, hoja, 1440 × 900): alto 40, padding `8px 18px`, radio `999px`, DM Sans 13.5px peso 500, letra crema. Si `ondaQueCorre` trae dos reglas, la que
corre es la última.
