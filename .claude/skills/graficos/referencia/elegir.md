# Elegir el gráfico por la pregunta — el mapa completo

Se elige por **la relación que la pantalla quiere mostrar**, no por gusto ni por variedad. La base es el *Visual Vocabulary* del Financial Times
(nueve relaciones), aterrizada a las seis piezas `grafico.*` de `CLAUDE.md` («Una función, una pieza», ADR-0358). `[Práctica]`: es una guía
de oficio, no un experimento. Las razones perceptivas (por qué barras y líneas ganan) son `[Evidencia]` y están en `fuentes.md`.

## Paso 0 · ¿Hace falta un gráfico?

Antes de dibujar, tres preguntas. Si alguna dice «no», no hay gráfico.

| Si la respuesta es… | Va | Por qué |
|---|---|---|
| un solo número («¿cuánto vendí hoy?») | `<TarjetaCifra>` (`cifra`) | un número se lee; una forma se interpreta |
| cinco cosas con nombre («¿qué se acaba?») | una lista (`<Tabla>` o filas) | ADR-0357, prueba ciega: la lista de 5 prendas sacó 5 · 5; las barras, 3 · 2. «Un nombre de prenda se entiende; una forma, no.» (lectoras simuladas, `[Práctica]`) |
| un sí/no o un estado | `<Chip>` (`estado`) o `<Aviso>` | el veredicto ya está traducido (ley 3 de `/formidable`) |

## El mapa: relación → pieza del repo

| Relación (FT) | Pregunta de tienda | Pieza | Cómo |
|---|---|---|---|
| **Magnitud** | ¿Cuánto le compré a cada proveedor? ¿Qué talla se vende más? | `grafico.escala` → `<BarraAvance tono="tinta">` medida contra la mayor | barras horizontales, **ordenadas de mayor a menor** (NN/g), nombre a la izquierda, cifra a la derecha |
| **Ranking** | ¿Qué tienda vendió más este mes? | `grafico.escala` | igual que magnitud; el orden ES el mensaje |
| **Cambio en el tiempo**, continuo o contra una referencia | ¿Cómo va hoy contra ayer? ¿El mes contra la meta? ¿El costo compra a compra? | `grafico.linea` → `<Linea serie referencia proyeccion>` | lo de hoy en tinta, la referencia en taupe punteado; `escalones` si el valor salta (un costo) |
| **Cambio en el tiempo**, por períodos, una serie | ¿Cuánto se vendió cada día? ¿Cada mes? | `grafico.barras` → `<BarrasTiempo>` | todas en arena, la que importa en tinta (`destacada`); FT: columnas, mejor con una sola serie |
| Tendencia dentro de una fila | ¿Este proveedor sube o baja? | `<Sparkline>` (de `grafico.linea`) | solo la forma, sin ejes; el número va al lado |
| **Parte del todo** (2 a 6 partes) | ¿Cómo se pagó? ¿Qué parte está vencida? | `grafico.barra` → `<BarraApilada segmentos>` | etiqueta y monto de cada tramo a la vista (`<MuestraTramo>` + nombre); con más de 6 partes, agrupa en «Otros» |
| **Avance contra una meta** | ¿Cuánto llevo de la meta? ¿Cuánto se contó del envío? | `grafico.avance` → `<BarraAvance pct marca>` | `marca` es la rayita de «a esta hora tocaba»; lo malo lo pone la pantalla con `tono` |
| Avance único, en grande, con la cifra | «Mi meta» del Inicio | `grafico.anillo` → `<Anillo pct tamano>` | **la cifra va adentro** y es la que se lee; el arco acompaña |
| **Desviación** (sobre o bajo cero, una meta, un promedio) | ¿Qué días se perdió plata? ¿Estoy bajo la meta? | `<BarrasTiempo>` con negativas (bajan desde la raya del cero) · `<Linea referencia bajoReferencia>` | FT: barra divergente y línea con superávit/déficit |
| **Correlación** | ¿Rebajar más vende más? | **no hay pieza** | no se inventa: propuesta a `/unificar` con la forma más usada del censo |
| **Distribución** | ¿Cuántas prendas tienen 0–30, 31–60, 61–90 días? | **no hay pieza** de histograma | mientras tanto, `grafico.escala` por tramo (cada tramo una barra) **o** una lista; nunca una dona |
| **Flujo** | ¿De dónde viene y a dónde va la mercadería? | aparte: el flujo de «Qué hacer hoy» de Análisis (ADR-0357) | no se copia a otra pantalla sin `/unificar` |
| **Espacial** | ¿Qué sede rinde más? | **no hay pieza** de mapa | tres sedes no piden un mapa: `grafico.escala` |

## Lo que queda aparte (no se «corrige» ni se usa de modelo)

Cada uno existe por una decisión de Felipe y vive con su propio vidrio o movimiento: **Estados financieros** (`LineaDeMeses`, `TuboDePartes`,
ADR-0611), **Finanzas** y su telar (ADR-0493), **Análisis** (ADR-0357), el **Observatorio** (ADR-0322), **«Cómo cerró cada día»** de Caja,
**Facturación**, los **pases de Traslados** y **Gestión ▸ Rendimiento** (ADR-0610). Una pantalla nueva usa las seis piezas; si una de esas
formas le sirve, se lleva a `/unificar`, no se copia.

## Dos ejes: no

Para público general, el doble eje engaña: las escalas son arbitrarias y dos series parecen moverse al mismo ritmo cuando no
(Datawrapper, con Isenberg et al. 2011: los superpuestos de doble escala rinden peor en precisión y velocidad). Datawrapper lo aceptó en
2026 **para lectores entrenados** (finanzas); quien atiende una tienda no lo es. En su lugar, en este orden:

1. **Dos piezas lado a lado**, cada una con su escala y su título.
2. **La serie principal y la otra anotada**: `<Linea notas>` o `marcas` con las cifras clave.
3. **Indexado** (las dos en «% de cambio desde el día 1»), con los montos en el globito (`leer`).

## Muchas series o muchas tiendas: múltiplos pequeños con la MISMA escala

Tres sedes, tres piezas iguales, una al lado de la otra, con el mismo tope: `<BarrasTiempo max={topeComun}>`, `<Linea minY maxY>` con los
mismos valores, `<BarraApilada total={mayor}>`. Sin escala común, la barra más alta de Arequipa y la de Trujillo miden lo mismo aunque una
venda el doble (Heer & Robertson 2007: evitar reescalar; si hay que hacerlo, en una etapa aparte).

## Barras desde cero (y cuándo cambiar de marca)

El largo de una barra ES el número: si no empieza en cero, miente. `<BarrasTiempo>`, `<BarraAvance>` y `<BarraApilada>` ya arrancan en cero.
Si lo que importa es la variación chica (un margen entre 38 % y 42 %), **no se trunca la barra: se cambia a `<Linea>` con `minY`**. Few lo dice
igual en el bullet graph: una barra implica base cero; con la escala truncada, la marca es un punto.

Detalle que hay que saber: `<BarrasTiempo>` dibuja **3 px como mínimo** a todo valor distinto de cero (`px()` en `BarrasTiempo.tsx`), para
que un día de S/ 4 no desaparezca. Con valores muy chicos junto a uno enorme, la barra de 3 px exagera un poco: si eso confunde, pon la cifra.
