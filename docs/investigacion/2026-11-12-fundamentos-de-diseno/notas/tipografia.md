# Tipografía para interfaces densas en datos (ERP web CAYLA — Next.js + Tailwind + shadcn/ui; fuentes de marca EB Garamond + DM Sans; UI en español) — notas a nov. 2026

Leyenda de tipo de respaldo: **[Evidencia]** = investigación empírica revisada por pares; **[Estándar]** = norma (W3C/WCAG) o especificación; **[Práctica]** = valores de sistemas de diseño o guías de oficio; **[Verificación propia]** = inspección directa hecha en esta sesión (archivos de fuente, paquetes npm, Node/ICU), reproducible desde la URL citada.

---

## 1. Escalas tipográficas: escalas modulares y rampas de los sistemas de diseño líderes (px/rem, interlineado, tracking); tamaño mínimo de cuerpo en UIs densas

### Takeaway
Casi todos los sistemas de producto convergen en **14 px como cuerpo por defecto de UI densa** (con 12 px como piso para etiquetas/captions y 16 px para cuerpo "largo"), interlineados en píxeles fijos múltiplos de 4 (12/16, 14/20, 16/24) y una rampa corta de ~6–10 pasos; la escala modular (Tim Brown) es una herramienta de proporción, no una regla, y los sistemas productivos la abandonan en los tamaños chicos para redondear a la rejilla de 4 px.

