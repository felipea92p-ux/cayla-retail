# Fuentes de /espacio — comentadas

Niveles: **[Evidencia]** estudio revisado por pares o experimento controlado · **[Norma]** WCAG, especificación web, guía oficial de
plataforma · **[Práctica]** tokens de sistemas de diseño, NN/g sin experimento, design engineers. Un número de práctica nunca se presenta
como hallazgo científico. Los valores de tokens se leyeron de los archivos fuente en GitHub (rama principal) el **2026-11-12**; cambian, así
que vuelve a mirarlos antes de citarlos en un ADR.

## Normas

| Clave | Fuente | Nivel | Qué aporta |
|---|---|---|---|
| W-258 | W3C, *Understanding SC 2.5.8 Target Size (Minimum)*, WCAG 2.2. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | [Norma] | El piso legal: **24 × 24 CSS px**, nivel **AA**. Excepciones: separación (un círculo de 24 px centrado en el blanco chico no corta otro blanco ni el círculo de otro chico), equivalente en la misma página, en línea dentro de una frase, control del navegador sin tocar, esencial. Por qué 24 y no más: cubre todo puntero (no solo el dedo) y salió de medir los blancos de sitios con mucho tráfico. Recomienda apuntar a 44 en lo importante y dice que «una opción de densidad puede ayudar». |
| W-255 | W3C, SC 2.5.5 *Target Size (Enhanced)*, WCAG 2.1/2.2 (citado desde W-258). | [Norma] | **44 × 44 CSS px**. Es el objetivo, no la obligación. |

## Evidencia

| Clave | Fuente | Nivel | Qué aporta |
|---|---|---|---|
| PARHI | Parhi, Karlson y Bederson, «Target Size Study for One-Handed Thumb Use on Small Touchscreen Devices», MobileHCI 2006. DOI 10.1145/1152215.1152260 · https://www.microsoft.com/en-us/research/?p=155150 | [Evidencia] | Con el pulgar y una mano: **9,2 mm** para tocar una cosa suelta (botón, casilla) y **9,6 mm** para tocar en serie (teclear). La velocidad mejoró con el tamaño; el error **no** difirió de forma significativa entre tamaños probados. 9,2–9,6 mm ≈ 44–48 CSS px en un teléfono común (inferencia de la investigación, no del estudio). |
| NNG-PLANO | Nielsen Norman Group, «Flat UI Elements Attract Less Attention and Cause Uncertainty», 2017. https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/ | [Evidencia] | Eyetracking en escritorio, 71 personas, 9 sitios reales en dos versiones (18 diseños), entre sujetos. Con **significantes débiles**: **22 % más tiempo** y **25 % más fijaciones** (p < 0,05); en 6 de 9 pares el mapa de calor cambió y ningún par favoreció la versión débil. Caso Brilliant Earth: 86 % (25/29) fue directo al blanco con significantes fuertes contra 50 % (12/24) con débiles (p < 0,005). Lo plano funcionó con poca densidad, diseño tradicional y blancos de alto contraste. Ojo: midió solo la búsqueda, no los clics errados. Es NN/g, pero con experimento y estadística: por eso va como Evidencia. |
| ENDERS | Jessica Enders, «Zebra Striping: Does it Really Help?», A List Apart. https://alistapart.com/article/zebrastripingdoesithelp/ | [Evidencia] | Experimento en línea, **244** personas, tabla de 15 × 9, 6 preguntas (3 con cebra, 3 sin), orden al azar. **Precisión prácticamente igual** con y sin cebra; una sola diferencia de velocidad significativa (pregunta 6). **46 % prefirió** la cebra y 33 % no tuvo preferencia. Algunos siguen la fila con el dedo o el mouse. Enders no da una recomendación firme; tablas más anchas o con scroll lateral podrían mostrar más efecto. |
| NNG-F | NN/g, «F-Shaped Pattern of Reading on the Web» (2006, confirmado 2017). https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/ | [Evidencia] | La F es una **falla**: aparece cuando la página no da señales fuertes, y lo de la derecha se pierde. Con títulos, grupos y cifras marcadas la lectura pasa a «torta en capas» (se leen los títulos) o «manchas» (se buscan números o palabras). Sostiene: identificador y estado a la izquierda, grupos por espacio, cifras alineadas. |

## Práctica (sistemas de diseño)

