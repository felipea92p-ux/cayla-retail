# Cómo mostrar muchos proveedores: lo que dice la investigación (2026-10-26)

Felipe rechazó dos rondas de maquetas de Proveedores. Lo que pidió en la tercera:

- **Un ranking** que se pueda ordenar por prendas compradas y por dinero.
- **A la derecha**, lo que no se ve a simple vista o lo necesario.

Y lo que rechazó:

- **El mosaico:** «tengo muchos proveedores, mostrarlos en forma de mosaico es un error tremendo».
- **El espacio** desaprovechado sin necesidad.
- **Los colores** mal usados.

Antes de dibujar, busqué cómo se resuelve esto en la práctica y en los estudios de percepción. Esto es lo que encontré y cómo cambia el diseño.

## 1. Para comparar muchos, largo y no área

- **El estudio clásico:** Cleveland y McGill (1984) ordenaron las formas de mostrar un número según cuánto se equivoca la gente al leerlas.
  Posición y largo se leen mejor que área.
- **Treemaps:** Heer y Bostock repitieron el experimento con treemaps. La gente subestima el área, y el treemap es más rápido de mirar
  pero menos exacto.
- **Muchos registros:** Yalçın, Elmqvist y Bederson (2017) compararon treemaps con barras en varias columnas, con hasta 300 registros.
  Las barras ganaron en exactitud para comparar, ordenar y tener un panorama.

**Para Proveedores:** con 52 proveedores con compras (ADR-0502) y unos 100 activos, el mosaico era la forma equivocada. Felipe tenía razón.
La pieza es una **lista ordenada con una barra por fila**: el largo es cuánto le compraste.

## 2. Una tabla larga: densa, ordenada por lo importante, con barra solo en la columna que manda

Las guías de diseño de tablas (Datawrapper, Schwabish, guías de diseño de tablas de producto) coinciden en esto:

- **Cuándo una barra:** la barra va solo en la columna más importante, porque ensancha la columna.
- **El orden:** primero lo que más importa, nunca el alfabeto.
- **Búsqueda y orden:** una tabla larga permite buscar y reordenar.
- **Los números:** a la derecha, con el mismo redondeo, y la unidad dicha una vez.
- **Filas compactas:** con muchas filas van compactas y con una raya fina entre ellas.
- **El color:** solo para lo que no se puede pasar por alto.

**Para Proveedores:**

- **La barra:** una sola barra, la de «le compraste» (prendas o soles según el botón). Por dentro, la parte de tinta es lo vendido y la
  arena, lo que queda.
- **El orden:** la lista arranca ordenada por cuánto le compras. El botón grande cambia entre **prendas** y **dinero**.
- **Las demás columnas:** vendido, semanas para venderlo, margen y lo que le debes van en números, sin barras.
- **Filas largas:** desde la fila 20, «Ver los que faltan».

## 3. El color, solo para la excepción

- **Stephen Few:** los colores fuertes se usan poco, solo para resaltar lo que de verdad importa. Lo que se agrega por variedad empeora el
  tablero.
- **Oracle, «manejo por excepción»:** el color marca lo que sale del rango aceptable. Mal usado distrae y esconde lo que se necesita ver.
- **Accesibilidad (sistema de diseño del NHS de Escocia, UTMB, Meraki):**
  - Nunca se dice un estado solo con color: va con su palabra y con una forma.
  - El rojo y el verde se confunden con daltonismo.

**Para Proveedores (lo que salió mal en la v2):** cuadros enteros pintados de verde, ámbar y pizarra hacían que todo gritara a la vez. Ahora:

- **Las cantidades en neutro:** barras de tinta sobre arena.
- **El color, en un solo lugar de la fila:** la marca del ritmo junto a las semanas. Va con su forma y su palabra:
  - **●** verde «Repón»
  - **▲** ámbar «Frena»
  - **■** pizarra «A su ritmo»
- **Rojo solo para lo vencido**, que es lo único que pide actuar hoy. Así se respeta también el «máx. 2 rojos» de la paleta (ADR-0169).

## 4. A la derecha: una cola de excepciones, ordenada por urgencia

- **Los patrones de tableros operativos** (Oracle Alta, guías de tableros de alerta, paneles de riesgo en salud) recomiendan lo mismo para
  lo que pide atención:
  - una lista **ordenada por prioridad**;
  - cada ítem con **por qué salió**, su número y la acción que toca;
  - todo lo demás, fuera de la vista.
- **Lista y detalle:** al tocar una fila, su detalle se abre al lado sin perder la lista. Es el patrón «maestro-detalle».

**Para Proveedores:** la columna derecha es «Lo que no se ve a simple vista», en tres bloques de urgencia:

- **Para hoy:** lo vencido y las entregas atrasadas.
- **Antes de comprar:** a quién frenar, la plata parada, el margen por confirmar.
- **Oportunidades:** a quién reponer, la talla que falta, la sede donde rinde.

Cada ítem lleva su número en grande, a quién le toca y «Ver».

## 5. Las medidas que usa el retail para esto

