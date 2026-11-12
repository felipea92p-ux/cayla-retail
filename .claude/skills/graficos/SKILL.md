---
name: graficos
description: Diseña y audita al milímetro los gráficos y las cifras del ERP CAYLA (set «Al milímetro») — elige la pieza por la pregunta que responde, fija codificación, base cero, alto, rejilla, etiquetas, color de dato y daltonismo, el 3:1 de las marcas (WCAG 1.4.11), la meta, la tarjeta de cifra, la animación de datos (Heer & Robertson) y la accesibilidad, todo con las seis piezas `grafico.*` y `TarjetaCifra` que ya existen. Entrega la sección «Gráfico» de la ficha de /milimetro. Úsala al poner un gráfico, una barra, una línea, un anillo o una cifra en una pantalla, al revisar uno que «no se entiende», «se ve apagado», «está muy chico» o «no sé qué dice», y cuando Felipe pida «el gráfico al milímetro» o «como los mejores del mundo».
---

Gráfico al milímetro: $ARGUMENTS   (una pantalla, un componente, una captura o sin argumento = el gráfico que estás construyendo)

**Un gráfico del ERP responde UNA pregunta de tienda con la pieza que ya existe, se lee sin pasar el mouse y cumple lo medido: 3:1, ≥ 80 px, base cero, una vez y quieto.**

## Candados

1. **El repo manda sobre la skill.** Colores, solo tokens de `apps/web/app/globals.css` (+ oscuro en `apps/web/app/estilos/tema.css`); piezas,
   solo la tabla «Una función, una pieza» de `CLAUDE.md` (ADR-0358): `grafico.barra`, `grafico.avance`, `grafico.anillo`, `grafico.linea`,
   `grafico.barras`, `grafico.escala` y `cifra`; movimiento, ADR-0136 / ADR-0357 / ADR-0625 con `--t-*`, `--ease-cayla`, `--ease-salida`.
   **Nunca un hex, una fuente, una librería ni una pieza de gráfico nueva.** El repo no usa recharts, visx ni d3 (`apps/web/package.json`):
   las seis piezas son SVG y CSS propios, y no se suma una librería para «ganar tiempo».
2. **Lo que queda aparte no se toca ni se copia:** Estados financieros (ADR-0611: `LineaDeMeses`, `TuboDePartes`), Finanzas y su telar
   (ADR-0493), Análisis (ADR-0357), Observatorio (ADR-0322), «Cómo cerró cada día» de Caja, Facturación, los pases de Traslados, Rendimiento
   (ADR-0610). Si una forma de ahí sirve en otra pantalla, va a `/unificar`.
3. **Mejorar una regla = propuesta, no cambio.** Se escribe con: regla actual (archivo/ADR) → qué hacen los mejores (fuente) → propuesta →
   riesgo → cómo se mide; Felipe decide mirando. Cambiar una pieza cambia todos los módulos: exige su OK (CLAUDE.md «Reglas de ejecución»).
4. **Tres niveles, siempre etiquetados:** `[Evidencia]` estudio con personas · `[Norma]` WCAG o especificación · `[Práctica]` sistemas de
   diseño y oficio. Un número de práctica no se presenta como hallazgo.
5. **Se mide, no se opina:** cada número trae su verificación (`referencia/medir.js` en `javascript_tool`, un `grep`, una prueba).
6. **No duplica:** la forma única de la pieza es de `/unificar`; si se entiende en 5 s, de `/formidable`; el tiempo y la curva, de
   `/movimiento`; el contraste de texto y los tokens, de `/color`; los números escritos («S/ 1,240.50», «▲ 12 %»), de `/textos`; la letra de
   ejes y cifras, de `/tipografia`; el pulido, de `/better-ui` (se consulta, no manda). La skill `dataviz` de afuera trae su paleta: aquí no manda.

## Las reglas al milímetro

Fuentes cortas → `referencia/fuentes.md`. El mapa completo de elegir → `referencia/elegir.md`. Cómo se mide cada una → `referencia/auditar.md`.

