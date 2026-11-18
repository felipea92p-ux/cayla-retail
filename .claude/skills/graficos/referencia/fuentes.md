# Fuentes de /graficos — comentadas

Niveles: **[Evidencia]** estudio con personas, revisado por pares o experimento controlado · **[Norma]** WCAG, especificación, guía oficial
de plataforma · **[Práctica]** sistemas de diseño, consultoras, profesionales reconocidos. Un número de práctica no es un hallazgo.

## Percepción y elección

- **Cleveland & McGill (1984).** «Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods»,
  *JASA* 79(387). **[Evidencia]** El orden de las codificaciones, de más a menos precisa: posición en escala común › posición en escalas no
  alineadas › largo, dirección, ángulo › área › volumen y curvatura › sombreado y saturación. Aporta la regla 5. Leído vía las láminas de
  Cornell INFO 3312: https://info3312.infosci.cornell.edu/slides/04-graphical-perception.html
- **Heer & Bostock (2010).** «Crowdsourcing Graphical Perception: Using Mechanical Turk to Assess Visualization Design», CHI 2010.
  https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf **[Evidencia]** Replica a C&M: la posición sigue ganándole al largo; el
  área sale peor que el ángulo, y **el ángulo no salió peor que el largo** (contra la teoría). Rejilla: **alfa 0,2** es un valor seguro y
  agregar rejilla mejoró la precisión; **≥ 8 px** entre rayas. Alto: con **40 px** el error sube de forma significativa; entre 80, 160 y 320 px
  no hay diferencia. Rectángulos 1:1 dan el peor error de área. Aporta las reglas 5, 9 y 10.
- **Reda, Sharma, Renambot, Miranda & Boorboor (EVL, UIC).** «Marks, Channels, and Dead Ends: Stop Running Graphical Perception Studies and
  Start Modeling Visualizations as Images», arXiv 2608.07834. https://arxiv.org/abs/2608.07834 **[Evidencia / posición]** Los rankings de
  canales predicen mal casos nuevos: el resultado se invierte con la distribución de los datos o el grosor del trazo. Por eso aquí el ranking es
  el punto de partida y el diseño final se prueba con datos reales (picos, ceros, muchas tiendas). Fecha no confirmada en el texto leído.
- **Financial Times, Visual Vocabulary.** README de `Financial-Times/chart-doctor`:
  https://raw.githubusercontent.com/Financial-Times/chart-doctor/main/visual-vocabulary/README.md **[Práctica]** Las nueve relaciones
  (desviación, correlación, ranking, distribución, cambio en el tiempo, parte del todo, magnitud, espacial, flujo); «Columns must start at
  zero»; el doble eje «can mislead»; los apilados se vuelven ilegibles con muchas partes. Aporta `elegir.md`.
- **NN/g, Laubheimer (2017).** «Preattentive Visual Properties and How to Use Them in Information Visualization».
  https://www.nngroup.com/articles/dashboards-preattentive/ **[Práctica]** Largo y posición para cantidades; ordenar barras; evitar tortas,
  donas, gauges radiales (cambiarlos por bullet charts), 3D y radar; no usar color para cantidades; ~4,5 % de la población con daltonismo.
- **Datawrapper, Lisa Charlotte Muth (2018, nota editorial jul. 2026).** «Why not to use two axes, and what to use instead».
  https://www.datawrapper.de/blog/dualaxis **[Práctica, cita Evidencia]** Problemas del doble eje y sus alternativas; cita a Isenberg et al.
  (2011): los superpuestos de doble escala rinden mal. Cambio de 2026: lo acepta para lectores entrenados. Aporta la regla 3.

## Tortas, donas, meta

- **Skau & Kosara (2016).** «Arcs, Angles, or Areas: Individual Data Encodings in Pie and Donut Charts», *Computer Graphics Forum*
  (EuroVis) 35(3):121–130. https://www.tableau.com/research/publications/arcs-angles-or-areas-individual-data-encodings-pie-and-donut-charts
  **[Evidencia]** El ángulo central es la señal más débil al leer tortas y donas; las donas son tan precisas como las tortas. Aporta la regla 7.