- **Las medidas estándar:** los reportes de marca y proveedor de los sistemas de retail usan **sell-through** (vendido sobre lo que llegó) y
  **semanas de stock** (cuánto dura lo que queda al ritmo actual). Ejemplos: los reportes de Oracle Retail y los de inventario de Shopify,
  que también mide «días que le quedan» con las unidades vendidas por día.
- **CAYLA ya las tiene:** es lo mismo que calcula `proveedor-ritmo-reglas.ts` (vendido y semanas para vender lo que queda). No hace falta
  inventar una medida: se muestran esas dos, con su nombre en lenguaje de tienda.

## 6. Concentración: a quién le compras de verdad

- **Pareto o análisis ABC:** las guías de compras ordenan a los proveedores por gasto y suman el porcentaje acumulado. Suele pasar que unos
  pocos concentran la mayor parte.
- **Para Proveedores:** una frase con su cifra (en los datos de ejemplo, «10 proveedores son el 52 % de lo que compras») y, en una maqueta, la curva acumulada al
  lado del ranking. Dice a simple vista quién importa.

## Las reglas que siguen las tres maquetas

- **Ranking primero:** la lista ordenada por cuánto le compras ocupa el lado ancho. Un botón grande cambia entre prendas y dinero.
- **Una barra por fila**, neutra: lo vendido en tinta y lo que queda en arena.
- **El color solo en la marca del ritmo y en las excepciones,** con forma y palabra. Nada de cuadros pintados.
- **A la derecha, fija al bajar:** lo que no se ve a simple vista, ordenado por urgencia.
- **Sin espacio muerto:** cabecera corta, sin franjas decorativas. Filas de 44 a 52 px con letra de 14 a 15 px y números grandes solo donde
  deciden.
- **Muchos proveedores:** buscador, filtros por estado con su cuenta, «Ver los que faltan», el Taller aparte.

## Fuentes

- Cleveland y McGill, y su repetición con treemaps: [Heer y Bostock, «Crowdsourcing Graphical Perception»](https://homes.cs.washington.edu/~jheer/files/treemaps.pdf) ·
  [Encuesta de estudios de percepción por tarea](https://arxiv.org/pdf/2107.07477) · [Graphical perception (Cornell)](https://info3312.infosci.cornell.edu/ae/graphical-perception-A.html)
- Treemaps contra barras con muchos registros: [Yalçın, Elmqvist y Bederson, «Raising the Bars»](https://cs.au.dk/~elm/pdf/raising-the-bars.pdf)
- Tablas: [Datawrapper, cómo diseñar tablas](https://www.datawrapper.de/blog/tables/) · [10 guías para mejores tablas (Schwabish)](https://www.r-bloggers.com/2020/09/10-guidelines-to-better-table-design/) ·
  [Barras dentro de una tabla](https://www.insightsoftware.com/encyclopedia/data-bar-table) · [Diseñar mejores tablas](https://coyleandrew.medium.com/design-better-data-tables-4ecc99d23356) ·
  [Números alineados para leerlos rápido](https://design.alberta.ca/examples/display-numbers-in-a-table-so-they-can-be-scanned-easily)
- Color con moderación (Few): [Perceptual Edge sobre bullet graphs](https://www.perceptualedge.com/blog/?p=160) · [Resumen de «Information Dashboard Design»](https://www.packtpub.com/en-RO/learning/how-to-tutorials/visualization-dashboard-design) ·
  [ArcGIS, tableros eficaces](https://www.fairfaxcounty.gov/euclid/help/en/dashboards/10.9.1/reference/author-effective-dashboards.htm)
- Manejo por excepción: [Oracle Alta, Manage by Exception](https://www.oracle.com/webfolder/ux/middleware/alta/patterns/ManageByException.html) ·
  [De tableros a colas de excepciones](https://www.antoinebuteau.com/the-end-of-the-dashboard-series-6-from-monitoring-to-exception-workflows/) ·
  [Patrones de tableros empresariales](https://xylitytech.com/data-analytics/dashboard-design-patterns-enterprise-templates/)
- Color y daltonismo: [NHS Scotland, paleta de estados](https://www.turasdesignsystem.nhs.scot/design/data-visualisation/status-palette/) ·
  [UTMB, indicar con color](https://www.utmb.edu/accessibility/digital/100-days-of-a11y/100-days-article/days-of-a11y/2024/04/29/day-20--indicating-meaning-with-color) ·
  [Meraki, modo para daltonismo](https://community.meraki.com/t5/Feature-Announcements/Colorblind-Assist-Mode-Now-Available-Across-the-Dashboard-to/ba-p/217908)
- Medidas de retail: [Oracle Retail, reportes con sell-through y semanas de stock](https://docs.oracle.com/cd/E69213_01/pdf/1800028/html/user_guide/packaged_reports.htm) ·
  [ShopifyQL, días de inventario](https://shopify.dev/docs/api/shopifyql/latest/schemas/inventory/inventory.md) ·
  [Sell-through en Shopify](https://analyzify.com/hub/product-performance-analysis-with-shopify-analytics)
- Concentración (Pareto, ABC): [Pareto en compras](https://planergy.com/blog/pareto-analysis-in-procurement/?print=pdf) ·
  [ABC de proveedores](https://simplesystem.com/en/magazin/abc-analyse-lieferanten)