### A · Elegir por la pregunta

1. **Primero la pregunta, en una línea, y el título dice la respuesta** («Vendiste 18 % más que el martes», no «Ventas por día»).
   Si la respuesta es un número → `<TarjetaCifra>`; si son cinco cosas con nombre → una lista. → ADR-0357 (la lista de 5 prendas sacó 5 · 5,
   las barras 3 · 2) · `[Práctica]` (lectoras simuladas).
2. **Relación → pieza** (FT Visual Vocabulary · `[Práctica]`):
   magnitud y ranking → `grafico.escala` (`<BarraAvance tono="tinta">` contra la mayor, **ordenadas de mayor a menor**) ·
   tiempo continuo o contra referencia → `grafico.linea` (`<Linea>`) · tiempo por períodos, una serie → `grafico.barras` (`<BarrasTiempo>`) ·
   tendencia en una fila → `<Sparkline>` · parte del todo (2–6) → `grafico.barra` (`<BarraApilada>`) · avance contra meta →
   `grafico.avance` (`<BarraAvance marca>`) · avance único con su cifra → `grafico.anillo` · desviación → `<BarrasTiempo>` con negativas o
   `<Linea referencia bajoReferencia>` · correlación, distribución, mapa → **no hay pieza: no se inventa** (lista o propuesta a `/unificar`).
3. **Nunca dos ejes.** Dos piezas lado a lado, o la serie principal con la otra anotada (`<Linea notas|marcas>`), o indexar. → no existe en
   las piezas (bien) · `[Práctica]` con `[Evidencia]` citada (Datawrapper; Isenberg 2011).
4. **Varias sedes o períodos: múltiplos pequeños con la MISMA escala** — `<BarrasTiempo max>`, `<Linea minY maxY>`, `<BarraApilada total>`
   iguales en todas. → las piezas ya lo permiten · `[Evidencia]` (Heer & Robertson 2007: no reescalar).

### B · Codificación

5. **Posición en escala común › largo › ángulo › área › color** para leer cuánto. Ángulo no salió peor que largo; área, peor que ángulo. Es
   el punto de partida, no ley: se prueba con datos reales (un pico, ceros, tres sedes, treinta días). → barras y líneas del sistema ·
   `[Evidencia]` (Cleveland & McGill 1984; Heer & Bostock 2010; crítica de Reda et al., arXiv 2608.07834).
6. **Las barras arrancan en cero.** Si importa la variación chica (margen 38–42 %), se cambia a `<Linea minY>`, nunca se trunca la barra.
   `<BarrasTiempo>` pinta 3 px mínimo a todo valor ≠ 0 (`px()`). → `BarrasTiempo`, `BarraAvance`, `BarraApilada` · `[Práctica]` (FT; Few).
7. **Sin tortas ni donas para repartir.** El ángulo es la señal más débil y la dona no lo arregla. Lo cobrado pasó a `<BarraApilada>`
   (2026-10-15). `<Anillo>` no reparte: es un avance único y **la cifra adentro es la que se lee**. → `grafico.barra` · `[Evidencia]` (Skau &
   Kosara 2016) · gauges radiales → bullet (NN/g, `[Práctica]`).

### C · Ejes, rejilla y tamaño

8. **Rejilla: tres rayas (cero, mitad, tope), alfa ≈ 0,2, ≥ 8 px entre rayas; ninguna bajo 80 px de alto.** Hoy `.linea-rejilla` (sand) y
   `.barras-tiempo-eje-y` (tinta 12 %) miden 1,24 y 1,28:1, más suaves que 0,2 (≈ 1,51:1) → ver propuesta 3 · `[Evidencia]` (Heer & Bostock).