| Clave | Fuente | Nivel | Qué aporta |
|---|---|---|---|
| CARBON | IBM Carbon: `layout.tokens.json`, `packages/layout/src/index.ts`, `_data-table.scss`, *Color usage*. https://github.com/carbon-design-system/carbon · https://carbondesignsystem.com/elements/color/usage | [Práctica] | Espacio 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160 px sobre un mini-unit de 8. Retícula 2x: sm 320 (4 col, margen 0), md 672 (8 col, 16), lg 1056 (16 col, 16), xlg 1312, max 1584 (24). Filas de tabla 24 · 32 · 40 · **48 (de fábrica)** · 64, con cebra opcional. Tamaños de control 24/32/40/48/64/80. Radios 0, 2, 4, 8, 16, 24, max. Profundidad por **capas de fondo** (base → layer-01 → 02 → 03) con su campo y su borde por capa, no por sombras. |
| PRIMER | GitHub Primer: `functional/size/size.json5`, `base/size/size.json5`, `breakpoints.json5`, `viewport.json5`. https://github.com/primer/primitives | [Práctica] | Alto de control 24 · 28 · **32 (formularios)** · 40 · 48. `control.minTarget`: **fine 16, coarse 44**. «El hueco va con el tamaño del control». Cortes 320, 544, 768, 1012, 1280, 1400. Anchos de capa 192/320/480/640/960. |
| SAP | SAP Fiori, *Content Density (Cozy and Compact)*. https://www.sap.com/design-system/fiori-design-web/v1-136/foundations/visual/cozy-compact | [Práctica] | Compacto (mouse y teclado): filas y barras de **32 px**, la letra no cambia. Cómodo (dedo): área de **44 px**; en teléfono y tablet se **impone** el cómodo. **Nunca mezclar las dos densidades en una misma página**; la densidad se fija a nivel de app. |
| ATLASSIAN | Atlassian Design, *Spacing*. https://atlassian.design/foundations/spacing | [Práctica] | Escala 0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80. Bandas: 0–8 dentro de piezas compactas (ícono-texto, insignia, relleno de campo); 12–24 relleno de botón y aire vertical de tarjeta; 32–80 diseño de página. Separa relleno de ADENTRO y hueco ENTRE piezas: «agrupa cerca lo relacionado, usa el espacio para jerarquizar». |
| POLARIS | Shopify Polaris: `space.ts`, `size.ts`, `border.ts`, `breakpoints.ts`. https://github.com/Shopify/polaris | [Práctica] | Escala 0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40…128. **Relleno de celda de tabla 6 px**; tarjeta 16 de relleno y 16 entre tarjetas; grupo de botones 8. Radios 0, 2, 4, 6, 8, 12, 16, 20, 30, 9999. |
| FLUENT | Microsoft Fluent 2: `spacings.ts`, `borderRadius.ts`. https://github.com/microsoft/fluentui | [Práctica] | Espacio 0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32 (con «nudges» de 6 y 10). Radios 0, 2, 4, 6, 8, 12, 16, 24, 32, 40, circular. |
| RADIX | Radix Themes: `space.css`, `radius.css`. https://github.com/radix-ui/themes | [Práctica] | Espacio 4, 8, 12, 16, 24, 32, 40, 48, 64 × `--scaling`: **la densidad como un multiplicador global**, no como otra escala. |
| MDC | Material Components Web, `mdc-density` y `mdc-data-table`. https://github.com/material-components/material-components-web | [Práctica] | Densidad en pasos de **−4 px** sobre el alto base («36 + 4 × (−3) = 24»). Listas, tablas y formularios largos ganan con más densidad. Columnas numéricas alineadas a la derecha (`--numeric`). |
| TAILWIND | Tailwind CSS v4, `theme.css`. https://github.com/tailwindlabs/tailwindcss | [Práctica] | `--spacing: 0.25rem` (4 px); cortes sm 640, md 768, lg 1024, xl 1280, 2xl 1536; radios xs 2 … 4xl 32. Es lo que corre el repo (no redefine `--spacing` ni los cortes en `globals.css`; verificado con grep el 2026-11-12). |
| ANDROID | AndroidX `WindowSizeClass.kt`. https://github.com/androidx/androidx | [Práctica] | Clases de ventana: compacta < 600, media ≥ 600, expandida ≥ 840, grande ≥ 1200, extra ≥ 1600 dp. |