### Cited Findings
**Escala modular (teoría / práctica)**
- [Práctica] Tim Brown ("More Meaningful Typography", A List Apart, 3 may. 2011) define la escala modular citando a Bringhurst: "a prearranged set of harmonious proportions"; ejemplo con razón áurea 1:1.618 (multiplicar para subir, dividir para bajar); propone dos valores base: el tamaño de cuerpo (él usó 18 px en Minion) y un "número importante" (190 px, el titular), generando escalas "double-stranded" en modularscale.com; advierte "Modular scales are a tool, they're not magic" y que se pueden redondear valores si se documenta — [A List Apart](https://alistapart.com/article/more-meaningful-typography/)

**Material Design 3** (tokens oficiales en código de Jetpack Compose, rama androidx-main) — [Práctica] [Verificación propia] — [TypeScaleTokens.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt)
- Display L 57/64 (tracking −0.2), Display M 45/52 (0), Display S 36/44 (0); Headline L 32/40, M 28/36, S 24/32 (tracking 0, peso Regular, familia "Brand").
- Title L 22/28 Regular (0); Title M 16/24 Medium (+0.2); Title S 14/20 Medium (+0.1).
- Body L 16/24 Regular (+0.5); Body M 14/20 Regular (+0.2); Body S 12/16 Regular (+0.4) (familia "Plain").
- Label L 14/20 Medium (+0.1); Label M 12/16 Medium (+0.5); Label S 11/16 Medium (+0.5). (Unidades sp ≈ px en web.)
- Nota: los valores de tracking en androidx-main (0.2 / −0.2) difieren de los que recuerdo de la tabla web de m3.material.io (0.25 / −0.25); no pude verificar la página web (renderizada por JS). Usar los del código como fuente.

**Apple HIG** — [Práctica] — [HIG Typography (versión .md)](https://developer.apple.com/design/human-interface-guidelines/typography.md)
- Tamaño por defecto / mínimo: iOS/iPadOS 17/11 pt; **macOS 13/10 pt**; tvOS 29/23; visionOS 17/12; watchOS 16/12.
- Estilos de macOS (tamaño/interlineado pt): Large Title 26/32, Title 1 22/26, Title 2 17/22, Title 3 15/20, Headline 13/16 Bold, **Body 13/16**, Callout 12/15, Subheadline 11/14, Footnote 10/13, Caption 1 10/13, Caption 2 10/13 Medium.
- Tracking de SF en macOS (1/1000 em): 10 pt +12, 11 pt +6, 12 pt 0, 13 pt −6, 14 pt −11, 15 pt −16, 16 pt −20, 17 pt −26, 20 pt −23, 22 pt −12, 24 pt +3, 28 pt +14, 32 pt +13, 48 pt +8, 80 pt 0 (positivo en tamaños chicos, negativo en el rango de texto). Esto es específico de SF y su tabla "dinámica"; no es transferible tal cual a otra fuente.
- "In general, avoid light font weights" (preferir Regular, Medium, Semibold, Bold; evitar Ultralight, Thin, Light, sobre todo en texto chico); con fuentes de peso fino "aim for larger than the recommended sizes"; "Minimize the number of typefaces you use, even in a highly customized interface".

**IBM Carbon** (@carbon/type 11.71.0, npm) — [Práctica] [Verificación propia] — [tarball npm @carbon/type](https://registry.npmjs.org/@carbon/type/-/type-11.71.0.tgz)
- Escala base (px): 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 54, 60, 68, 76, 84, 92, 102, 112, 122, 132, 144, 156.
- Estilos "productive" (UI): label-01 / helper-text-01 / legal-01 = 0.75 rem (12 px), lh 1.33333 (16 px), tracking 0.32 px; **body-compact-01 = 0.875 rem (14 px), lh 1.28572 (18 px), tracking 0.16 px**; body-01 = 14 px, lh 1.42857 (20 px), 0.16 px; body-compact-02 = 16 px/1.375 (22 px); body-02 = 16 px/1.5 (24 px); heading-compact-01 = 14 px, peso 600, lh 1.28572; heading-compact-02 = 16 px 600/1.375; heading-03 = 20 px/1.4; heading-04 = 28 px/1.28572; heading-05 = 32 px/1.25; code-01 = IBM Plex Mono 12 px/1.33333.
- Estilos "expressive"/"fluid" cambian por breakpoint: p. ej. expressive-heading-05 = 32 px/1.25 → md 36 px peso 300 lh 1.22 → lg 42 px/1.19 → xlg 48 px/1.17 → max 60 px. Es decir, productivo = tamaños fijos y compactos para UI; expresivo = tamaños que crecen con el viewport para páginas editoriales.

**Atlassian Design System** (@atlaskit/tokens 20.11.0) — [Práctica] [Verificación propia] — [tarball npm @atlaskit/tokens](https://registry.npmjs.org/@atlaskit/tokens/-/tokens-20.11.0.tgz) (archivo `dist/cjs/artifacts/themes/atlassian-typography.js`)
- Body large 16/24 (400); **Body 14/20 (400)**; Body small 12/16 (400).
- Headings (peso 653, "Atlassian Sans"): xxlarge 32/36, xlarge 28/32, large 24/28, medium 20/24, small 16/20, xsmall 14/20, xxsmall 12/16.
- Tokens específicos para cifras: metric-large 28/32, metric-medium 24/28, metric-small 16/20 (peso 653). Pesos: regular 400, medium 500, semibold 600, bold 653. Código: 0.875em/1 "Atlassian Mono".

**GitHub Primer** (primitives, base/typography) — [Práctica] [Verificación propia] — [typography.json5](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/typography/typography.json5)
- Tamaños: xs 0.75 rem (12 px, "captions and compact UI elements"), **sm 0.875 rem (14 px) "Default body text size for UI"**, md 1 rem (16 px), lg 1.25 rem (20 px), xl 2 rem (32 px), 2xl 2.5 rem (40 px).
- Interlineados: tight 1.25 ("single-line text in compact UI elements like labels, badges, buttons… Not recommended for multi-line body text"), snug 1.375, normal 1.5 ("Default choice for body text"), relaxed 1.625 ("smaller text sizes (12–13px)"), loose 1.75. Pesos 300/400/500/600.

**Microsoft Fluent 2** (@fluentui/tokens) — [Práctica] [Verificación propia] — [fonts.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/fonts.ts)
- Tamaño/interlineado: Base100 10/14, Base200 12/16, **Base300 14/20**, Base400 16/22, Base500 20/28, Base600 24/32, Hero700 28/36, Hero800 32/40, Hero900 40/52, Hero1000 68/92. Pesos 400/500/600/700.
- Define una familia separada para cifras: `fontFamilyNumeric: Bahnschrift, 'Segoe UI', …` (precedente de usar una familia distinta solo para números).

**Shopify Polaris** (polaris-tokens) — [Práctica] [Verificación propia] — [font.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/themes/base/font.ts), [size.ts](https://raw.githubusercontent.com/Shopify/polaris/main/polaris-tokens/src/size.ts)
- Tamaños disponibles: 11, 12, 13, 14, 16, 18, 20, 22, 24, 30, 32, 36, 40 px; interlineados 12, 16, 20, 24, 28, 32, 40, 48 px (todos múltiplos de 4).
- Pesos con variable font Inter: regular **450**, medium 550, semibold 650, bold 700 (usa pesos intermedios del eje wght).
- Tracking: densest −0.54 px, denser −0.3 px, dense −0.2 px, normal 0.

**Radix Themes** (base de muchos temas shadcn) — [Práctica] [Verificación propia] — [typography.css](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/typography.css)
- Pasos 1–9: 12/16, 14/20, 16/24, 18/26, 20/28, 24/30, 28/36, 35/40, 60/60 px (todo × `--scaling`); interlineado de headings más apretado (p. ej. paso 3 = 16/22, paso 6 = 24/30).
- Tracking por paso: +0.0025em (12 px), 0, 0, −0.0025em, −0.005em, −0.00625em, −0.0075em, −0.01em, −0.025em (60 px): negativo progresivo al crecer.
- Cuerpo por defecto 16 px / 1.5; usa `leading-trim` (0.42em/0.36em) y `font-size-adjust` para `em`/`quote` en serif (1.18).

**Tailwind CSS v4** (lo que shadcn/ui hereda por defecto) — [Práctica] [Verificación propia] — [theme.css](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css)
- text-xs 0.75 rem / lh 1 rem (12/16); text-sm 0.875 rem / 1.25 rem (14/20); text-base 1 rem / 1.5 rem (16/24); text-lg 1.125/1.75 rem (18/28); text-xl 1.25/1.75 rem (20/28); text-2xl 1.5/2 rem (24/32); text-3xl 1.875/2.25 rem (30/36).
- leading-tight 1.25, snug 1.375, normal 1.5, relaxed 1.625, loose 2; tracking-tighter −0.05em, tight −0.025em, wide 0.025em, wider 0.05em, widest 0.1em.

### Inferences
- Consenso multi-sistema (Material Body M, Carbon body-01, Atlassian Body, Primer sm, Fluent Base300, Radix 2, Tailwind text-sm): **14 px / 20 px de interlineado** es el "cuerpo de UI densa" estándar de facto; 12/16 es el piso para etiquetas y captions; 16/24 para texto de lectura continua (descripciones largas, ayudas). Apple macOS va aún más bajo (13/16) porque SF está muy optimizada y en pantallas Retina.
- 13 px solo aparece en Polaris (y macOS); 11 px solo para etiquetas muy cortas (Material Label S, Polaris). Para un ERP en tienda usado por personal no técnico, ir por debajo de 12 px no tiene respaldo en ningún sistema salvo casos puntuales.
- Los sistemas expresan el interlineado como **valor absoluto múltiplo de 4** (16, 20, 24, 28, 32…) y no como razón fija: la razón baja al crecer el tamaño (≈1.43 a 14 px; ≈1.25 a 32 px; ≈1.0–1.1 en display).
- Pesos: el patrón dominante es 400 (texto) / 500 (labels, botones) / 600 (títulos y encabezados de tabla); el 700 se usa poco en UI. Polaris demuestra que con variable fonts pueden usarse pesos intermedios (450/550/650).
- Rampa recomendable para un ERP (inferencia, no regla): 12/16 · 14/20 · 16/24 · 20/28 · 24/32 · 30–32/36–40, es decir 6 pasos, coincidente con text-xs…text-3xl de Tailwind (que ya trae shadcn).

### Gaps
- No pude leer las páginas web de m3.material.io ni Carbon (renderizadas por JS); usé tokens de código fuente. La diferencia de tracking 0.2 vs 0.25 en Material queda sin resolver.
- No encontré investigación empírica específica que compare 13 vs 14 vs 16 px en tablas de ERP; el umbral es de práctica, complementado con la evidencia de tamaño crítico (sección 2).

---

## 2. Investigación de legibilidad: longitud de línea, interlineado, altura x y tamaño, serif vs sans, estudios recientes, mayúsculas sostenidas y tracking

### Takeaway
La evidencia empírica dice que, dentro de un rango "fluido" de tamaños, la fuente concreta importa más por **individuo** que por categoría (serif/sans), que el tamaño efectivo lo determina la **altura x** (no el font-size nominal), que líneas de ~55 caracteres se *perciben* como más cómodas aunque líneas más largas se lean algo más rápido en pantalla, y que el texto en mayúsculas sostenidas cuesta ~5 % más de tiempo de lectura.

### Cited Findings
**Tamaño y altura x**
- [Evidencia] Legge & Bigelow (2011), "Does print size matter for reading? A review of findings from vision science and typography", *Journal of Vision* 11(5):8, 1–22: tamaño crítico de impresión (por debajo del cual cae la velocidad) de consenso **0.2° de altura x** (rango individual 0.15°–0.3°); velocidad máxima en un rango de diez veces, **0.2°–2° de altura x** (≈1.4 mm–14 mm a 40 cm); el texto de artículos de noticias online promedia 0.21° y el de portadas 0.19° (ligeramente bajo el crítico, pensado para hojear); el tamaño crítico depende en parte de la fuente — [PDF Legge & Bigelow 2011](https://legge.dl8.umn.edu/sites/legge.psych.umn.edu/files/2020-08/Legge%20Bigelow%202011%20Does%20size%20matter%20for%20reading%3F%20A%20review%20of%20findings%20from%20vision%20science%20and%20typography.pdf)
- [Verificación propia] Altura x medida en los archivos de Google Fonts: **DM Sans = 0.526 em** (526/1000 UPM; x/altura de mayúscula 0.751); **EB Garamond = 0.400 em** (400/1000; x/mayúscula 0.615) — [DM Sans TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf), [EB Garamond TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf)

**Fuentes, individuos, serif vs sans**
- [Evidencia] Wallace, Bylinskii, Dobres, Kerr, Berlow, Treitman, Kumawat, Arpin, Miller, Huang & Sawyer (2022), "Towards Individuated Reading Experiences: Different Fonts Increase Reading Speed for Different Individuals", *ACM TOCHI* 29(4), art. 38, doi:10.1145/3502222: 352 participantes válidos (de 500), 16 fuentes; cada persona leyó **~35 % más rápido** en su fuente más rápida (314 ppm) que en la más lenta (232 ppm) **sin cambio en comprensión** (mediana 90 %); la fuente preferida coincidió con la más rápida solo el 20 % de las veces (nivel de azar) aunque el 73 % creía lo contrario; **EB Garamond fue la fuente más rápida en promedio (312 ppm)**, pero solo fue la más rápida para el 48 % de las personas; en lectores ≥35 años la velocidad cae 2.6 ppm/año y la fuente importa más (EB Garamond y Montserrat más rápidas; Avant Garde y Open Sans más lentas). El estudio no reporta una comparación directa serif vs sans (3 serif vs 13 sans) — [PDF TOCHI 2022](https://jeffhuang.com/papers/Readability_TOCHI22.pdf); ficha: [Adobe Research](https://research.adobe.com/publication/towards-individuated-reading-experiences-different-fonts-increase-reading-speed-for-different-individuals)

**Longitud de línea (measure)**
- [Práctica] Bringhurst (citado en webtypography.net 2.1.2): "Anything from 45 to 75 characters is widely regarded as a satisfactory length of line"; "The 66-character line (counting both letters and spaces) is widely regarded as ideal"; "For multiple column work, a better average is 40 to 50 characters". Recomienda fijar el ancho en `em` (un carácter ≈ 0.5 em → 33em ≈ 66 caracteres) — [webtypography.net 2.1.2](https://webtypography.net/2.1.2)
- [Práctica] Butterick: "Aim for an average line length of 45–90 characters, including spaces" — [Practical Typography, Line length](https://practicaltypography.com/line-length.html)
- [Evidencia] Dyson & Kipping (1998), "The effects of line length and method of movement on patterns of reading from screen", *Visible Language* 32(2): líneas de 100 caracteres se leyeron más rápido que líneas de 25; la comprensión no cambió; los lectores calificaron 100 cpl como la más difícil y **55 cpl como la más fácil** (percepción ≠ rendimiento) — [Visible Language](https://journals.uc.edu/index.php/vl/article/view/5671)

**Mayúsculas sostenidas**
- [Evidencia] Perea, Rosa & Marcet (2017), "Where is the locus of the lowercase advantage during sentence reading?", *Acta Psychologica* 177:30–35, doi:10.1016/j.actpsy.2017.04.007 (estudio en español, movimiento ocular): oraciones en minúscula leídas más rápido (≈2052 vs 2147 ms; coste ≈4.6 % para mayúsculas); duración de mirada +31 ms y tiempo total +37 ms en palabras en mayúsculas; más refijaciones en mayúsculas; los autores lo atribuyen a la familiaridad del formato, no a la "forma de la palabra" — [PDF Perea et al. 2017](https://www.uv.es/mperea/lowercaseUPPERCASE_reading.pdf)

**Tracking (letter-spacing)**
- [Práctica] Tracking dependiente del tamaño en SF (Apple): positivo en 6–11 pt (+41 a +6 milésimas de em), negativo en el rango de texto/títulos medianos (13–22 pt: −6 a −26) — [HIG .md](https://developer.apple.com/design/human-interface-guidelines/typography.md)
- [Práctica] Radix: tracking negativo progresivo con el tamaño, de 0 a −0.025em en 60 px — [Radix typography.css](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/typography.css); Material: labels pequeños con tracking positivo (+0.5 sp a 11–12 sp) — [TypeScaleTokens.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt); Carbon: +0.32 px a 12 px, +0.16 px a 14 px, 0 desde 16 px — [@carbon/type](https://registry.npmjs.org/@carbon/type/-/type-11.71.0.tgz)

### Inferences
- **Corrección por altura x**: a igual `font-size`, EB Garamond se ve ~24 % más pequeña que DM Sans (0.400/0.526 = 0.76). EB Garamond a 16 px tiene la altura x de DM Sans a ~12.2 px. Si se usa EB Garamond en títulos, compensar subiendo tamaño (p. ej. ×1.25–1.3) o con `font-size-adjust` (Radix usa 1.18 para su serif en `em`/`quote`).
- Cálculo propio de ángulo visual (a 60 cm, pantalla a escala 100 %): DM Sans 14 px en monitor 24" 1080p → altura x ≈2.04 mm ≈0.195°; en 27" 1440p ≈0.164°; DM Sans 12 px en 24" 1080p ≈0.167°; EB Garamond 16 px en 24" 1080p ≈0.169°. Es decir, **14 px de DM Sans está justo en el tamaño crítico** de Legge & Bigelow y 12 px queda por debajo (aceptable para etiquetas cortas que se escanean, no para lectura de párrafos). El escalado del SO (125–150 % habitual en laptops) sube estos valores; el resultado exacto depende del equipo. Argumento para no bajar el cuerpo de 14 px y para usar 16 px en texto corrido.
- Wallace et al. dan respaldo empírico (no solo de marca) a usar EB Garamond en contenido de lectura; pero en un ERP el texto es mayormente escaneo de datos cortos, donde la investigación de lectura continua aplica poco. La decisión serif/sans debe basarse en jerarquía, altura x y disponibilidad de cifras (sección 3), no en "serif es menos legible en pantalla".
- Longitud de línea en un ERP: aplica a descripciones, ayudas, notas y mensajes; limitar con `max-width: 65ch`–`75ch` (en ch o em, siguiendo a Bringhurst). Las tablas no se rigen por measure sino por escaneo por columnas.
- Mayúsculas: evitar mayúsculas sostenidas en contenido; si se usan para micro-etiquetas (encabezados de sección, badges), que sean de 1–3 palabras y con tracking positivo (práctica de Material/Carbon en tamaños chicos).

### Gaps
- No pude verificar el texto de Dyson & Haselgrove (2001, *International Journal of Human-Computer Studies* 54) por bloqueo anti-bot; solo se cita Dyson & Kipping (1998), del mismo programa de investigación.
- Butterick (interlineado 120–145 %, tamaño 15–25 px en web) y su página de mayúsculas no se pudieron extraer (solo la de longitud de línea); no se incluyen sus cifras.
- No encontré un valor empírico de tracking para mayúsculas/versalitas; las recomendaciones (5–12 %) que suelen citarse no se verificaron en esta sesión.
- No se verificó una investigación específica de interlineado óptimo (p. ej. 1.4–1.6) más allá de los valores normativos de WCAG y de los sistemas.

---

## 3. Numerales en interfaces de datos: tabulares vs proporcionales, lining, alineación en tablas, moneda S/, separadores es-PE, fechas en español

### Takeaway
**Hallazgo crítico: DM Sans (versión 4.004 servida por Google Fonts) no tiene cifras tabulares (`tnum`) — sus dígitos son proporcionales y `font-variant-numeric: tabular-nums` no tendrá ningún efecto.** EB Garamond, en cambio, trae por defecto cifras lining tabulares. Para columnas de montos alineadas hace falta otra estrategia (familia numérica separada, como hace Fluent con Bahnschrift). El locale es-PE en ICU/CLDR actual formatea `S/ 1,234,567.89` (coma de miles, punto decimal, espacio duro).

### Cited Findings
**DM Sans** — [Verificación propia] con fontTools sobre el archivo de Google Fonts — [DMSans[opsz,wght].ttf](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf)
- Versión 4.004. Funciones GSUB presentes: aalt, calt, case, ccmp, dnom, frac, liga, locl, numr, ordn, ss01–ss08, sups. **Ausentes: tnum, pnum, lnum, onum, smcp, c2sc.**
- Avances de los dígitos por defecto (unidades/1000): 0=656, 1=342, 2=589, 3=598, 4=614, 5=606, 6=624, 7=538, 8=604, 9=624 → **proporcionales** (el "1" mide casi la mitad que el "0").
- ss07 "Alternative Numbers" cambia formas de 1, 3, 4, 6, 9 pero sigue siendo proporcional (avances 353–620). Las cifras por defecto son lining (alto del "0" = 712, mayúscula = 700).
- Sí incluye ¿ ¡ ñ Ñ á é í ó ú – — € $ (cobertura latin + latin-ext).

**EB Garamond** — [Verificación propia] — [EBGaramond[wght].ttf](https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf)
- Versión 1.003. Funciones: c2pc, c2sc, case, dlig, dnom, frac, hist, hlig, liga, **lnum, onum, pnum, tnum**, numr, ordn, pcap, **smcp**, sinf, ss01–ss07, subs, sups, swsh.
- Dígitos por defecto: todos 480 de avance → **tabulares lining por defecto** (alto "0" = 630 ≈ mayúscula 650). `onum` → elzevirianas tabulares (`.tosf`); `pnum` → lining proporcionales (`.lf`, 382–506). Versalitas reales (`smcp`, `c2sc`) incluidas.

**Precedente en sistemas de diseño**
- [Práctica] Fluent 2 define `fontFamilyNumeric: Bahnschrift, 'Segoe UI', …`, una familia aparte para números — [fonts.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/fonts.ts)
- [Práctica] Atlassian tiene tokens `font.metric.*` (28/32, 24/28, 16/20, peso 653) dedicados a cifras grandes de tableros — [@atlaskit/tokens](https://registry.npmjs.org/@atlaskit/tokens/-/tokens-20.11.0.tgz)

**Formato es-PE (Intl)** — [Verificación propia] en Node 22.23.4, ICU 78.3, CLDR 48.0 (mismo motor de datos que Chrome/V8; los resultados pueden variar levemente según la versión de CLDR del navegador)
- `new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(1234567.891)` → **`S/ 1,234,567.89`**; el espacio entre `S/` y el número es **U+00A0 (espacio duro)**; partes: currency "S/", literal, integer, group ",", decimal ".", fraction.
- Miles en números de 4 cifras: es-PE `1,234` (agrupa), mientras es-ES da `1234` (CLDR no agrupa 4 cifras en es-ES).
- Negativos: `-S/ 50.50` (y `currencySign:'accounting'` produce lo mismo, sin paréntesis, en es-PE).
- Porcentaje: `12.5%` (sin espacio). Compacto: `1.2 M`.
- Fechas (zona America/Lima): short `12/11/26`; medium `12 nov. 2026`; long `12 de noviembre de 2026`; full `jueves, 12 de noviembre de 2026`; hora corta `10:30 a. m.` (minúsculas, con puntos y espacio duro).

### Inferences
- Opciones para cifras alineadas con DM Sans (inferencia, por orden de fidelidad a la marca):
  1. **Familia numérica separada solo para dígitos** vía `@font-face` con `unicode-range: U+0030-0039, U+002C, U+002E` apuntando a una sans con `tnum` de proporciones parecidas (p. ej. una Grotesk geométrica con tnum; habría que verificar cuál calza mejor visualmente), al estilo de `fontFamilyNumeric` de Fluent. Se usa solo en celdas numéricas, montos, cantidades, stock y KPIs.
  2. Usar EB Garamond (tabular lining por defecto) para cifras de KPI/destacadas — coherente con la marca, pero mezcla serif en tablas; mejor solo en "metric" grandes.
  3. Aceptar cifras proporcionales y alinear a la derecha: el total se alinea por el final pero los dígitos intermedios no forman columnas; es lo menos recomendable para comparar montos.
- Aplicar `font-variant-numeric: tabular-nums lining-nums` igualmente en el CSS (es inocuo y funciona si la familia de cifras lo soporta; en EB Garamond `lining-nums` es el defecto).
- Alineación: números a la derecha, mismo número de decimales por columna (2 para soles) para lograr alineación decimal sin `text-align: '.'` (no soportado ampliamente — no verificado). Encabezado de columna numérica también a la derecha.
- Moneda: usar `Intl.NumberFormat('es-PE', {style:'currency', currency:'PEN'})` y no concatenar a mano; el espacio duro evita que `S/` quede separado del número en un salto de línea. En celdas densas, considerar mostrar "S/" en el encabezado de columna y solo el número en las celdas.
- Fechas en tablas: preferir formato numérico de ancho fijo (`12/11/26` o `12/11/2026`) solo si la fuente es tabular; con DM Sans proporcional, el formato `12 nov. 2026` es más legible y no depende de alineación. Las abreviaturas de mes en es-PE llevan punto ("nov.") y van en minúscula.
- La versión de CLDR cambia con los navegadores (p. ej. separadores en es-PE han variado históricamente entre versiones); conviene fijar el formato en pruebas automatizadas.

### Gaps
- No pude consultar el repositorio upstream googlefonts/dm-fonts ni sus issues (API de GitHub sin acceso en esta sesión) para saber si existe o está planificada una versión de DM Sans con `tnum`. Lo verificado es la versión 4.004 que distribuye hoy Google Fonts (y que descargará `next/font/google`).
- No se verificó qué otra fuente sans con `tnum` empareja mejor visualmente con DM Sans.
- No se verificó la norma peruana/SUNAT sobre formato de montos en comprobantes ni si el uso local prefiere `S/ ` con o sin espacio; solo el comportamiento de CLDR.
- `text-align: <string>` para alineación decimal: no verificado su soporte en navegadores en 2026.

---

## 4. Emparejamiento serif + sans en UI de producto; especificaciones de DM Sans y EB Garamond; fuentes variables, font-display y next/font

### Takeaway
DM Sans es una variable de dos ejes (opsz 9–40, wght 100–1000) con altura x alta (0.526), ideal como fuente de UI; EB Garamond es variable solo en peso (400–800, sin pesos finos), con altura x baja (0.400), versalitas y cifras completas — apta para títulos de página, encabezados de marca y KPIs, no para texto pequeño de interfaz. `next/font/google` las autoaloja en build, usa `display: 'swap'` por defecto y solo incluye el eje de peso salvo que se pida `axes: ['opsz']`.

### Cited Findings
- [Verificación propia] DM Sans en Google Fonts: diseñador "Colophon Foundry", OFL, añadida 2019-06-12; ejes **opsz 9–40** y **wght 100–1000**; estilos normal e itálica; subsets latin, latin-ext; repo upstream github.com/googlefonts/dm-fonts — [METADATA.pb DM Sans](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/METADATA.pb). En el archivo: valor por defecto de opsz = **9** (nombre "DM Sans 9pt"), wght por defecto 400; instancias Thin…Black — [TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf)
- [Verificación propia] DM Sans métricas verticales: typo asc/desc 992/−310, lineGap 0, USE_TYPO_METRICS activado (contenido total 1.302 em) — mismo TTF.
- [Verificación propia] EB Garamond: diseñadores Georg Duffner y Octavio Pardo, OFL; eje **wght 400–800** (instancias Regular, Medium, SemiBold, Bold, ExtraBold — no hay Light ni Thin); itálica; subsets incluyen cyrillic, greek, latin-ext, vietnamese; minisitio de muestra googlefonts.github.io/ebgaramond-specimen — [METADATA.pb EB Garamond](https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/METADATA.pb). Métricas typo 1007/−298, lineGap 0 — [TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf)
- [Evidencia] EB Garamond fue la fuente con mayor velocidad media de lectura (312 ppm) entre 16 en Wallace et al. 2022 — [PDF TOCHI](https://jeffhuang.com/papers/Readability_TOCHI22.pdf)
- [Práctica] Apple: "Minimize the number of typefaces you use, even in a highly customized interface" — [HIG .md](https://developer.apple.com/design/human-interface-guidelines/typography.md)
- [Práctica] Material 3 separa familias "Brand" (Display, Headline) y "Plain" (Title, Body, Label): la familia de marca solo en los tamaños grandes — [TypeScaleTokens.kt](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/TypeScaleTokens.kt). Atlassian también distingue `font-family-brand-heading` ("Charlie Display") de `font-family-heading` de UI — [@atlaskit/tokens](https://registry.npmjs.org/@atlaskit/tokens/-/tokens-20.11.0.tgz)
- [Práctica] Radix usa una serif ('Times New Roman') solo para `em` y `quote`, con `font-size-adjust: 1.18` y tracking −0.025em — [typography.css](https://raw.githubusercontent.com/radix-ui/themes/main/packages/radix-ui-themes/src/styles/tokens/typography.css)
- [Práctica] next/font (doc. actualizada 2026-09-24): autoalojamiento — "CSS and font files are downloaded at build time… No requests are sent to Google by the browser"; `display` por defecto **'swap'**; `axes`: "By default, only the font weight is included to keep the file size down"; `weight` opcional en fuentes variables (requerido si no lo son); `variable: '--font-x'` para integrar con Tailwind v4 vía `@theme inline { --font-sans: var(--font-x) }`; `adjustFontFallback` por defecto `true` en Google Fonts (fallback ajustado para reducir CLS); `preload` por defecto true y requiere `subsets`; "Use multiple fonts conservatively since each new font is an additional resource" — [Next.js Font API](https://nextjs.org/docs/app/api-reference/components/font)

### Inferences
- Patrón recomendado coherente con Material/Atlassian: **EB Garamond = familia "brand" solo para display/títulos de página (≥24 px) y cifras KPI grandes; DM Sans = toda la UI** (títulos de sección, tablas, formularios, botones, etiquetas). No usar EB Garamond por debajo de ~20 px en UI: su altura x de 0.400 la hace equivaler a DM Sans 2–4 px más pequeña.
- EB Garamond no tiene pesos ligeros: el piso es 400. Para títulos grandes en serif el Regular/Medium suele bastar; no hay opción "300" como en el expresivo de Carbon.
- **opsz de DM Sans**: como el valor por defecto del eje es 9 (diseño para tamaño chico: más abierto y robusto), si no se pide `axes: ['opsz']` en next/font los títulos grandes en DM Sans usarán el diseño de 9 pt. Pidiendo el eje, el navegador ajusta opsz automáticamente al tamaño (`font-optical-sizing: auto`, comportamiento CSS por defecto — no verificado en esta sesión). Coste: archivo algo mayor. Para un ERP, incluir opsz es razonable si DM Sans se usa en títulos; si los títulos van en EB Garamond, el beneficio es menor.
- Cargar ambas con `variable` (`--font-dm-sans`, `--font-eb-garamond`), `subsets: ['latin','latin-ext']` (latin basta para español; latin-ext es opcional), y mapear `--font-sans` y `--font-serif` en `@theme inline`. Solo dos familias (más, eventualmente, una familia de dígitos tabulares de la sección 3).
- Los pesos de DM Sans hasta 1000 permiten replicar el truco de Polaris (450/550/650) para ajustar contraste de peso en pantallas de baja densidad.

### Gaps
- No verifiqué el comportamiento exacto del API de Google Fonts al no solicitar opsz (si sirve la instancia opsz=9 o un rango); la inferencia se basa en el valor por defecto del eje en el archivo.
- No encontré evidencia empírica sobre mezclar serif y sans en UI de producto (solo práctica de sistemas).
- Tamaño de archivo woff2 de cada variante no medido.

---

## 5. Tipografía fluida (clamp), rem vs px, zoom/accesibilidad (WCAG 1.4.4, 1.4.12), jerarquía con peso/tamaño/color

### Takeaway
WCAG 1.4.12 (AA) obliga a que la UI no se rompa si el usuario fuerza interlineado 1.5, espaciado de párrafo 2×, tracking 0.12 em y espaciado de palabras 0.16 em — en tablas densas con alturas fijas esto es el riesgo principal. Los sistemas productivos (Carbon productive, Atlassian, Primer, Fluent) usan **tamaños fijos en rem** para la UI y reservan la tipografía fluida para estilos "expresivos"/editoriales.

### Cited Findings
- [Estándar] WCAG 2.2 SC 1.4.12 Text Spacing (nivel **AA**): sin pérdida de contenido ni funcionalidad al fijar "Line height (line spacing) to at least 1.5 times the font size", "Spacing following paragraphs to at least 2 times the font size", "Letter spacing (tracking) to at least 0.12 times the font size", "Word spacing to at least 0.16 times the font size"; el texto debe caber "within the bounds of its containing box without being cut off"; truncar con elipsis solo es aceptable si existe un mecanismo para ver el texto completo ("if there is no mechanism to show the truncated text, it fails"); fallo F104 (contenido recortado/solapado); técnica orientativa C28: tamaño de contenedores en `em` — [Understanding SC 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [Práctica] Tokens en rem: Primer (0.75/0.875/1/1.25/2/2.5 rem) — [Primer](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/typography/typography.json5); Carbon (0.75/0.875/1 rem…) — [@carbon/type](https://registry.npmjs.org/@carbon/type/-/type-11.71.0.tgz); Atlassian (0.75–2 rem, interlineados en rem) — [@atlaskit/tokens](https://registry.npmjs.org/@atlaskit/tokens/-/tokens-20.11.0.tgz); Tailwind v4 (rem) — [theme.css](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/tailwindcss/theme.css). Fluent publica px — [fonts.ts](https://raw.githubusercontent.com/microsoft/fluentui/master/packages/tokens/src/global/fonts.ts).
- [Práctica] Carbon: estilos productivos de tamaño fijo; estilos expresivos/fluidos con breakpoints (expressive-heading-05: 32 → 36 → 42 → 48 → 60 px; fluid-heading-03: 20 → 24 px en max) — [@carbon/type](https://registry.npmjs.org/@carbon/type/-/type-11.71.0.tgz)
- [Práctica] Apple: la jerarquía se logra con peso y tamaño; cada estilo de macOS define un peso de énfasis (p. ej. Body 13 Regular → énfasis Semibold; Headline 13 Bold, mismo tamaño que Body) — [HIG .md](https://developer.apple.com/design/human-interface-guidelines/typography.md)

### Inferences
- Para el ERP: tamaños en **rem** (Tailwind ya lo hace) para respetar el tamaño de fuente del navegador y el zoom; interlineados como valores de Tailwind (rem) o sin unidad, nunca alturas fijas en px en filas de tabla, chips o botones con texto — usar `min-height` + padding para que 1.4.12 no recorte.
- Tipografía fluida con `clamp()` solo para títulos de página/marca en EB Garamond (estilo "expresivo"); el cuerpo y las tablas, fijos (estilo "productivo" de Carbon). Un ERP de escritorio con breakpoints 1024–1920 no necesita cuerpo fluido.
- Jerarquía en UI densa: el macOS Headline (13 Bold) = mismo tamaño que Body muestra que se puede jerarquizar con **peso y color** sin añadir tamaños; ideal para encabezados de tabla (14 px 600 o 12 px 500 en gris) y títulos de tarjeta.
- Truncado con elipsis en celdas: requiere `title`/tooltip o expansión para cumplir 1.4.12.

### Gaps
- No se extrajo la página de WCAG 1.4.4 Resize Text (200 %) en esta sesión; su contenido (texto redimensionable hasta 200 % sin pérdida, nivel AA) es conocimiento general no verificado aquí.
- No se verificaron artículos de Smashing/MDN sobre `clamp()` y accesibilidad del zoom (riesgo conocido de que unidades vw impidan escalar con zoom) — queda sin cita.

---

## 6. Específico del español: expansión de texto, guionado, mayúscula inicial (sentence case), ¿ ¡

### Takeaway
Las cadenas cortas de UI son las que más se expanden al traducir/redactar desde el inglés (200–300 % para ≤10 caracteres, ~130 % para >70), lo que en un ERP en español afecta botones, encabezados de columna y chips; DM Sans y EB Garamond cubren todos los caracteres del español (¿ ¡ ñ tildes, rayas).

### Cited Findings
- [Práctica/Estándar W3C i18n] Expansión media del inglés a idiomas europeos según longitud (guía de IBM citada por W3C): ≤10 caracteres 200–300 %; 11–20: 180–200 %; 21–30: 160–180 %; 31–50: 140–160 %; 51–70: 151–170 % (sic en la fuente); >70: 130 %. Ejemplo: "FAQ" → "Preguntas frecuentes" en español — [W3C Internationalization, Text size in translation](https://www.w3.org/International/articles/article-text-size)
- [Verificación propia] Cobertura: DM Sans y EB Garamond incluyen ¿ ¡ ñ Ñ á é í ó ú – — (y €, $) — [DM Sans TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/DMSans%5Bopsz,wght%5D.ttf), [EB Garamond TTF](https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf). Ambas tienen `locl` y `case` (formas de puntuación para mayúsculas).
- [Verificación propia] Las abreviaturas de mes de es-PE en CLDR van en minúscula con punto ("nov.") y los días en minúscula ("jueves, 12 de noviembre de 2026"); "a. m." con espacio — Node 22 / ICU 78.3 / CLDR 48 (ver sección 3).

### Inferences
- Aunque el ERP se escribe directamente en español (no se traduce), la cifra de expansión sirve como margen de diseño: los componentes copiados de ejemplos en inglés (shadcn) quedarán cortos — "Save" → "Guardar", "Qty" → "Cantidad", "SKU" → "Código". Diseñar botones y encabezados con ancho flexible y probar con la cadena más larga real.
- Encabezados de columna en tablas: con 12–14 px y textos españoles largos, preferir abreviaturas estandarizadas con tooltip ("Cant.", "P. unit.", "Dscto.") antes que reducir tamaño o usar mayúsculas sostenidas (que además cuestan ~5 % de lectura, Perea et al. 2017, estudio hecho con hablantes de español).
- La feature `case` de DM Sans/EB Garamond ajusta la altura de ¿ ¡ ( ) – en texto en mayúsculas; si se usan micro-etiquetas en mayúsculas, activar `font-feature-settings: "case"` (inferencia a partir de las features presentes; no probado visualmente).
- Guionado: en un ERP casi todo el texto es corto y sin justificar; `hyphens: auto` solo tendría sentido en bloques de ayuda estrechos y exige `lang="es"` en `<html>` (Next.js suele generar `lang="en"` en los ejemplos — ver doc. next/font: `<html lang="en">`) — [Next.js Font API](https://nextjs.org/docs/app/api-reference/components/font). Fijar `lang="es-PE"` también mejora lectores de pantalla.

### Gaps
- No se verificó una fuente de la RAE/Fundéu sobre el uso de mayúscula solo inicial en títulos y etiquetas (sentence case es la norma ortográfica española frente al Title Case inglés) — conocimiento general, sin cita en esta sesión.
- No se verificó el soporte de diccionarios de guionado en español de `hyphens: auto` por navegador (MDN/caniuse) en 2026.
- No se encontró una cifra de expansión específica inglés→español (la del W3C es para "idiomas europeos" en general; el 20–30 % que suele citarse para español no se verificó).