9. **Alto ≥ 80 px si se lee magnitud; 40 px sube el error.** `<BarrasTiempo>` 140 de fábrica (96 en `BarrasMensuales`), `<Linea>` 200. El
   `<Sparkline>` (18 o 30 px) solo dice la forma: el número va al lado. `<BarraAvance>` y `<BarraApilada>` son largo en una dimensión: su alto
   (3·6·12 / 4·8·12 px) es grosor, no escala. → `[Evidencia]` (Heer & Bostock; aplicarlo a las barras de 1D es inferencia).
10. **Las cifras de ejes y marcas son tabulares** (`font-variant-numeric: tabular-nums`, ya en `.linea-eje`, `.barras-tiempo-eje-y`,
    `TarjetaCifra`) **y en `--color-taupe-profundo`** (5,58:1). Tamaño y familia → `/tipografia` (las etiquetas de gráfico están fuera del piso de
    14 px, fila `texto` de CLAUDE.md).

### D · Etiquetas y color

11. **Etiqueta directa antes que leyenda:** nombre y cifra junto a la marca (`<BarrasTiempo cifras="todas">`, `<Linea cifra cifraReferencia>`,
    tramo con `<MuestraTramo>` + nombre + monto). Leyenda solo con más de 3 series que no caben. → `[Práctica]` (sin fuente primaria leída).
12. **Un acento y grises de contexto.** Lo que importa en tinta (`destacada`, la serie de hoy); el resto en `--color-grafico-neutro` / arena.
    El rojo no es color de dato: es marca y error (ADR-0169, máximo 2 por pantalla). → `[Práctica]` (Datawrapper 2022).
13. **El estado lo pone la pantalla y va con palabra.** Verde/ámbar/rojo con `tono` (y `<Chip>` o la frase del titular), nunca como paleta
    categórica ni como único aviso. → `tono` de las piezas · `[Norma]` WCAG 1.4.1 · `[Práctica]` NN/g.
14. **Paletas.** *Categórica:* las familias de DATO con nombre — `--color-metodo-*`, `--color-camino-*`, `--color-sede-*`,
    `--color-persona-*`, `--color-reparto-*` —, **un color fijo por cosa en todo el ERP** y ≤ 6 por gráfico (lo demás, «Otros» en
    `--color-camino-otros`/taupe). *Divergente:* `--color-grafico-alza` · `-neutro` (centro claro, siempre con etiqueta) · `-baja`. *Avance:*
    `colorDeAvance` (rojo → `--color-avance-medio` → verde, solo Recibir, ADR-0604). *Secuencial:* **no existe** → propuesta 6. Las
    secuenciales se invierten en oscuro; las divergentes no. → `[Práctica]` (Carbon; Datawrapper).
15. **Daltonismo: dos colores vecinos con ΔE2000 ≥ 11 bajo deuteranopía y protanopía** (como se validó el trío `grafico-*`, comentario en
    `globals.css`); bajo 8 se confunden aun con vista normal (`lib/color-parecido.ts`, `UMBRAL_PARECIDO`). Y nunca solo color: nombre, forma,
    rayado (`rayada`), posición. → `[Práctica]` + `[Norma]` 1.4.1; ~4,5 % con daltonismo (NN/g).
16. **3:1 para cada marca necesaria contra lo que tiene al lado** (fondo, o la pista en una barra de avance), **salvo que su valor esté
    escrito a la vista o haya tabla equivalente**. El globito del mouse no cuenta. Hoy no pasan solos: `--color-grafico-neutro` 1,56,
    `--color-sand` 1,24, `--color-reparto-menta` 1,48, `-arcilla` 1,89, `--color-metodo-efectivo` 2,37, tinta 40 % de la proyección 2,49
    (tabla completa en `referencia/auditar.md`). → `[Norma]` WCAG 2.2 SC 1.4.11 · propuestas 1 y 2.

### E · Meta y cifra

17. **Meta: bullet graph** — medida principal, comparativa (la rayita), 3 rangos cualitativos (5 máx.), lo más oscuro = peor, invertido cuando
    menos es mejor (gastos, faltantes). Hoy `<BarraAvance pct marca>` es medida + comparativa **sin rangos** → propuesta 4. → `[Práctica]`
    (Few 2013; NN/g).
