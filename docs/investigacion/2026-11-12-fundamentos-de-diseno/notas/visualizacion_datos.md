# Visualización de datos para dashboards de negocio y reportes ERP (estado a nov 2026)

Leyenda de tipo de respaldo usada en todo el documento:
- **[EVIDENCIA]** = resultado experimental publicado (paper con estudio de usuarios).
- **[ESTÁNDAR]** = norma o especificación formal (WCAG, especificación publicada de un autor/sistema).
- **[PRÁCTICA]** = guía de un sistema de diseño, consultora o profesional reconocido (opinión experta, no experimento).

Fuentes que no se pudieron leer en esta sesión (bloqueadas por robots o por permiso): el PDF de Heer & Robertson en vis.berkeley.edu (sí se leyó la copia en homes.cs.washington.edu), el árbol de GitHub de la FT Visual Vocabulary (sí se leyó el README en raw.githubusercontent.com), https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ y https://echarts.apache.org/handbook/en/best-practices/aria/ (no se leyeron).

---

## 1. Percepción de codificaciones (encodings): ranking, elección de gráfico, ejes

### Takeaway
La posición sobre una escala común es la codificación más precisa; el largo le sigue; ángulo, área y color/saturación son mucho peores para leer magnitudes. Esto está replicado (Cleveland & McGill 1984; Heer & Bostock 2010). En la práctica: barras y líneas para comparar tiendas, períodos y montos; columnas desde cero; evitar doble eje para público general. Ojo: una crítica de 2026 dice que estos rankings predicen mal el rendimiento en casos nuevos, así que sirven como guía por defecto y no como ley.