- **Stephen Few, «Bullet Graph Design Specification»**, Perceptual Edge, rev. 10 oct. 2013.
  https://www.telerik.com/docs/default-source/blogs-docs/bullet_graph_design_spec-pdf **[Práctica — especificación de autor]** Medida
  principal (barra de un tercio del grosor), una o dos comparativas (rayas perpendiculares, 100 % y 75 % negro), **rangos cualitativos: 3 ideal,
  5 máximo**, en grises (3 rangos: 40 / 25 / 10 %); más oscuro = peor; invertir cuando «menos es mejor»; una barra implica base cero, con escala
  truncada va un punto. Aporta la regla 18 y la propuesta 4.

## Color

- **WCAG 2.2, SC 1.4.11 Non-text Contrast** (y su *Understanding*). https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
  **[Norma]** 3:1 contra los colores adyacentes para las partes del gráfico necesarias para entenderlo; «2.999:1 would not meet the 3:1
  threshold»; las líneas contra el fondo, no entre ellas; excepciones: etiquetas y valores visibles equivalentes, la información en otra
  forma («a table that follows the graph»), lo decorativo y lo esencial. Lo estético no exime. Aporta la regla 17.
- **WCAG 2.2, SC 1.4.1 Use of Color.** **[Norma]** El color no puede ser el único medio de transmitir información. Aporta la regla 16.
- **Datawrapper, Muth (30 mar. 2022).** «A detailed guide to colors in data vis style guides».
  https://www.datawrapper.de/blog/colors-for-data-vis-style-guides **[Práctica]** Grises para el contexto («a large amount of gray is
  acceptable»), un acento en gráficos de una serie, 3 a 10 colores categóricos con luminosidad variada, más saturado en marcas chicas y menos en
  áreas grandes, secuenciales con rango amplio de luminosidad, divergentes como dos secuenciales unidas en el claro; reconoce que la mayoría de
  las paletas no llega a 3:1. Aporta las reglas 13 y 15.
- **IBM Carbon, Data visualization color palettes.** https://carbondesignsystem.com/data-visualization/color-palettes/ **[Práctica]** Orden
  categórico fijo «in sequence strictly»; secuenciales que se invierten en oscuro (lo más oscuro = mayor en claro; lo más claro = mayor en
  oscuro); divergentes que no cambian de tema; nunca un degradado en lugar de una secuencial. Solo se toma el método: **ningún hex de Carbon
  entra al repo**.
- **Okabe & Ito, «Color Universal Design».** Referencia vía la documentación de Rbearcat:
  https://rdrr.io/cran/Rbearcat/man/palette_OkabeIto.html **[Práctica, origen académico]** Paleta segura para daltonismo de 8 colores. Se
  nombra como método de validación, no como paleta: el repo valida con ΔE2000 (`lib/color-parecido.ts`).

## Movimiento de datos

- **Heer & Robertson (2007).** «Animated Transitions in Statistical Data Graphics», IEEE InfoVis 2007.
  https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf ; resumen https://idl.uw.edu/papers/animated-transitions
  **[Evidencia]** La transición animada bajó el error de seguimiento en todos los tipos y mejoró las estimaciones en dispersión, barras agrupadas
  y donas (no en barras apiladas); la gente la prefirió siempre. Duraciones probadas: **1,25 s** (seguimiento) y **2 s** (estimar valores); objetivo
  **~1 s por etapa**. Principios: cuadros intermedios válidos, una marca nunca pasa a representar otro dato, destino común, slow-in/slow-out,
  traslación y expansión antes que rotación, **etapas simples (eje, luego valores)**, muchas etapas empeoran, **escalonado leve** con 3 o más
  marcas que se tapan, **escala común** (reescalar en etapa aparte), y **no animar cuando el inicio y el final no comparten ninguna dimensión**
  (ahí, corte o fundido). Aporta las reglas 20 a 22.
- **Tversky, Morrison & Bétrancourt (2002).** «Animation: can it facilitate?», *IJHCS*.
  https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf **[Evidencia, revisión]** Muchos beneficios
  atribuidos a la animación salen de comparar contra estáticos con menos información; ayuda si calza con el contenido (congruencia) y se
  percibe bien (aprehensión). Es el freno a «animar todo».