18. **La cifra es `<TarjetaCifra>`:** etiqueta (qué y de qué período) · valor (serif 600 de 28 px, lining y tabular; 22 bajo 148 px) ·
    comparación con signo y flecha en la primera línea del contexto («▲ 12 % vs. martes pasado», **nunca en rojo**) · tendencia opcional
    (`reparto`, la barra fina de adentro; o un `<Sparkline lleno>` debajo, como la franja de Tráfico, ADR-0568) · `valor={null}` + motivo si no hay dato. Cómo se escribe cada número → `/textos`. → `cifra` ·
    `[Práctica]` (anatomía sin fuente primaria verificada).

### F · Movimiento de datos (el tiempo y la curva son de `/movimiento`)

19. **Dos movimientos distintos.** *Entrada* (se arma al llegar): decorativa, sin evidencia de que ayude; ADR-0357: **una vez al entrar, sin
    rebote ni bucle**. *Transición de datos* (cambia sede, período, filtro): informativa — bajó el error de seguimiento en todos los tipos
    probados. Hoy las piezas hacen al revés: entran en 560–1100 ms y cambian en 500–700 ms → propuesta 5. → `[Evidencia]` (Heer & Robertson 2007).
20. **Cómo se anima un cambio de datos:** ~1 s por etapa como techo (probaron 1,25 y 2 s; el repo usa 500–700 ms y basta para una sola barra);
    **dos etapas como máximo** (primero el eje si cambia, después los valores); escalonado leve solo con 3+ marcas que se tapan (las piezas
    usan 34–38 ms); traslación y expansión, nunca rotación; slow-in/slow-out (`--ease-cayla`); **misma `clave` = misma marca** (la barra de
    Trujillo no pasa a ser la de Arequipa; marca nueva entra, la que se va sale). → `[Evidencia]` (Heer & Robertson).
21. **No se anima lo que no comparte dimensión** (de «ventas» a «stock»): corte o fundido de `--t-cambio`. Buscar o filtrar no re-arma todo
    el gráfico (regla de `globals.css`, «nunca sobre algo que la persona ya está usando»). → `[Evidencia]` (Heer & Robertson) · `[Norma]` repo.
22. **Quieto primero.** Las animaciones arrancan apagadas (ADR-0625): el gráfico se diseña y se revisa quieto, y el CSS con `backwards`
    llega al estado final; lo que anima desde JS pregunta `prefiereQuieto()` (`lib/movimiento-cliente.ts`) o `useQuieto()` (`lib/useQuieto.ts`), nunca `matchMedia`.
    → `lib/movimiento-reglas.test.ts`, `lib/analisis-movimiento.test.ts` · `[Norma]` repo.

### G · Accesibilidad

23. **Cada gráfico dice su conclusión al lector:** `etiqueta` obligatoria (`role="img"`/`"group"` + `aria-label`; en `<BarraAvance>`,
    `progressbar` con `aria-valuetext`); `decorativa` solo si el texto de al lado dice lo mismo. → las seis piezas · `[Norma]` WCAG 1.1.1.
24. **Lo que se toca, también con teclado:** `respuesta.onElegir` vuelve cada barra o tramo un `<button>` con `aria-pressed`; `<Linea onElegir>`
    se recorre con ← → y Enter. Lo que solo dice el globito no llega al dedo ni al teclado: va escrito o en la tabla. → `[Norma]` 2.1.1 · ley 6 de `/formidable`.
25. **Tabla equivalente** cuando las marcas no llegan a 3:1 y no llevan su cifra, o cuando hay más de ~12 puntos que el lector no puede
    recorrer: hoy **no existe** una «Ver como tabla» en las piezas → propuesta 1. → `[Norma]` 1.4.11 (excepción) · Chartability `[Práctica]`.

## Cómo se usa

