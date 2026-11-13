# Fuentes de `/tipografia`

Niveles: **[Evidencia]** estudio revisado por pares o experimento controlado · **[Norma]** WCAG, especificación web, guía oficial ·
**[Práctica]** tokens de sistemas de diseño, guías de oficio. **[Verificación]** = inspección directa de un archivo (fuente, paquete npm,
Node/ICU) hecha por la investigación del 2026-11 (`research_notes/Fundamentos de diseño de interfaz/tipografia.md`), reproducible desde la URL.
Un número de práctica nunca se presenta como hallazgo científico.

## Evidencia

| Fuente | Qué aporta aquí |
|---|---|
| Legge, G. E. y Bigelow, C. A. (2011). «Does print size matter for reading? A review of findings from vision science and typography». *Journal of Vision* 11(5):8. [PDF](https://legge.dl8.umn.edu/sites/legge.psych.umn.edu/files/2020-08/Legge%20Bigelow%202011%20Does%20size%20matter%20for%20reading%3F%20A%20review%20of%20findings%20from%20vision%20science%20and%20typography.pdf) | El tamaño que manda es la **altura x**, no el `font-size`. Tamaño crítico ≈ 0,2° de altura x (rango individual 0,15–0,3°); bajo él cae la velocidad. Con el cálculo de la investigación, DM Sans a 14 px en un monitor de 24" 1080p a 60 cm da ≈ 0,195°: justo en el crítico. Es la base del piso de 14 px y de «la serif no baja de 20 px». |
| Wallace, S. et al. (2022). «Towards Individuated Reading Experiences: Different Fonts Increase Reading Speed for Different Individuals». *ACM TOCHI* 29(4), art. 38. doi:10.1145/3502222. [PDF](https://jeffhuang.com/papers/Readability_TOCHI22.pdf) | 352 lectores, 16 letras. Cada persona lee ~35 % más rápido en su mejor letra que en la peor, sin cambiar la comprensión; la preferida coincide con la más rápida solo el 20 % de las veces. **EB Garamond fue la más rápida en promedio (312 ppm)**, pero solo para el 48 %. Sirve para no decir «la serif se lee peor en pantalla»; no sirve para poner párrafos de un ERP en serif (aquí se escanea, no se lee corrido). |
| Dyson, M. C. y Kipping, G. J. (1998). «The effects of line length and method of movement on patterns of reading from screen». *Visible Language* 32(2). [Revista](https://journals.uc.edu/index.php/vl/article/view/5671) | Líneas de 100 caracteres se leyeron más rápido que de 25, sin cambio de comprensión, pero la gente juzgó **55 la más fácil**. La medida cómoda es percepción además de velocidad: en un ERP, la comodidad pesa. |
| Perea, M., Rosa, E. y Marcet, A. (2017). «Where is the locus of the lowercase advantage during sentence reading?». *Acta Psychologica* 177:30–35. doi:10.1016/j.actpsy.2017.04.007. [PDF](https://www.uv.es/mperea/lowercaseUPPERCASE_reading.pdf) | **Hecho en español**, con movimiento ocular: oraciones en mayúsculas ≈ 4,6 % más lentas (2147 vs 2052 ms), más refijaciones. Por eso las versalitas son de 1 a 3 palabras y nunca una frase. |

## Norma

| Fuente | Qué aporta aquí |
|---|---|
| W3C (2023). *Understanding SC 1.4.12 Text Spacing* (WCAG 2.2, AA). [W3C](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) | Nada se recorta ni se pisa si se fuerza interlineado 1,5, párrafos 2×, letras 0,12 em y palabras 0,16 em. La elipsis pasa solo si hay forma de ver el texto completo; fallo F104; técnica C28 (cajas en `em`). Es el modo `espaciado` de `medir.js`. |
| W3C. *Understanding SC 1.4.4 Resize Text* (AA). [W3C](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | Texto al 200 % sin perder contenido ni función. Ver «No verificado». |
| W3C. *Understanding SC 1.4.8 Visual Presentation* (AAA). [W3C](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html) | Ancho de ≤ 80 caracteres e interlineado de 1,5 en párrafos. Es AAA: aquí da el **tope** de 80 de `medir.js`, no una obligación. Ver «No verificado». |
| W3C Internationalization. *Text size in translation*. [W3C](https://www.w3.org/International/articles/article-text-size) | Expansión al pasar del inglés a idiomas europeos: ≤ 10 caracteres 200–300 %, > 70 caracteres ~130 %. Lo corto es lo que más crece: botones, encabezados de columna, chips copiados de ejemplos en inglés. |
| Apple. *Human Interface Guidelines · Typography*. [HIG .md](https://developer.apple.com/design/human-interface-guidelines/typography.md) | macOS: cuerpo 13 pt, mínimo 10. «Avoid light font weights»; «Minimize the number of typefaces». Tracking de SF positivo en lo chico y negativo en el rango de texto (específico de SF: no se copia a otra letra). |
| Vercel. *Next.js Font API* (doc. de 2026-09-24). [Next.js](https://nextjs.org/docs/app/api-reference/components/font) | `next/font/google` aloja la letra en el build, `display: 'swap'` por defecto, solo el eje de peso salvo `axes`, `adjustFontFallback` en `true`; «use multiple fonts conservatively». Es como el repo carga EB Garamond, DM Sans (`app/layout.tsx`) e Inter (`lib/letra-estados.ts`). |

## Práctica (sistemas de diseño)

| Fuente | Qué aporta aquí |
|---|---|
| Material Design 3, `TypeScaleTokens.kt` (androidx-main). [Código](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt) | Body M 14/20; Label S 11/16 Medium +0,5; familia «Brand» solo en Display/Headline. Es el precedente de «la serif de marca solo en lo grande». |
| IBM Carbon, `@carbon/type` 11.71.0. [npm](https://registry.npmjs.org/@carbon/type/-/type-11.71.0.tgz) | body-01 14/20, label 12/16 (+0,32 px). Estilos «productivos» fijos para la interfaz y «expresivos» que crecen con la pantalla solo en lo editorial. |
| Atlassian, `@atlaskit/tokens` 20.11.0. [npm](https://registry.npmjs.org/@atlaskit/tokens/-/tokens-20.11.0.tgz) | Body 14/20; tokens `font.metric.*` solo para cifras de tablero; heading de marca aparte del de interfaz. |
| GitHub Primer, `typography.json5`. [Código](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/typography/typography.json5) | 14 px «default body text size for UI»; interlineado 1,25 «not recommended for multi-line body text», 1,5 para cuerpo. |
| Microsoft Fluent 2, `fonts.ts`. [Código](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/fonts.ts) | Base300 14/20; **`fontFamilyNumeric`**: una familia aparte solo para cifras. Es el precedente directo de la propuesta 1. |
| Shopify Polaris, `font.ts` / `size.ts`. [Código](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/font.ts) | Interlineados todos múltiplos de 4 (12, 16, 20, 24…); pesos intermedios con letra variable (450/550/650). |
| Radix Themes, `typography.css`. [Código](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/typography.css) | Tracking que se vuelve negativo al crecer (0 → −0,025 em a 60 px); serif solo en `em`/`quote` con `font-size-adjust`. |
| Tailwind CSS v4, `theme.css`. [Código](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css) | De fábrica `text-xs` 12/16 y `text-sm` 14/20 (el repo los subió a 13/1,5 y 15/1,55 el 2026-09-08). |
| Tim Brown (2011). «More Meaningful Typography». *A List Apart*. [ALA](https://alistapart.com/article/more-meaningful-typography/) | La escala modular es una herramienta, «not magic»: se redondea si se documenta. Justifica una rampa corta redondeada en vez de una razón fija. |
| Bringhurst, citado en webtypography.net 2.1.2. [webtypography.net](https://webtypography.net/2.1.2) | 45–75 caracteres por línea, 66 ideal; 40–50 en varias columnas; medir en `em`/`ch`. |
| Butterick, *Practical Typography · Line length*. [Butterick](https://practicaltypography.com/line-length.html) | 45–90 caracteres. Coincide con el rango de arriba. |

## Verificación (archivos inspeccionados por la investigación)

| Qué | Dónde |
|---|---|
| **DM Sans 4.004 (Google Fonts) no tiene `tnum`, `pnum`, `lnum`, `onum`, `smcp` ni `c2sc`**; sí `case`, `locl`, `frac`, `ss01–ss08`. Dígitos proporcionales (el «1» = 342, el «0» = 656 de 1000). Altura x 0,526 em. Ejes opsz 9–40 (por defecto 9) y wght 100–1000. | [DMSans[opsz,wght].ttf](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf) |
| **EB Garamond 1.003: cifras lining tabulares por defecto** (todas 480), `onum`, `pnum`, `smcp`, `c2sc`, `case`. Altura x 0,400 em. Peso 400–800, sin finos. | [EBGaramond[wght].ttf](https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf) |
| `Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'})` → `S/ 1,234,567.89` con **U+00A0**; 4 cifras agrupan (`1,234`); negativo `-S/ 50.50`; porcentaje `12.5%`; fechas `12 nov. 2026`, hora `10:30 a. m.` (Node 22, ICU 78.3, CLDR 48). | Node/ICU, reproducible en la consola del navegador |
| Que DM Sans no alinea cifras **ya se midió una vez en este repo**: ADR-0446 (la tienda) lo encontró en veinte reglas y pasó sus precios a Heebo. | `docs/adr/0446-identidad-de-la-tienda-heebo-y-logo-oficial.md` |

## No verificado (honesto)

- **Esta sesión no volvió a abrir los archivos de letra**: la descarga de Google Fonts quedó bloqueada aquí. Lo de DM Sans y EB Garamond sale
  de la investigación y de ADR-0446. **Antes de decidir la propuesta 1, se mide en el navegador** con `medir.js` («1111» contra «0000» con la
  letra computada): eso sí es la letra que sirve `next/font`.
- **Que Inter (la de `lib/letra-estados.ts`) tenga `tnum`** no se verificó en ningún archivo; se sabe por su documentación. `medir.js` en
  `/finanzas/reportes` lo confirma o lo niega.
- Altura x de Inter: no medida. Importa para la propuesta 1 (la mezcla de dos sans en una fila).
- WCAG 1.4.4 y 1.4.8: el texto citado es de conocimiento general; no se abrieron sus páginas en esta sesión.
- No hay estudio que compare 13, 14 y 16 px en tablas de ERP: el piso de 14 es práctica más el tamaño crítico de Legge y Bigelow.
- No hay cifra empírica de tracking para mayúsculas espaciadas: el 0,13 em del repo se queda como está; no se propone cambiarlo.
- Que `font-feature-settings: "case"` mejore ¿ ¡ ( ) – en las versalitas de DM Sans: inferencia por la función presente, sin prueba visual.
- Qué hace la API de Google Fonts con DM Sans sin `axes: ['opsz']` (si sirve opsz 9 o un rango).
- Soporte de `hyphens: auto` en español por navegador en 2026, y `text-align: "."` para alinear por el decimal.
- Que la mayúscula solo inicial en títulos es la norma del español (RAE/Fundéu): conocimiento general, sin cita abierta.
- Que el signo menos `−` (U+2212) mide lo mismo que una cifra tabular y el guion `-` no: práctica de oficio, sin fuente abierta; `medir.js` no lo mide.
- Que la norma peruana o SUNAT pida «S/» con o sin espacio en un comprobante: solo se verificó lo que hace CLDR.