- **Abrams & Christ (2003).** «Motion onset captures attention», *Psychological Science*. https://pubmed.ncbi.nlm.nih.gov/12930472/
  **[Evidencia]** Lo que *empieza* a moverse captura la atención; el movimiento continuo no. Respalda «una vez y sin bucle».

## Accesibilidad

- **Chartability**, Frank Elavsky (Fizz Studio), EuroVis 2022, CC-BY-SA 3.0. https://chartability.fizz.studio/ **[Práctica — estándar de
  facto]** Principios POUR + CAF (Compromising, Assistive, Flexible), 50 heurísticas y una lista corta de 14 pruebas (20–40 min). Aporta el
  marco de la auditoría de accesibilidad.
- **WCAG 2.2, SC 1.1.1 Non-text Content** y **SC 2.1.1 Keyboard.** **[Norma]** Todo gráfico que informa tiene su alternativa en texto; lo
  que se toca con el mouse se hace también con el teclado. Aporta las reglas 24 y 27.

## Del repo (lo que ya se decidió y se respeta)

- `CLAUDE.md`, «Una función, una pieza» (ADR-0358): las filas `grafico.barra`, `grafico.avance`, `grafico.anillo`, `grafico.linea`,
  `grafico.barras`, `grafico.escala` y `cifra`; registros en `docs/unificar/grafico.*.md` y `docs/unificar/cifra.md`.
- `CLAUDE.md`, «Movimiento y modales» (ADR-0136) y ADR-0357 («los gráficos se arman una vez al entrar a la pestaña, sin rebote ni bucle»,
  vigilado por `lib/analisis-movimiento.test.ts`); ADR-0625 (las animaciones arrancan apagadas; `prefiereQuieto()` en `lib/movimiento-cliente.ts`).
- `apps/web/app/globals.css`: el comentario de `--color-grafico-alza/neutro/baja` («ΔE ≥ 17 normal, ≥ 11 con daltonismo», 2026-09-22) y el de
  cada familia de color de DATO (`--color-metodo-*`, `--color-camino-*`, `--color-sede-*`, `--color-persona-*`, `--color-reparto-*`).
- `apps/web/lib/color-parecido.ts`: ΔE2000, umbral 8.
- ADR-0357, la prueba ciega de Análisis (lectoras simuladas por IA, **[Práctica]**: no son personas).

## No verificado (honesto)

- **Las 14 pruebas de la lista corta de Chartability:** la página principal no las enumera y el *workbook*
  (https://chartability.github.io/POUR-CAF/) no se pudo abrir en esta sesión. La lista de 12 puntos de `SKILL.md` no es la de Chartability:
  es propia, con su marco POUR + CAF.
- **Etiquetado directo antes que leyenda:** lo recomiendan Datawrapper y Knaflic según la literatura conocida, pero no se leyó la fuente
  primaria. La regla 12 va como `[Práctica]` sin cita verificada.
- **Anatomía de la tarjeta KPI** (etiqueta, valor, comparación, tendencia) y **formato de cifras** (abreviaturas, cifras significativas,
  `tabular-nums`): sin fuente primaria verificada; lo que manda es lo que `TarjetaCifra` ya decidió. El formato de los números es de `/textos`.
- **Animación de entrada** (el gráfico que «crece» al cargar): no se encontró estudio. Llamarla decorativa es práctica, no hallazgo.
- **Tufte** (data-ink, chartjunk, sparklines «word-sized», múltiplos pequeños), **Knaflic**, **Cairo** y **Few, *Information Dashboard
  Design***: no se leyeron. Se citan como libros, sin URL verificada, y ninguna regla depende solo de ellos.
- **Mackinlay (1986)** y **Munzner (2014)**: no verificados.
- **Los hex de Okabe-Ito:** no se tomaron de una fuente leída; no se usan.
- Si Skau & Kosara encontraron que domina el área o el largo de arco: el resumen no lo dice.
- **Recharts / shadcn charts** (`isAnimationActive="auto"`, `accessibilityLayer`): están en las notas, pero el repo **no usa ninguna
  librería de gráficos** (ni recharts, ni visx, ni d3 en `apps/web/package.json`): las seis piezas son SVG y CSS propios. No aplican.