**Diseñar** (sale la sección «Gráfico» de la ficha):
1. Escribe la pregunta y la respuesta en una línea (regla 1). ¿Hace falta gráfico? (`referencia/elegir.md`, paso 0).
2. Elige la pieza en el mapa (regla 2). Si no hay, para: lista o propuesta, nunca una pieza nueva.
3. Fija escala y base (4, 6), alto y rejilla (8, 9), qué va escrito (11, 16) y el color de cada serie por su familia de DATO (12–15).
4. Decide el movimiento: entrada de la pieza (no se cambia) y qué pasa al cambiar los datos (19–21); pásale la duración a `/movimiento`.
5. Escribe `etiqueta` con la conclusión, el teclado y la tabla (23–25). Llena la plantilla de abajo y mídela en el navegador antes de entregar.

**Auditar** un gráfico existente (en local, a 1440 × 900, en claro y en oscuro, con «Animaciones» apagadas y encendidas):
pega `referencia/medir.js` en `javascript_tool`; devuelve por pieza el alto, la rejilla, el contraste de cada marca y de su pista, las
cifras escritas, el lector, el movimiento, y las listas `fallan3a1`, `bajo80px`, `rejillaJunta`, `sinEtiqueta` y `sospechososAMano`. Con eso,
la lista de 12 (cada punto: pasa / falla / no aplica, con su evidencia; cómo medir cada uno en `referencia/auditar.md`):

| # | Revisa | Pasa si |
|---|---|---|
| 1 | Pregunta y titular | la pantalla dice la conclusión en palabras; el gráfico la muestra |
| 2 | Pieza del sistema | es una de las seis `grafico.*` o está «aparte» con su ADR; `sospechososAMano` vacío; `lib/unificar.test.ts` en verde |
| 3 | Forma por la relación | coincide con el mapa de `elegir.md`; nada de tortas ni gauges para repartir |
| 4 | Escala | barras desde cero; sin doble eje; múltiplos con el mismo `max` / `minY maxY` / `total` |
| 5 | Alto y rejilla | ≥ 80 px si se lee magnitud; rayas ≥ 8 px; sin rejilla bajo 80 px |
| 6 | Etiquetas | cifra y nombre junto a la marca; leyenda solo con > 3 series; cifras tabulares |
| 7 | Acento | una marca en tinta; contexto en arena/neutro; el rojo no es dato (≤ 2 por pantalla) |
| 8 | Paleta y daltonismo | solo tokens de DATO con nombre; ΔE ≥ 11 entre vecinos simulados; nunca solo color |
| 9 | 3:1 de las marcas | `fallan3a1` vacío, o cada falla con `cifrasEscritas` = sus marcas, o con tabla en la pantalla |
| 10 | Oscuro | el mismo informe con `data-tema="oscuro"` no suma fallas |
| 11 | Movimiento | entrada una vez, sin rebote ni bucle, `--ease-cayla`; el cambio de datos conserva la `clave`; quieto llega al final |
| 12 | Lector y teclado | `sinEtiqueta` vacío; lo que se toca va con Tab/flechas/Enter; nada vive solo en el globito |

Entrega: la tabla con evidencia (**Medido** / **Observado** / **Opinión**), los 3 arreglos de mayor impacto y, aparte, lo que choca con una
regla del repo como propuesta. Si el gráfico vive en una pantalla, avísale a `/formidable` en vez de calificar la pantalla tú.

## Tu sección de la ficha

```
## Gráfico      (de /graficos)
Pregunta → respuesta: «…» → «…» (el titular la dice)
Relación (FT): magnitud | ranking | tiempo | parte del todo | avance | desviación     ¿Hace falta? sí, porque …
Pieza: <BarrasTiempo …> (grafico.barras)  |  aparte: no
Escala: base 0 · tope = … (común con …: sí/no) · minY/maxY …
Alto: … px (≥ 80 si magnitud) · rejilla: 3 rayas, separación … px, alfa …
Escrito a la vista: nombre … · cifra … (todas / la destacada / ninguna + tabla)
Color por serie: <serie> → <token> (familia de DATO) · acento: tinta en … · estado: tono … + palabra «…»
Contraste medido: marca … : …:1 contra … · pista … : …:1 · excepción usada: etiqueta | tabla | ninguna
Daltonismo: pares vecinos y su ΔE simulado …
Movimiento: entrada de la pieza (sin cambios) · cambio de datos: qué cambia, clave estable sí/no, etapas …, duración → /movimiento · quieto: estado final
Lector: etiqueta = «…» · teclado: … · tabla: sí/no
Fuentes: [Evidencia] … · [Norma] … · [Práctica] …
```