## Lo que dice el repo (fuente interna, manda sobre todo lo de arriba)

- `apps/web/app/globals.css` — radios `--radius-sm…2xl` (4/8/12/16/20) y los del vidrio `--radius-campo` 14, `--radius-tarjeta` 22,
  `--radius-cajon` 28, `--radius-hoja` 32, `--radius-boton` 999; `--spacing-lateral` 17 rem (272 px) y 5,25 rem plegado (84 px); `--shadow-*`
  solo para lo que flota (ADR-0012); `btn-cayla`, `btn-chico`, `pildora-cayla`, `caja-cayla`, `nota-cayla`, `fila-cayla` con su cebra.
- `apps/web/app/estilos/vidrio/recetas.css` y `pantalla.css` — pozo, gota, placa, vidrio claro (`--vidrio-claro-sombra`); la tabla de vidrio
  **sin rayado** y con un hilo entre filas.
- `apps/web/app/estilos/vidrio/campos-y-botones.css` — campo de 40 px (`.caja-campo`, en `campos-y-casillas.css`), botón píldora de 40 px.
- `apps/web/app/estilos/tacto.css` + `apps/web/tacto/medir.mjs` + `lib/tacto.test.ts` — 44 px con `pointer: coarse` (ADR-0611, mejora 5).
- `apps/web/app/estilos/tabla-corte.css` + `lib/tabla-corte-reglas.ts` — la tabla mira su ancho: escalones de 80 px entre 400 y 1200.
- `components/AppShell.tsx` — márgenes del `<main>` y `CON_TOPE_DE_ANCHO` (ADR-0462, `lib/ancho-completo.test.ts`).
- ADR-0012 (esquinas suaves y sombras solo en lo que flota), ADR-0169 (paleta y orden de pantalla), ADR-0350 (Formidable), ADR-0462,
  ADR-0596 (vidrio), ADR-0611 (tacto), ADR-0623 (lo que se desplaza no se desenfoca).

## No verificado (honesto)

- **Ley de Fitts** (Fitts 1954, *J. Exp. Psychology* 47(6); formulación de Shannon por MacKenzie 1992, *Human-Computer Interaction* 7(1)):
  es canónica —el tiempo para alcanzar un blanco crece con log₂(distancia/ancho + 1)— pero **no se leyó la fuente en esta investigación** y
  los DOI son de memoria. Se usa como fundamento cualitativo, con su etiqueta [Evidencia] pendiente de cita.
- **Apple HIG 44 × 44 pt** y **Material 48 × 48 dp**: conocidos, pero sus páginas no se pudieron leer (se generan con JavaScript). El 44 del
  repo se sostiene igual con W-255, SAP y Primer.
- **Nivel de 2.5.5**: es AAA en WCAG 2.1 y 2.2, pero la página leída no lo dice; no se volvió a confirmar.
- **Gestalt** (proximidad, región común), **Hick-Hyman** y la regla «adentro ≤ entre»: ningún sistema la escribe como regla numérica; se
  atribuye a la proximidad de Gestalt y a *Refactoring UI*, ninguno leído aquí. Se usa como [Práctica].
- **Medida de lectura** (45–75 caracteres; `max-w-prose` = 65 ch en Tailwind): no la cubrió esta investigación. Es de `/tipografia`.
- **Radios concéntricos** (radio de adentro = radio de afuera − separación): práctica extendida de diseño industrial y de interfaces, sin
  fuente leída. Ningún estudio sobre qué «significa» un radio de 0, 4 u 8 px: lo de «amable» o «serio» es opinión.
- **Estudio de productividad compacto vs. cómodo**: no se encontró ninguno revisado por pares. Que la densidad ayude al experto lo dicen
  Material y SAP, no un experimento.
- Material 3 (tokens de espacio y de tabla, 52/56 px), Carbon UI Shell (cabecera de 48 px), anchos de lateral de 240–256 px, Hoober 2013
  (cómo se sostiene el teléfono), Vercel Geist y Linear: no se leyeron.
- Tamaños del repo **calculados del CSS, no medidos**: la fila de `<Tabla>` (≈ 44 px) y el `btn-chico` (ver propuesta 2). Se confirman con
  `referencia/medir.js` antes de citarlos.