### Cited Findings
**Ranking de Cleveland & McGill [EVIDENCIA]**
- Orden de Cleveland & McGill (1984), del más preciso al menos preciso: (1) posición sobre una escala común, (2) posición sobre escalas no alineadas, (3) largo, dirección y ángulo, (4) área, (5) volumen y curvatura, (6) sombreado y saturación de color. Cita: W. S. Cleveland & R. McGill, "Graphical Perception: Theory, Experimentation, and Application to the Development of Graphical Methods," *JASA* (1984). — [Cornell INFO 3312 slides](https://info3312.infosci.cornell.edu/slides/04-graphical-perception.html)
- El principio de diseño que sale de esto es usar las tareas perceptivas elementales más altas posibles en la jerarquía. — [Cornell INFO 3312](https://info3312.infosci.cornell.edu/slides/04-graphical-perception.html)
- Una jerarquía extendida que combina C&M con Heer & Bostock 2010 pone el ángulo por debajo del largo y divide el área en circular y rectangular. — [Cornell INFO 3312](https://info3312.infosci.cornell.edu/slides/04-graphical-perception.html)

**Replicación de Heer & Bostock 2010 (CHI, Mechanical Turk) [EVIDENCIA]**
- Replicaron la tarea de juicio proporcional para posición (tipos 1-3), largo (4-5), ángulo (6, torta) y área circular (7, burbuja). La precisión se midió con el error absoluto logarítmico log2(|juzgado − real| + 1/8), con midmeans e intervalos de confianza bootstrap al 95%. — [Heer & Bostock 2010 PDF](https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf)
- La forma general y el orden de posición y largo coincidieron con el estudio de laboratorio original. La posición siguió siendo significativamente mejor que el largo. El área fue peor que el ángulo, y ambos peores que la posición. A diferencia de la teoría, el ángulo **no** salió peor que el largo. — [Heer & Bostock 2010](https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf)
- Rectángulos: su precisión fue igual a la del área circular. La relación de aspecto importó: los rectángulos 1:1 dieron el peor error, porque la gente usa los lados como sustituto del área. No hubo diferencia entre rectángulos sueltos y treemaps. Por eso los autores dicen que la meta "squarified" (1:1) tiene un respaldo perceptivo débil. — [Heer & Bostock 2010](https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf)
- Líneas de cuadrícula: un alpha de 0.2 es un valor por defecto "seguro" para gridlines. Agregar gridlines mejoró la precisión. Recomiendan separarlas al menos 8 px. — [Heer & Bostock 2010](https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf)
- Altura del gráfico: con 40 px de alto el error fue significativamente mayor. Entre 80, 160 y 320 px no hubo diferencia significativa, así que pasar de unos 80 px (en una escala de 0-100) aporta poco. — [Heer & Bostock 2010](https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf)

**Tortas y donas: Skau & Kosara 2016 [EVIDENCIA]**
- D. Skau & R. Kosara (Tableau Research), "Arcs, Angles, or Areas: Individual Data Encodings in Pie and Donut Charts," *Computer Graphics Forum* (EuroVis) 35(3):121–130, 2016. — [Tableau Research](https://www.tableau.com/research/publications/arcs-angles-or-areas-individual-data-encodings-pie-and-donut-charts)
- Hallazgos: el ángulo central es la señal visual más débil para leer tortas y donas, y las donas son tan precisas como las tortas tradicionales. — [Tableau Research](https://www.tableau.com/research/publications/arcs-angles-or-areas-individual-data-encodings-pie-and-donut-charts); [EG Digital Library](https://diglib.eg.org/handle/10.1111/cgf12888)
- NN/g recomienda evitar tortas y donas en dashboards, salvo para mostrar diferencias de participación muy grandes. — [NN/g, Laubheimer 2017](https://www.nngroup.com/articles/dashboards-preattentive/) [PRÁCTICA]
- FT Visual Vocabulary: los segmentos de una torta son difíciles de comparar con precisión, y el centro de una dona puede llevar información extra, como el total. — [FT Visual Vocabulary README](https://raw.githubusercontent.com/Financial-Times/chart-doctor/main/visual-vocabulary/README.md) [PRÁCTICA]

**Dashboards y atributos preatentivos: NN/g [PRÁCTICA]**
- Define el dashboard como "collections of data visualizations, presented in a single-page view that imparts at-a-glance information". Sirve para comunicar información crítica, no para explorar datos libremente. Distingue el dashboard operativo (acción urgente) del analítico (decisiones menos urgentes). — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)
- El largo y la posición 2D son lo mejor para datos cuantitativos. El área y el ángulo dejan notar que hay diferencias, pero no cuánto miden. Recomienda barras, líneas y dispersión, y ordenar las barras de forma ascendente o descendente. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)
- Cambiar los medidores radiales (gauges) por bullet charts lineales, que ocupan menos y se leen mejor. Evitar 3D, treemaps en dashboards simples y accionables, y gráficos radar para comparar cantidades. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)

**Elección de gráfico por relación: FT Visual Vocabulary [PRÁCTICA]**
- Nueve categorías, con sus gráficos típicos — [FT README](https://raw.githubusercontent.com/Financial-Times/chart-doctor/main/visual-vocabulary/README.md):
  - **Desviación** (respecto de cero, una meta o un promedio): barra divergente, barra apilada divergente, spine, línea rellena de superávit/déficit.
  - **Correlación**: dispersión, línea + columna (doble eje, "can mislead"), dispersión conectada, burbuja, heatmap XY.
  - **Ranking**: barra o columna ordenada, dot strip, slope, lollipop.
  - **Distribución**: histograma, boxplot, violín, pirámide, dot plot, barcode, curva acumulada.
  - **Cambio en el tiempo**: línea, columna (mejor con una sola serie), slope, área (muestra bien el total pero hace difícil comparar las partes), fan chart, heatmap de calendario.
  - **Parte del todo**: columna apilada, barra apilada proporcional, torta, dona, treemap, waterfall. Los apilados se vuelven difíciles de leer con muchos componentes.
  - **Magnitud**: columna y barra. "Columns must start at zero." Las barras sirven para datos que no son series de tiempo y con nombres de categoría largos.
  - **Espacial**: los coropletas deben mostrar tasas, no totales.
  - **Flujo**: Sankey, waterfall, chord.

**Doble eje [PRÁCTICA + EVIDENCIA citada]**
- Lisa Charlotte Muth (Datawrapper, 8 mayo 2018, con nota editorial de julio 2026). Problemas: las escalas arbitrarias pueden engañar. Las líneas base a distinta altura hacen que las series parezcan moverse al mismo ritmo (en el ejemplo, el PBI global creció ~80% y el de Alemania ~40%). Los lectores relacionan líneas que quedan cerca. Isenberg et al. (2011) encontraron que los gráficos superpuestos de doble escala rinden mal en precisión y velocidad. — [Datawrapper: dualaxis](https://www.datawrapper.de/blog/dualaxis)
- Alternativas: gráficos lado a lado, gráfico indexado (cambio relativo, con los valores absolutos en etiquetas o tooltip), mostrar solo la serie principal y anotar la otra, o dispersión conectada. — [Datawrapper](https://www.datawrapper.de/blog/dualaxis)
- **Cambio de 2026:** Datawrapper ahora acepta que el doble eje puede ser la mejor opción en algunos casos, sobre todo para lectores entrenados como los de servicios financieros, y lo habilitó en su plan Business. Para público general sigue recomendando probar alternativas primero. — [Datawrapper](https://www.datawrapper.de/blog/dualaxis); guía complementaria: [dual-axis-charts-guide](https://www.datawrapper.de/blog/dual-axis-charts-guide)

**Base cero en barras [PRÁCTICA / ESTÁNDAR de autor]**
- FT: "Columns must start at zero." — [FT README](https://raw.githubusercontent.com/Financial-Times/chart-doctor/main/visual-vocabulary/README.md)
- La especificación del bullet graph de Few usa una barra cuando la escala empieza en cero. Si la escala empieza por encima de cero, cambia la barra por un símbolo (punto o X). Es decir, una barra implica base cero y un eje truncado pide otra marca. — [Few, Bullet Graph Design Spec, rev. 10 oct 2013](https://www.telerik.com/docs/default-source/blogs-docs/bullet_graph_design_spec-pdf)

**Crítica reciente a los rankings de canales [EVIDENCIA/POSICIÓN, 2025-2026]**
- Reda, Sharma, Renambot, Miranda & Boorboor (EVL, UIC), "Marks, Channels, and Dead Ends: Stop Running Graphical Perception Studies and Start Modeling Visualizations as Images" (arXiv 2608.07834). Sostienen que el ranking de C&M predice mal el rendimiento, porque muchas tareas dependen de rasgos que emergen de la imagen completa. Los resultados pueden invertirse según la distribución de los datos y detalles como el grosor del trazo. Como ejemplo, estudios hallaron que colormaps de tono (tipo arcoíris) pueden superar a escalas perceptualmente uniformes en tareas de inferencia. — [arXiv 2608.07834](https://arxiv.org/abs/2608.07834)

### Inferences
- Para un ERP retail (ventas por tienda, inventario, producción): por defecto, barras horizontales ordenadas para comparar tiendas o categorías (ranking y magnitud), líneas para tendencias en el tiempo y bullet graphs para avance contra meta. Tortas o donas solo para 2-3 partes con diferencias muy grandes, y mejor con valores rotulados (eso además cumple WCAG 1.4.11, ver sección 3).
- La regla de barras desde cero es firme para magnitudes. Si el foco es la variación (por ejemplo, un margen entre 38% y 42%), conviene cambiar de marca (línea o punto) y no truncar una barra.
- Para comparar varias tiendas, los múltiplos pequeños con la misma escala evitan el doble eje y el reescalado (ver la sección 4 de animación: Heer & Robertson también recomiendan escalas comunes).
- Una altura mínima de unos 80 px por gráfico y gridlines con alpha cerca de 0.2, separadas ≥8 px, son valores concretos con respaldo experimental para sparklines y mini-gráficos de tarjetas KPI. La regla de 8 px pesa en mini-gráficos de 40 px de alto: en ellos conviene omitir las gridlines.
- La crítica de 2026 no invalida el uso práctico: el ranking sigue siendo el mejor punto de partida, pero el diseño final debe probarse con datos reales (picos, ceros, muchas tiendas).

### Gaps
- **Mackinlay 1986 (APT)**, con sus criterios de expresividad y efectividad y su ranking por tipo de dato (cuantitativo, ordinal, nominal), no se verificó en esta sesión. La fuente consultada solo remite al paper original. Conviene verificarlo en "Automating the design of graphical presentations of relational information," *ACM TOG* 5(2), 1986.
- **Munzner, *Visualization Analysis & Design* (2014)**: no se obtuvo el ranking de canales para magnitud frente a identidad desde una fuente primaria en esta sesión.
- El paper de Skau & Kosara: la página de resumen no dice si el área o el largo de arco es la señal dominante. No se leyó el texto completo.
- El arXiv 2608.07834 no da fecha en el texto leído. Por el número de arXiv sería de agosto de 2026, pero no se confirmó.

---

## 2. Principios clásicos (Tufte, Few, Knaflic, Cairo)

### Takeaway
Este tema quedó con respaldo parcial en esta sesión. La especificación del bullet graph de Stephen Few se verificó con todo detalle (y es directamente aplicable a tarjetas KPI de meta). Las definiciones de Tufte (data-ink, chartjunk, sparklines) y las reglas de Knaflic y Cairo no se pudieron leer de fuente primaria: quedan en Gaps.

### Cited Findings
**Bullet graph: Stephen Few, Perceptual Edge, rev. 10 oct 2013 [ESTÁNDAR de autor]** — [Bullet Graph Design Spec PDF](https://www.telerik.com/docs/default-source/blogs-docs/bullet_graph_design_spec-pdf)
- **Componentes:** etiqueta de texto, escala cuantitativa, medida principal, medida(s) comparativa(s) y rangos cualitativos.
- **Etiqueta:** a la izquierda (horizontal) o arriba (vertical), en 100% negro.
- **Escala:** marcas a intervalos iguales, abajo o a la izquierda, con ticks finos de gris claro hacia afuera.
- **Medida principal:** barra 100% negra, centrada, sin borde, de un **tercio del grosor** de su contenedor.
- **Comparativas:** una o dos líneas cortas perpendiculares, la primera 100% negra y la segunda 75%. Quedan detrás de la barra cuando se cruzan.
- **Rangos cualitativos:** un solo tono en distintas intensidades, sin borde. Más oscuro = peor estado, más claro = mejor. **Máximo 5 rangos, 3 es lo ideal.** Intensidades de gris:
  - 2 rangos: 35% / 10%
  - 3 rangos: 40% / 25% / 10%
  - 4 rangos: 50% / 35% / 20% / 10%
  - 5 rangos: 50% / 35% / 20% / 10% / 3%
- **Variantes:** valores positivos y negativos (utilidad/pérdida); invertir la secuencia de color cuando "menos es mejor" (gastos, defectos); segmento de proyección contra una meta futura.
- **Orientación:** horizontal por defecto. Las series de bullet graphs relacionados se apilan horizontal o verticalmente.

**NN/g sobre gauges y bullet charts [PRÁCTICA]**
- Reemplazar gauges radiales por bullet charts lineales: ocupan menos espacio y son más fáciles de leer. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)

**Datawrapper sobre declutter, grises y énfasis [PRÁCTICA]** (la idea de Knaflic de "un solo color para enfatizar" aparece aquí con fuente verificada)
- Definir al menos un gris para datos menos importantes, faltantes o de contexto. Usar varios grises para elementos que no son datos: gridlines más claras que las etiquetas de eje, títulos lo más oscuro. "A large amount of gray is acceptable." — [Datawrapper, Muth, 30 mar 2022](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides)
- En gráficos de una sola serie, usar un solo color de acento. — [Datawrapper](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides)

### Inferences
- Para KPI contra meta (ventas del mes frente a meta por tienda), el bullet graph de Few con 3 rangos (40/25/10% gris) y la meta como línea negra es el estándar más preciso y compacto. Sustituye a gauges y donas de avance.
- El patrón "gris para el contexto y un color de acento para lo que importa" (Datawrapper) es el mismo que popularizó Knaflic. Se puede aplicar con respaldo Datawrapper aunque no se verificó el libro.

### Gaps
- **Tufte**: no se pudo leer https://www.edwardtufte.com/notebook/sparkline-theory-and-practice-edward-tufte/ (bloqueado). Quedan sin cita primaria esta sesión: la definición de data-ink ratio (*The Visual Display of Quantitative Information*, 1983), chartjunk, múltiplos pequeños, y la definición de sparklines como gráficos "data-intense, design-simple, word-sized" (*Beautiful Evidence*, 2006). El redactor debe citarlas como referencias de libro sin URL verificada, o buscarlas por otra vía.
- **Cole Nussbaumer Knaflic (*Storytelling with Data*, 2015)** y **Alberto Cairo (*The Functional Art*, *The Truthful Art*, *How Charts Lie*)**: no se consultaron fuentes. Sin citas verificadas.
- **Stephen Few, *Information Dashboard Design*** (reglas como "una pantalla", y los errores comunes de dashboards): no verificado esta sesión.

---

## 3. Color en gráficos y accesibilidad de contraste

### Takeaway
Para paletas categóricas, usar pocas tonalidades (Datawrapper: de 3 a 10 en total; en la práctica, pocas por gráfico) con lightness variado. Usar grises para el contexto y un acento para el énfasis. Las secuenciales van de claro a oscuro según el tema, y las divergentes son dos secuenciales unidas por el centro claro. WCAG 1.4.11 pide 3:1 contra los colores adyacentes para las partes del gráfico necesarias para entenderlo, **salvo** que haya etiquetas con los valores o una tabla equivalente. No usar color para codificar magnitud cuantitativa por tono.

### Cited Findings
**WCAG 2.2, SC 1.4.11 Non-text Contrast [ESTÁNDAR]** — [W3C Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- Aplica a "Parts of graphics required to understand the content", con 3:1 contra los colores adyacentes. "2.999:1 would not meet the 3:1 threshold."
- **Líneas:** "The lines should have 3:1 contrast against their background". Pero "they do not need to contrast with each other or the graduated lines" porque se superponen poco.
- **Torta:** falla si para entender las proporciones hay que distinguir los bordes de las porciones y esos bordes tienen menos de 3:1. Pasa si se agrega un borde oscuro a la porción clara. No aplica si hay "visible labels and values that convey equivalent information to the graphical objects".
- **Excepciones:** texto incrustado que da la misma información (ese texto debe cumplir 1.4.3); la información disponible en otra forma, "such as in a table that follows the graph"; gráficos decorativos; y presentación esencial (heatmaps, logos, fotos). Un gráfico con bajo contraste solo por decisión estética del autor no queda exento.
- Datawrapper reconoce que el 3:1 es difícil de cumplir con colores claros, que la mayoría de las paletas no lo cumple, y que cada organización debe decidir qué tan estricta será. — [Datawrapper](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides) [PRÁCTICA]

**IBM Carbon, paletas de data viz [PRÁCTICA de sistema de diseño]** — [Carbon color palettes](https://carbondesignsystem.com/data-visualization/color-palettes/)
- **Categórica:** 14 colores aplicados "in sequence strictly", en este orden: Purple 70 #6929c4, Cyan 50 #1192e8, Teal 70 #005d5d, Magenta 70 #9f1853, Red 50 #fa4d56, Red 90 #570408, Green 60 #198038, Blue 80 #002d9c, Magenta 50 #ee538b, Yellow 50 #b28600, Teal 50 #009d9a, Cyan 90 #012749, Orange 70 #8a3800, Purple 50 #a56eff.
- **Grupo de un solo color:** si se conoce de antemano el número de categorías, se puede usar un solo color: Purple 70, Blue 80, Cyan 50 o Teal 70.
- **Secuenciales:** 4 familias (Blue, Purple, Cyan, Teal) de 10 pasos cada una. En tema claro, el más oscuro = valor mayor. En tema oscuro, el más claro = valor mayor.
- **Divergentes:** rojo-cian para frío/calor, y púrpura-teal para datos sin connotación de temperatura (desempeño, ventas, tasas de cambio). No cambian entre tema claro y oscuro.
- **Estados:** Red 60 #da1e28 (error), Orange 40 #ff832b (advertencia seria), Yellow 30 #f1c21b (advertencia), Green 60 #198038 (éxito).
- **Gradientes:** evitar varios gradientes ("often inaccessible"). Nunca usar un gradiente en lugar de una paleta secuencial.

**Datawrapper, "A detailed guide to colors in data vis style guides" (Lisa Charlotte Muth, 30 mar 2022) [PRÁCTICA]** — [Datawrapper](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides)
- "Choose 3-10 different colors". Una paleta minimalista basta para gráficos de 4 categorías o menos. Las organizaciones grandes necesitan un orden de colores definido y documentado.
- Variar el lightness entre colores categóricos, para que se distingan incluso en blanco y negro. Probar con daltonismo. Verificar que se distinguen en todos los tamaños, de línea fina a área grande.
- Definir un orden para gráficos de 1, 2 y 3+ colores.
- Colores más saturados para áreas pequeñas (líneas, marcadores) y menos saturados para áreas grandes (barras, áreas, mapas).
- Secuenciales: amplio rango de lightness. El azul se sostiene mejor oscuro que el amarillo o el magenta. Un cambio sutil de tono ayuda a distinguir pasos.
- Divergentes: dos secuenciales unidas en su color más claro.
- Atenuar con opacidad, pero comprobar que el color no desaparezca en el fondo.
- El color de logo, si se usa, solo para la categoría más importante.

**NN/g [PRÁCTICA]**
- No usar color para valores cuantitativos, porque los tonos no se perciben como ordenados. Usar color como pista secundaria de agrupación junto con forma, bordes o proximidad. Cita que ~4.5% de la población tiene daltonismo, mucho más frecuente en hombres. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)

**Okabe-Ito [PRÁCTICA, origen académico]**
- La paleta viene del artículo "Color Universal Design" de Okabe e Ito. Es un vector de 8 colores con una variante que incluye gris, otra con negro y otra aclarada. — [Rbearcat docs](https://rdrr.io/cran/Rbearcat/man/palette_OkabeIto.html)

### Inferences
- Para un ERP con una marca propia: definir 1 color de acento (marca) para la serie única o la tienda destacada, y una escala de grises (gridlines < ejes < títulos) para todo lo demás. Una paleta categórica secundaria corta (≤6) con lightness escalonado y orden fijo, al estilo de Carbon y Datawrapper.
- Para comparar tiendas (Trujillo, Arequipa, Lima), asignar un color fijo a cada sede en todo el sistema (orden fijo, como pide Carbon) mejora la consistencia entre pantallas.
- Los semáforos (rojo, ámbar, verde) deben ir siempre acompañados de ícono o texto (NN/g: color + forma). Los colores de estado no se usan como paleta categórica.
- En dashboards con etiquetas de valor directas, WCAG 1.4.11 queda cubierto aunque las barras claras no lleguen a 3:1. Sin etiquetas, cada barra o línea necesita 3:1 contra el fondo, o un borde.
- Las escalas secuenciales deben invertir su sentido en modo oscuro (Carbon). Las divergentes pueden mantenerse.

### Gaps
- Los **hex exactos de Okabe-Ito** no se obtuvieron de una fuente leída esta sesión. Valores ampliamente difundidos (sin verificar aquí): #E69F00, #56B4E9, #009E73, #F0E442, #0072B2, #D55E00, #CC79A7, #000000/#999999. Hay que verificarlos antes de usarlos.
- **ColorBrewer (Cynthia Brewer, colorbrewer2.org)** y **Tableau 10**: no se consultaron.
- Las guías de color de **Atlassian, Material, Salesforce Lightning, Shopify Polaris Viz y Microsoft Fluent** no se consultaron.
- La página de Carbon no dice cuántos colores usar como máximo por gráfico, ni da guía de contraste o daltonismo en esa página.

---

## 4. Animación en gráficos

### Takeaway
Las transiciones animadas entre estados de datos mejoran la percepción del cambio y la gente las prefiere (Heer & Robertson 2007). Deben ser simples, con slow-in/slow-out, de ~1 s por etapa, con una puesta en etapas mínima (primero el eje, luego los valores), un escalonado leve y escalas comunes. No conviene animar transiciones sin dimensión compartida ni hacer secuencias de muchas etapas. Recharts ya respeta `prefers-reduced-motion` por defecto desde la versión 3.9.

### Cited Findings
**Heer & Robertson, "Animated Transitions in Statistical Data Graphics," InfoVis 2007 [EVIDENCIA]** — [PDF (UW)](https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf); [UW IDL](https://idl.uw.edu/papers/animated-transitions)
- **Congruencia:** los cuadros intermedios deben ser gráficos válidos. Usar transiciones consistentes para la misma operación semántica (por ejemplo, filtrar). No reutilizar una marca para representar otro dato: agregar o quitar marcas cuando cambian los datos.
- **Aprehensión:** agrupar transiciones similares (destino común). Minimizar la oclusión. Usar slow-in, slow-out. Preferir movimientos simples (traslación, expansión) a la rotación. Separar en etapas los cambios complejos. Durar solo lo necesario: ~1 s según Robertson et al.
- **Duraciones del experimento:** 1.25 s en el experimento 1 y 2 s en el 2 (para secuencias de varias etapas). Recomendación: ~1 s por etapa en dispersión, mejor que ~0.5 s.
- **Resultados:** la animación redujo de forma significativa el error de seguimiento en todos los tipos de transición. Mejoró las estimaciones en dispersión, barras agrupadas y donas (sin diferencia significativa en barras apiladas). Los participantes prefirieron la animación en todos los casos.
- **Etapas:** la puesta en etapas simple (separar el cambio de eje del cambio de valores) ayuda. Las secuencias con muchas etapas aumentaron el error y se juzgaron demasiado complejas.
- **Escalonado (stagger):** pequeños retrasos entre elementos reducen la oclusión con 3 o más elementos superpuestos (ordenar, pasar de barra a dona).
- **Ejes:** evitar reescalar; usar escalas comunes entre pasos de tiempo. Si hay que reescalar, hacerlo en una etapa separada. Mantener las gridlines durante el cambio (sugerencia sin probar).
- **Cuándo no animar:** cuando el inicio y el final no comparten ninguna dimensión de datos (usar un cambio estático o un fundido), cuando el movimiento no informa, o cuando es demasiado lento o complejo.

**Recharts (3.9+) [PRÁCTICA / implementación]** — [Recharts animations guide](https://recharts.github.io/guide/animations/)
- `isAnimationActive` vale `'auto'` por defecto en la mayoría de componentes. En ese modo, la animación "is enabled unless the user has requested reduced motion via their device settings". `false` la apaga.
- Animan por defecto: Area, Bar, ErrorBar, Funnel, Line, Scatter, Pie, Radar, RadialBar, Treemap.
- `animationEasing` vale `ease` por defecto y acepta `ease-in`, `ease-out`, `ease-in-out`, `linear`, `spring` y `cubic-bezier`. `animationBegin` es el retraso, 0 ms en el ejemplo. Los ejemplos usan 400 ms (barras) y 800 ms (serie de tiempo). La página no da un valor global de duración.
- Desde 3.9 existe `AnimationControllerProvider` para reemplazar el controlador basado en `requestAnimationFrame` (para tests y animación manual o por scroll).

### Inferences
- En un dashboard ERP, la animación vale para **cambios de datos** (cambiar de período, filtro o tienda): unos 300-800 ms con ease-in-out, primero el eje y luego las barras. La animación de **entrada** en cada carga es decorativa. Para usuarios que entran muchas veces al día (cajeras, encargadas), conviene desactivarla o hacerla mínima, porque demora la lectura sin aportar información. Esta recomendación es inferencia: no hay estudio citado sobre animaciones de entrada.
- Mantener escalas comunes entre filtros (por ejemplo, el mismo eje Y al cambiar de tienda en múltiplos pequeños) reduce la necesidad de reescalar, que según Heer & Robertson empeora las estimaciones.
- Con Recharts 3.9+ no hay que programar el respeto a reduced-motion, siempre que no se fuerce `isAnimationActive={true}`.

### Gaps
- No se encontró evidencia experimental específica sobre animaciones de **entrada** (gráfico que "crece" al cargar) en dashboards. Su clasificación como decorativa es práctica común, no un resultado citado aquí.
- La duración por defecto de Recharts (históricamente 1500 ms en versiones anteriores) no se confirmó en la guía v3 leída.

---

## 5. Accesibilidad de gráficos (más allá del contraste)

### Takeaway
Chartability (Frank Elavsky) es el marco de auditoría de referencia: principios POUR + CAF, 50 heurísticas y una lista corta de 14 pruebas (de 20 a 40 min). En React con shadcn/Recharts, el prop `accessibilityLayer` agrega teclado y lector de pantalla. La tabla de datos alternativa también sirve como excepción de WCAG 1.4.11.

### Cited Findings
- **Chartability:** son heurísticas comprobables para auditar la accesibilidad de visualizaciones. Principios POUR (Perceivable, Operable, Understandable, Robust) + CAF (Compromising, Assistive, Flexible). La auditoría rápida usa 14 pruebas (~20-40 min) y la completa, 50 heurísticas. Creador: Frank Elavsky, con patrocinio de Fizz Studio (Doug Schepers). Licencia CC-BY-SA 3.0. Paper en EuroVis 2022. — [Chartability](https://chartability.fizz.studio/) [ESTÁNDAR de facto / PRÁCTICA]
- **shadcn/ui charts:** `accessibilityLayer` "adds keyboard access and screen reader support to your charts". — [shadcn Chart docs](https://ui.shadcn.com/docs/components/chart)
- **WCAG 1.4.11:** una tabla que sigue al gráfico, o etiquetas de valor visibles, eximen a los gráficos del requisito de 3:1. — [W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) [ESTÁNDAR]
- **NN/g:** combinar color con forma, bordes o proximidad, porque ~4.5% de la población tiene daltonismo. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)
- **Recharts:** respeta `prefers-reduced-motion` en modo `'auto'`. — [Recharts](https://recharts.github.io/guide/animations/)

### Inferences
- Para cada gráfico del ERP: (1) un título que diga la conclusión, (2) etiquetas directas de valor donde sea viable, (3) una opción "ver como tabla" (cubre 1.4.11 y sirve al lector de pantalla), (4) `accessibilityLayer` activo en Recharts, (5) no depender solo del color. Por ejemplo, el estado de stock con ícono más texto.
- La lista corta de Chartability (14 pruebas) es una auditoría razonable al cerrar cada pantalla con gráficos.

### Gaps
- No se obtuvo el listado nominal de las 14 heurísticas críticas de Chartability (la página principal no las enumera). Habría que leer el workbook.
- No se pudo leer la documentación ARIA de ECharts (https://echarts.apache.org/handbook/en/best-practices/aria/, bloqueada): descripción automática y patrones `decal` para daltonismo, sin verificar.
- No se consultó la documentación de accesibilidad de Highcharts.

---

## 6. Tarjetas KPI, formato de números, etiquetado directo y layout de dashboard

### Takeaway
La evidencia verificada esta sesión respalda: el bullet graph para KPI contra meta (Few), barras ordenadas (NN/g), dashboards de una sola vista para información de un vistazo (NN/g), gráficos de ≥80 px de alto (Heer & Bostock) y anotar en lugar de usar doble eje (Datawrapper). La anatomía de la tarjeta KPI, el formato numérico (abreviaturas, cifras significativas, numerales tabulares) y el etiquetado directo frente a la leyenda **no** se verificaron con fuente primaria en esta sesión.

### Cited Findings
- Dashboard = visualizaciones en una sola vista para información de un vistazo. Distinguir el operativo (urgente) del analítico. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)
- Ordenar las barras de forma ascendente o descendente facilita comparar. — [NN/g](https://www.nngroup.com/articles/dashboards-preattentive/)
- KPI contra meta: bullet graph con la medida principal, una o dos comparativas (meta, año anterior) y 3 rangos cualitativos. Se apilan en series para varias métricas o tiendas. — [Few spec](https://www.telerik.com/docs/default-source/blogs-docs/bullet_graph_design_spec-pdf)
- La alternativa de "priorizar y etiquetar" (mostrar la serie principal y anotar la secundaria con cifras clave) frente al doble eje. — [Datawrapper](https://www.datawrapper.de/blog/dualaxis)
- shadcn `ChartTooltipContent` acepta `indicator` (dot, line, dashed), `hideLabel` y `hideIndicator`. `ChartLegendContent` usa `nameKey`. — [shadcn](https://ui.shadcn.com/docs/components/chart)
- Altura mínima útil de un gráfico: ~80 px. Con 40 px el error sube de forma significativa. — [Heer & Bostock 2010](https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf)

### Inferences
- Anatomía razonable de una tarjeta KPI para el ERP, derivada de lo anterior: etiqueta (qué mide y de qué período), valor principal grande, comparación (contra meta o período anterior, con signo y una flecha o ícono además del color), y tendencia (sparkline de ≥40-80 px sin gridlines, o bullet graph). Es inferencia: no hay fuente verificada de la anatomía exacta.
- Para comparar varias tiendas, los múltiplos pequeños con la misma escala o una lista de bullet graphs apilados cumplen las reglas de escala común (Heer & Robertson) y de evitar el doble eje (Datawrapper).

### Gaps
- Sin fuente verificada esta sesión para:
  - formato numérico (abreviaturas k/M, cifras significativas, alineación decimal, numerales tabulares `font-variant-numeric: tabular-nums`);
  - etiquetado directo frente a leyenda (Datawrapper y Knaflic lo recomiendan según la literatura conocida, pero no se leyó la fuente);
  - anatomía de la tarjeta KPI en sistemas de diseño (Carbon, Polaris, Fluent);
  - reglas de layout (patrón F/Z, KPI arriba a la izquierda, número máximo de widgets). NN/g no fija un máximo de elementos.
- No se consultaron Datawrapper Academy (etiquetas, ejes) ni guías de NN/g sobre tarjetas KPI.

---

## 7. Librerías para React/Next.js/shadcn

### Takeaway
shadcn/ui charts está construido sobre Recharts v3. Los colores se definen con variables CSS (`--chart-N`) y temas claro y oscuro, y hay accesibilidad de teclado vía `accessibilityLayer`. Recharts 3.9+ respeta reduced-motion. No se verificó con fuente primaria una comparación de Visx, Nivo, ECharts y Observable Plot.

### Cited Findings
- shadcn charts "now uses Recharts v3". `ChartContainer` necesita una altura, `min-h-*` o `aspect-*` para que `ResponsiveContainer` mida en el primer render. `ChartConfig` se usa con `satisfies`. Los colores van como `var(--chart-1)` (en v3, no `hsl(var(--chart-1))`), y en los componentes se usa `var(--color-KEY)`. Un color puede ser un objeto `theme` con `light` y `dark`. El ejemplo usa oklch. — [shadcn Chart docs](https://ui.shadcn.com/docs/components/chart)
- Notas de v3: `ChartTooltip.defaultIndex` solo fija el estado inicial; quitar `layout` de `<Bar>` si `<BarChart>` ya lo define. — [shadcn](https://ui.shadcn.com/docs/components/chart)
- Recharts 3.9+: `isAnimationActive='auto'` respeta reduced-motion; existe `AnimationControllerProvider`. — [Recharts](https://recharts.github.io/guide/animations/)

### Inferences
- Para un ERP Next.js + shadcn, Recharts (vía shadcn) es el camino de menor fricción: tokens de color por CSS, modo oscuro, accesibilidad base y reduced-motion por defecto. Para miles de puntos o heatmaps densos, ECharts (Canvas) sería la alternativa. Es inferencia de conocimiento general, no verificada esta sesión.

### Gaps
- No se pudo leer el contenido de la comparación de 2026 (youngju.dev devolvió solo metadatos). Sin datos verificados de rendimiento (límites de puntos SVG frente a Canvas), tamaño de bundle ni accesibilidad de Visx, Nivo, ECharts y Observable Plot. Otras fuentes posibles, no leídas: [TanStack Charts comparison](https://tanstack.com/charts/latest/docs/comparison), [pkgpulse 2026](https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026).
- La página de shadcn no lista explícitamente `--chart-3` a `--chart-5` en el fragmento leído.