## Propuestas de mejora al repo

Cada una: **propuesta, espera a Felipe** (cambia piezas de todos los módulos).

| # | Regla actual | Qué hacen los mejores | Propuesta | Riesgo | Cómo se mide |
|---|---|---|---|---|---|
| 1 | Ninguna pieza ofrece la tabla equivalente (`BarrasTiempo`, `Linea`, `BarraApilada`) | WCAG 1.4.11 exime con «a table that follows the graph»; Chartability pide una alternativa recorrible | prop `tabla` en las tres: un `<table>` real con `<Tabla>`, oculto a la vista y abierto con un `BotonVerMas` «Ver como tabla» | más DOM; un botón más por gráfico | `fallan3a1` con `cifrasEscritas` 0 → 0 en las pantallas piloto; VoiceOver lee filas |
| 2 | Las barras de contexto de `BarrasTiempo` en `--color-grafico-neutro` dan 1,56:1 en claro | 3:1 o etiqueta (W3C); grises más oscuros para marcas (Datawrapper) | las barras sin `tono` suben a tinta 35 % sobre el neutro (`color-mix`, ~3,19:1, sin hex nuevo), o `cifras="todas"` de fábrica con ≤ 12 barras | el acento en tinta pierde distancia; el ojo de Felipe | `medir.js` en Caja, Compras y la vista de proveedor; antes/después al mismo ancho |
| 3 | Rejilla en sand (1,24:1) y tinta 12 % (1,28:1) | alfa 0,2 es «seguro» y la rejilla mejora la precisión (Heer & Bostock) | `.linea-rejilla` y `.barras-tiempo-eje-y` a tinta 20 % (≈ 1,51:1) | más ruido si hay muchas piezas juntas | captura lado a lado; contraste de la rejilla en el informe |
| 4 | `BarraAvance` tiene medida y comparativa, sin rangos | bullet graph de Few: 3 rangos en una sola tinta (40 / 25 / 10 %) | prop `rangos` (2–3 cortes, 0–100) pintados con tinta al 10 / 25 / 40 % sobre la pista; `invertido` para gastos | otra lectura que aprender; la pista hoy dice «lo que falta» | prueba ciega de `/formidable` en «la meta de hoy» de Caja: ¿entiende «vas bien / al filo»? |
| 5 | Entrada 560–1100 ms; cambio de datos 500–700 ms; quieto, ambos a 0,01 ms (ADR-0625) | la transición de datos es la que ayuda (Heer & Robertson, ~1 s); la entrada no tiene evidencia | entrada ≤ `--t-momento` (480 ms); el cambio de datos de 500 a ~800 ms en dos etapas cuando las marcas cambian de lugar | contradice «ricas, una vez» que Felipe eligió; se siente más lento si se cambia de sede seguido | medir en `medir.js` → `movimiento`; probar con 3 cambios de sede seguidos |
| 6 | No hay escala secuencial (de menos a más) | secuenciales de un tono con rango amplio de luminosidad, invertidas en oscuro (Carbon, Datawrapper) | `--color-secuencia-1…5` hechos de `color-mix` de tinta sobre papel (sin hex), con su oscuro en `tema.css` | un token nuevo pasa por `lib/tema-tokens.test.ts` y viaja a Dynamic si una receta lo usa | ΔE entre pasos ≥ 8; 3:1 del paso más claro contra papel o etiqueta |
