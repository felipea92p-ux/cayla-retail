# ADR-0357 · Análisis v4: cuatro preguntas, cada una con su gráfico y su botón

- **Fecha:** 2026-10-06 · **Estado:** aprobado por Felipe (la maqueta y las decisiones de abajo, 2026-10-06). Se construye por actividades en la
  rama `claude/erp-analysis-module-design-c1a525`; la actividad 1 (la pantalla, las cuatro pestañas y «Todavía no») es el commit `6eaddd63`.
  **Cuatro migraciones, ninguna en producción** (ver «Migraciones»).
- **Número:** nació como 0356; `main` ya tenía un ADR-0356 (`/chaos`, commit `9c8fd0ac`) y este pasó al 0357, cambiando solo las citas de
  Análisis.
- **Pedido:** Felipe, 2026-10-06, sobre `/inventario/resumen`: que se entienda por la forma y no leyendo («faltan gráficos, mucho texto»), sin
  Comparar («quita Comparar») y con cada alerta junto a su acción.
- **Maqueta aprobada:** artifact privado https://claude.ai/artifact/TBSFBD1nikBu8FeShiKMMp. Las piezas se eligieron en una galería de opciones
  (https://claude.ai/artifact/UYrVNfGRuwaXJD4fLofQPt). **No se copia a `docs/maquetas/`:** trae cifras reales de producción y el repo es público.
  Su cajón «Por qué así» guarda la tabla de gráficos, la prueba ciega y lo que se tomó del estudio.
- **Reemplaza en esta pantalla:** ADR-0138 (Desempeño y Comparar períodos), ADR-0277 (Comparar con la tarjeta «Período analizado») y la forma de
  ADR-0245 (cifras, «Qué hacer», tabla por prenda). De ADR-0245 queda su principio: cada botón abre el flujo que ya existe con las prendas marcadas,
  y «Pedir a otra tienda» (ADR-0242 D-7).
- **Enmienda:** ADR-0328, que dejaba el costo y el margen por prenda solo al líder dentro de Análisis (su nota del 2026-10-06).
- **Usa:** ADR-0346 (cuándo puede hablar el motor), ADR-0231 (sin cantidades sugeridas), ADR-0161 (un botón a una pantalla que no ves no se dibuja),
  ADR-0136 (movimiento; la excepción es su «Actualización 2026-10-06 (b)»), ADR-0333 (la prenda sin foto), ADR-0169 y ADR-0336 (solo tokens; el
  oscuro llega solo), ADR-0149 (el buscador no abre el loader), ADR-0349 (Plan de campaña), R-19 a R-22 de `docs/datos/15-COMO-OPERA-CAYLA.md`.

## El problema

**El Análisis viejo era tablas y períodos.** Desempeño medía cómo se comportó el inventario en un período (vendido, rotación valorizada,
sell-through, tendencia). Comparar ponía un período A contra uno B, con cuatro cifras y una dona. Respondía la pregunta de un analista, con sus
palabras. Quien atiende tenía que leer una tabla de muchas columnas para encontrar qué hacer hoy. ADR-0245 lo acercó a la tienda, pero seguía
siendo una tabla con un período arriba.

**Lo que hacen otros.** Felipe trajo un estudio sobre los indicadores de inventario de las cadenas de moda: un puntaje de salud de 0 a 100, GMROI,
semanas de cobertura, antigüedad, venta perdida, cantidad sugerida y «aprobar con un clic». Se tomó lo que le sirve a una tienda de CAYLA y se
tradujo a su idioma (abajo, «Lo que se tomó del estudio»).

**La prueba ciega.** Cada pieza se dibujó en varias versiones, con pocas y con muchas prendas. Dos lectoras simuladas por IA calificaron del 1 al
5 cuán clara era cada una: Ana, 19 años, en su primer día; y Rosa, 45 años, encargada.

| Pieza | La que ganó | Ana | Rosa | Las que perdieron (Ana · Rosa) |
|---|---|---|---|---|
| ¿Qué se acaba? | Lista de 5 prendas | 5 | 5 | Vitrina con sello 4 · 4, perchero 4 · 4, barras 3 · 2 |
| ¿Qué no se mueve? | Lista de 5 prendas | 5 | 5 | Línea de tiempo 4 · 4, perchero 4 · 3, barras de días 3 · 3 |
| Qué hacer hoy | Flujo corregido | 4 | 4 | Mosaico de tareas 5 · 5, barras de ida y vuelta 4 · 3, el flujo como estaba 2 · 2 |

- En «Qué hacer hoy» el mosaico sacó más, pero Felipe eligió el flujo («no quites el gráfico»). Cuando la prueba y su criterio chocan, decide él.
- En la ronda anterior, las formas abstractas (baterías de días, enjambre de puntos) sacaron 1 y 2. Un nombre de prenda se entiende; una forma, no.
- Son lectoras simuladas, no personas: falta la prueba con una colaboradora real.

**Los datos todavía no alcanzan.** Al 6 de octubre ninguna tienda cumple las tres condiciones del motor de demanda (ADR-0346). Recomendar sobre
ventas sin su prenda es recomendar ruido.

## Decisiones (Felipe, 2026-10-06)

**1. Análisis responde cuatro preguntas, una por pestaña: Hoy · Se está acabando · No se vende · Qué pedir.** Comparar períodos sale del módulo:
ADR-0138 y ADR-0277 quedan reemplazados en esta pantalla, y sus componentes se borraron en la actividad 1. La ruta sigue siendo
`/inventario/resumen`.
- **Hoy:** cuatro tarjetas. «¿Qué se acaba?» y «¿Qué no se mueve?» muestran las 5 prendas más urgentes y «Ver las N prendas». «¿Se vende lo que
  llega?» son 10 perchas con la meta. «¿Qué pedir?» compara lo que se vende con lo que tienes, por tipo. Debajo, «Qué hacer hoy» («Por tienda», con
  las tres, salió el 2026-10-06: decisión 3): un flujo de prendas, con lo que hay que comprar a la izquierda y lo que sale o se rebaja a la derecha. Tocar un camino lleva a su
  grupo. Al pie, «Repón el piso». En una pantalla angosta, el flujo se vuelve una lista.
  - **Actualización (Felipe, 2026-10-07): cintas finas.** El flujo se veía «muy brusco»: con un solo camino de 49 prendas, la cinta llenaba
    todo el alto y terminaba en un bloque negro. De cuatro propuestas eligió A1: el grosor de cada camino crece como la raíz de sus prendas,
    con tope (`grosorCamino`: s·√n, s ≤ 8; 49 prendas miden 56 de alto y 3 se siguen viendo); cada cinta aparece de a poco con un degradado;
    «Tu tienda» es una tarjeta clara; la etiqueta «N prendas» es clara, del color de su camino y sin «empieza aquí»; un punto chico reemplaza
    la barra de cada extremo, y los puntos que corren al pasar el mouse son más chicos.
- **Se está acabando:** el carril «Cuántos días te quedan», al ritmo de 30 días y hasta 2 semanas, con el grupo «Cómpralas».
- **No se vende:** cuántas prendas están quietas y cuánto costaron, cuántas ventas llevaron rebaja, la edad de lo que hay en cada tienda y el
  carril «Días sin venderse» con tres grupos: «Mándalas a donde sí se venden», «Liquidar» y «Vigílalas».
- **Qué pedir:** las semanas que faltan para Navidad con el Plan de campaña, lo que se vende contra lo que tienes por tipo (tocar un tipo filtra),
  las tallas que se llevan, lo que más se vende y lo que más rinde.
- *Por qué:* quien atiende llega con una pregunta, no con un período; comparar períodos es pregunta de dueño, y si el líder la extraña, vuelve en
  CAYLA Global.

**2. Análisis se calla con la regla del motor de demanda (ADR-0346).** Sin las tres condiciones, cada pestaña dice «Todavía no» y qué falta. Las
condiciones: 14 días seguidos con al menos 90 de cada 100 ventas con su prenda, el piso cuadrado y el almacén contado.
- Cada condición que falta trae su botón: «Registrar» (Por regularizar), «Cuadrar» (Cuadrar el piso) y «Contar» (Conteo). Cada uno sale solo si
  la cuenta ve esa pantalla.
- La pestaña Hoy muestra además lo que sí se sabe (las tres tiendas con su anillo salieron el 2026-10-06: decisión 3). El chip «Datos incompletos / Datos confiables» abre una hoja
  con los tres anillos y la racha.
- Para ver la pantalla completa en desarrollo existe `ANALISIS_SIN_CANDADO=1` (en `.env.local`). Fuera de producción salta el candado; en
  producción no existe (`lib/analisis-datos.ts`).
- *Por qué:* una sola vara para Análisis, CAYLA Global y Tareas, y nunca una recomendación sobre ventas sin su prenda.
- **Actualización (Felipe, 2026-10-06, al verlo con los datos de producción):** ninguna tienda cumple y la pantalla solo decía «Todavía no».
  «Todavía no» sigue siendo lo primero, pero un botón **«Ver con los datos de hoy»** (bajo los anillos, en cada pestaña y en la hoja «Datos
  incompletos») muestra la pantalla completa con un **aviso fijo** que dice lo PRIMERO que le falta a la tienda, en el orden de «Todavía no»
  y con su misma cifra («Solo N de cada 100 ventas tienen su prenda», «Llevas N de 14 días cobrando con la prenda», «Falta cuadrar el piso» o
  «Falta contar el almacén»), y cierra con «estas cifras pueden fallar»; «Ver qué falta» vuelve a la lista completa. Lo ve quien ve Análisis;
  queda en la URL (`?datos=hoy`). *Lo que se paga:* con pocas ventas con su prenda, «Se está acabando» puede quedarse corto y «No se vende»
  puede marcar como quieta una prenda que sí se vendió sin registrarla; por eso el aviso no se puede cerrar. Lógica en `lib/analisis-aviso.ts`
  (la primera versión hablaba siempre de las ventas, y en una tienda que solo debía cuadrar el piso decía «No hubo ventas en los últimos 14
  días»).
- **Actualización 2 (Felipe, 2026-10-06, noche, al verla en producción): «Debería mostrar esta pantalla por defecto».** Mientras la tienda no
  cumple, Análisis **abre con los datos de hoy** y el aviso fijo de arriba. «Ver qué falta» lleva a «Todavía no» (en Hoy, donde están las tres
  condiciones), que lleva arriba el mismo aviso —«Esto es lo que falta para que estas cifras no fallen»— con «Ver con los datos de hoy» para
  volver; los botones que había dentro de «Todavía no» se fueron, porque el camino vive en el aviso. La URL pasa a `?ver=falta` (reemplaza a
  `?datos=hoy`). Con esto, Análisis ya no se calla por defecto: la regla de ADR-0346 sigue diciendo si las cifras son confiables (el chip y el
  aviso), pero ya no decide si se ven. *Lo que se paga:* la primera vista ya recomienda con cifras que pueden fallar; por eso el aviso no se
  cierra y nombra lo primero que falta. Lógica en `modoAnalisis` (`lib/analisis-aviso.ts`).

**3. La encargada y el líder ven lo mismo:** las tres tiendas, el dinero, lo que más rinde, el costo por prenda y «Liquidar desde». En estas vistas
no hay `esLider`.
- Enmienda ADR-0328, que dejaba el costo por prenda solo al líder.
- La migración `20261006213000` abre la lectura del motor (`fn_motor_demanda_preparacion`) de las tres tiendas a quien puede analizar
  (`fn_puede_analizar`), y `fn_analisis_sede` (`20261006214000`) le da las prendas de cada tienda, con su precio y su costo, sin pedirle que
  opere esa sede.
- No cambia el dinero de Compras (ADR-0126): «Comprar» a un proveedor de terceros y «Plan de campaña» se dibujan solo para quien ve Compras con su
  dinero. Y un botón a una pantalla que la cuenta no ve sigue sin dibujarse (ADR-0161).
- **Actualización (Felipe, 2026-10-06, noche): Análisis es SOLO de la tienda elegida arriba.** Las cuatro tarjetas de Hoy, «Qué hacer hoy» y
  las pestañas Se está acabando, No se vende y Qué pedir hablan de esa tienda; **la comparación de las tres tiendas vive en CAYLA Global**
  (ADR-0275), no aquí. Salieron «Por tienda» de Hoy, los anillos de cada tienda en «Todavía no» y las barras de edad de las tres en «No se
  vende», que quedó como «Lo que tienes, por tiempo sin venderse», solo de la tienda. Las otras tiendas siguen saliendo solo donde hay algo que
  hacer con una prenda de la tuya: «AQP tiene 3 · o pedir a Arequipa», «Mándalas a donde sí se venden» y «Dónde hay» en la ficha. Lo demás de
  esta decisión no cambia: la encargada y el líder ven lo mismo (el dinero, el costo por prenda, «Liquidar desde»).
- *Por qué:* Análisis y Frescura «ayudan a plantear estrategias de equipo sin importar el rango» (Felipe, ADR-0328), y quien decide comprar,
  mandar o liquidar no decide bien sin ver el costo ni las otras tiendas.

**4. Pedir a otra tienda o comprar lo decide la persona.** Todo lo que se acaba aparece para comprar, con su proveedor a la vista: «Proveedor
taller» o «Proveedor terceros».
- «Comprar» abre una orden de Producción con el modelo ya elegido (`/produccion/ordenes?nueva=`) o una compra nueva con su proveedor
  (`/compras/nueva?prov=`).
- Si otra tienda la tiene, en cualquier cantidad, la fila dice «AQP tiene 3» y suma «o pedir a Arequipa». Ese botón abre «Pedir a otra tienda» con
  la prenda marcada (`pedir_a_otra_sede`, ADR-0242 D-7).
- Cuánto vende cada tienda está en la ficha, en «Dónde hay».
- No hay regla automática. Análisis no usa `cedibleDe` ni `planDeReposicion` (`lib/resumen-reglas.ts`).
- *Por qué:* con tres tiendas y pocos datos, una regla de «cuánto le sobra a la otra» se equivocaría; la persona conoce las dos tiendas.

**5. Un solo grupo «Liquidar», sin oferta y remate aparte.** «Liquidar desde» se mueve en «No se vende», de 30 a 85 días (60 de fábrica);
desde el 2026-10-07, de 1 a 999 y con una caja con − y + (actualización 2, abajo).
- Las prendas cambian de grupo mientras se mueve. Para guardarlo, una hoja (`HojaLiquidarDesde`) muestra qué cambia en tu tienda y lo guarda
  («Guardar para todos») firmado por el responsable del combo: uno para todas las tiendas y todas las personas (migración `20261006216000`).
- **Actualización (Felipe, 2026-10-07):** «Liquidar desde» está a la vista siempre, también cuando todo se mueve. Antes, sin ninguna prenda con
  más de un mes sin venderse, la pestaña solo decía «Todo se mueve» y escondía el control, las cifras y la edad de la ropa: en TRU no había
  dónde cambiar los 60 días. Ahora «Todo se mueve» queda dentro de la tarjeta «Días sin venderse», bajo el control; y la barra de edad no
  dibuja un tramo sin unidades (una franja roja de «Más de 3 meses» con 0 prendas contradecía el «Todo se mueve»).
- **Actualización 2 (Felipe, 2026-10-07): sin tope y sin barra.** «No debería existir un tope, se debe poder colocar los días que se quiera.»
  De cuatro formas eligió B1: una caja con el número entre − y + (cada toque, 5 días; las flechas ↑ ↓, uno), donde se escribe cualquier
  número de **1 a 999** (0 sería liquidar todo lo que no se vendió hoy). Lo que no sirve se dice bajo la caja y no cambia el carril. La base
  acepta lo mismo (migración `20261007100000`, pegada en producción por Felipe el 2026-10-07). Si pasa de 4 meses, el carril se alarga hasta
  un mes justo con aire detrás de la marca (`finDelEje`), y «3 meses» se calla si pisaría a «Liquidar». *Lo que se paga:* con menos de 30
  días, «Vigílalas» queda vacío y entra a «Liquidar» también lo que llegó hace poco y todavía no se vendió; con muchos días, casi nada se
  liquida.
- Vive en su propia tabla, `retail.parametros_analisis` (una fila), y no en `configuracion_empresa`: esa fila fiscal exige RUC y razón social y
  no existe en local ni en el CI, toda venta la lee (una columna nueva obligaría a partir la migración por los bloqueos) y deja lugar para los
  próximos números de Análisis. Lo mueve quien ve Análisis (`fn_puede_analizar`), como decidió Felipe («para todos»), y queda el antes y el
  después en `configuracion_historial` (`que = 'liquidar_desde'`).
- En rojo, lo de más de 3 meses (90 días).
- Lo quieto desde un mes pero bajo el umbral va a «Vigílalas», sin botón (R-20: «pasados 30 días sin venderse ya es mala señal»).
- Lo quieto desde el umbral va a «Mándalas a donde sí se venden» si otra tienda vendió 2 o más en 30 días; si no, a «Liquidar». «Enviar a
  Arequipa» abre un traslado nuevo con esas prendas y el destino elegido.
- Cuánto rebajar se elige en Etiquetas.
- *Por qué:* oferta y remate se confundían, y lo que los separa (cuánto rebajar) se decide en Etiquetas; un umbral para todos hace que las tres
  tiendas midan con la misma vara.

**6. «Por llegar» suma todo lo que viene en camino a la tienda, venga de donde venga:** una compra, el almacén, el Taller u otra tienda (migración
`20261006215000`).
- La píldora «Por llegar N» dice de dónde viene cada parte y cuándo llega.
- Cuenta lo que ya está en camino de verdad: un traslado que salió hacia la tienda (desde el almacén, el Taller u otra tienda) y lo que una
  compra le repartió a la tienda y falta recibir. Una orden del Taller cuenta recién cuando sale como traslado: mientras se cose no dice a qué
  tienda irá, y adivinarlo sería prometer prendas que nadie mandó.
- En «Se está acabando», los filtros Todos · Comprar · Por llegar separan lo que ya viene de lo que falta pedir. No es una regla nueva: el botón
  sigue siendo «Comprar».
- *Por qué:* sin eso, la tienda vuelve a pedir lo que ya viene en camino.

**7. Se calla la cantidad.** Análisis no sugiere cuántas (ADR-0231). Cada botón abre el flujo que ya existe con las prendas marcadas (ADR-0245), y
ahí se elige cuántas, a quién y a qué precio.
- Análisis no guarda nada por su cuenta, salvo «Liquidar desde». Los destinos viven en `lib/analisis-acciones.ts`.
- «Enviar», «Pedir» y «Reponer» abren con **una de cada una**: es la forma de no sugerir cantidad; cuántas, se elige en el traslado, el pedido o
  la bajada.
- Dos huecos de hoy, que quedan como pendientes:
  - **Compras no recibe prendas por URL:** «Comprar» abre la compra con su proveedor (`?prov=`), sin las prendas.
  - **Etiquetas no recibe la rebaja:** «Liquidar» abre las etiquetas de esas prendas con el precio de hoy.
- *Por qué:* la cantidad la decide quien pide (ADR-0231); una cifra sugerida sobre pocos datos se copia sin pensar.

**8. La ficha de la prenda es un `<Modal>` (ADR-0136), no la hoja lateral de la maqueta.** Su contenido es el de la maqueta, en tarjetitas de datos
y sin párrafos:
- lo que le pasa: días que le quedan o días quieta, cuántas vendiste, de dónde viene, cuántas por llegar y qué tienda la tiene;
- sus ventas por semana;
- «Dónde hay» en las tres tiendas: cuántas tiene y cuántas vendió en 30 días;
- todo el modelo en tu tienda, por talla y color;
- el dinero: cuánto costó cada una y cuánto ganas por cada una;
- sus botones.
- *Por qué:* un `<Modal>` trae la entrada, el foco, el Escape y el celular del sistema; y Felipe pidió datos de un vistazo, no texto.

**9. Meta de «se vende lo que llega»: 6 de cada 10 en 30 días.** De lo que llegó a la tienda en 30 días, cuántas se vendieron, contado de a 10:
10 perchas con la línea de la meta. Vive en el código (`META_SE_VENDE_LO_QUE_LLEGA`, `lib/analisis-reglas.ts`).
- *Por qué:* sin meta, «7 de 10» no dice si es bueno; 6 alcanza hasta que CAYLA tenga una temporada propia con qué compararse.

**10. Movimiento: excepción de ADR-0136 para Análisis** (su «Actualización 2026-10-06 (b)»). Las piezas entran en cascada, las barras crecen, las
perchas y los puntos asoman, los arcos se dibujan, las cintas del flujo corren y las cifras cuentan. Pasa **una vez al entrar a la pestaña**, sin
rebote ni bucle, y nada se mueve con `prefers-reduced-motion`. Lo vigila `lib/analisis-movimiento.test.ts`.
- *Por qué:* Felipe aprobó la maqueta con su movimiento; un gráfico que se arma se lee, y una sola vez no distrae.
- Felipe pidió además (2026-10-06, después de verlo): al pasar el mouse por un camino de «Qué hacer hoy», puntos que corren por su cinta hacia
  la tienda o desde ella. Es la única pieza que se repite, y solo con el mouse o el foco encima; con «reducir movimiento» no se dibuja.

**11. «Lo que más rinde»: por cada S/ 1 que tienes en ropa de un tipo, cuánto ganaste en 90 días.** La ganancia es la venta neta sin IGV (18 %)
menos el costo de lo vendido; lo que hay en ropa es el stock promedio al costo (no el del cierre: un tipo agotado daría una división por cero). Sale
de `fn_resumen_comparacion_json` con los últimos 90 días de la tienda, sin migración; la cuenta es pura (`rindePorCategoria`, `lib/analisis-pedir.ts`).
- Un tipo entra solo si la tienda ya tenía ropa de ese tipo hace 90 días; si no, la cuenta sale inflada. Con la carga inicial de setiembre,
  producción dirá «Todavía no hay 90 días de ventas con su costo para medirlo» hasta mediados de diciembre de 2026.
- Las prendas sin costo no cuentan; una venta que no guardó su costo se cuenta con el costo de hoy de esa prenda (aproximación).
- *Por qué:* es el GMROI del estudio dicho en soles de tienda; con un punto y una línea punteada en S/ 1 se ve qué tipo conviene comprar menos.

**12. «Días sin venderse»: desde la última venta en esa tienda o, si nunca se vendió allí, desde que llegó a esa tienda** (`fn_analisis_sede`). «Lo
que llegó» usa el mismo predicado que Frescura (`fn_es_llegada`), así que cuenta la carga inicial como llegada.
- *Por qué:* es lo que se puede afirmar con el libro de movimientos; la carga inicial no tiene edad real (por eso no se habla de «antigüedad»).

**11. Lo que nunca salió al piso, «¿Qué pedir?» contra Navidad y el ritmo con los días que hay (Felipe, 2026-10-07, al ver Hoy
con los datos de TRU).** Tres problemas de la misma raíz: Análisis contaba lo guardado como si estuviera a la vista y decía «30 días» sin decir
de qué días hablaba. Elegido mirando la página «Piso y qué pedir» (artifact privado, con cifras reales de TRU; no va al repo):

- **«¿Se vende lo que llega?» sale de Hoy** (contaba como «llegó y no se vendió» lo que nunca se colgó: en TRU decía 1 de 10). La reemplaza
  **«¿Qué no ha salido al piso?»**, una lista de las 5 que más días llevan guardadas (A1), y **una pestaña propia, «Nunca salió al piso»**,
  entre «No se vende» y «Qué pedir» (pedido de Felipe: «una sección más, con un nombre que haga referencia a que nunca salió a piso»):
  cifras de la tienda, dónde está lo que tienes (en el piso · guardado que ya salió · guardado que nunca salió) y el carril «Días en el
  almacén» por tipo de prenda, **empezando por el tipo que más se vende**, con «Bájalas al piso» por tipo y «Bajar» por prenda (Reponer a
  piso) y «Ver N más» (tres por tipo). Una prenda **nunca salió al piso** si tiene unidades en el almacén de la tienda y ningún movimiento la
  tuvo en un piso de venta de esa tienda, ni se vendió ahí (`fn_analisis_sede.salio_al_piso` NULL, migración `20261007120000`).
- **«No se vende» cuenta desde el piso (C):** los días son desde la última venta o desde que salió al piso; lo que nunca salió no cuenta ahí
  (en TRU, el 7 de octubre con «Liquidar desde 5 días»: 429 quietas, 318 nunca habían salido; contando desde el piso quedan 28). La ficha de
  lo que nunca salió dice «Nunca salió al piso», sus días en el almacén y «Bajar al piso», en vez de «Va bien».
- **«¿Qué pedir?» deja el «de cada 100» (B2):** la tarjeta de Hoy y la pestaña dicen, por tipo, para cuánto te alcanza lo que tienes al ritmo
  de lo vendido, contra las semanas que faltan para Navidad; lo que no llega va con su ▲. La tabla dice cuánto de lo que tienes nunca salió al
  piso (antes de pedir, bájalo) y filtra tallas y ranking como la mariposa. Las tallas siguen comparando partes (el alto de las barras), pero
  lo que se lee son unidades, con sus días en la leyenda.
- **El ritmo con los días que hay (decisión 4 de la página):** lo vendido se divide entre los días de ventas que la tienda tiene en el ERP,
  hasta 30 (`diasDeVentas`, desde su primera venta), no siempre entre 30. TRU vendía en el ERP desde el 30 de setiembre: con 8 días, dividir
  entre 30 hacía durar cada prenda casi 4 veces más y «Se está acabando» perdía lo que se acaba en 4 a 14 días (en TRU, de 49 a 74). Cada
  texto dice sus días («Al ritmo de los últimos 8 días», «Vendiste 7 en 8 días»).

**12. Análisis mide por MODELO, no por talla de un color (Felipe, 2026-10-10).** «Si una prenda fue presentada, pero alguna variante no fue
pasada al piso, indica que se acaba o que no se mueve; no debería manejarse así.» El problema era la pieza: Análisis medía cada talla de cada
color sola, y con 1 a 3 unidades por talla el mismo modelo colgado salía a la vez como «Se agotó, cómprala» (la S vendida) y «Nunca salió al
piso» (la L guardada). Medido en TRU el 10 de octubre (solo lectura): de 424 tallas «que nunca salieron», 140 eran de un modelo ya colgado (39
del mismo color, 101 de otro); de 159 que «se acababan», en 87 el modelo entero duraba más de dos semanas, y 132 entraban con una sola venta en
11 días. Felipe eligió el **modelo entero** —«si dice Chaleco Cecia, incluye todas las tallas y todos los colores»— frente a modelo y color
(que yo recomendaba) y frente a dejarlo por talla, **en las cuatro pestañas** (y por arrastre en Hoy); y que el detalle del modelo diga **qué
tallas y qué colores salen más**.

- **Cómo:** la base sigue entregando una fila por talla y color (`fn_analisis_sede`); `lib/analisis-modelo.ts` las junta por `productoId` en
  una fila con la misma forma de una prenda (`ModeloAnalisis`), y las reglas de siempre (`seEstaAcabando`, `grupoDe`, `nuncaSalio`) la miden
  sin cambiar. Se suma lo que se cuenta (stock, ventas, semanas, otras tiendas, lo que viene); salió al piso la primera vez que se colgó
  cualquiera; **los días sin venderse cuentan desde su última venta o desde que el modelo salió, y colgar otra talla después no reinicia la
  cuenta**. Para eso la base dice la última venta de cada talla (`ultima_venta`, migración `20261010120000`).
- **Lo que sigue siendo por talla:** la curva de tallas de «Qué pedir» (`datos.tallas`), la grilla «Todo el modelo en tu tienda», el dinero de
  las cifras (cada talla con su costo y su precio, nunca el promedio) y lo que se hace con el modelo: Bajar, Mandar, Liquidar y Pedir se llevan
  todas sus tallas (Bajar, solo las guardadas).
- **Cómo se ve:** cada fila dice sus colores y tallas («2 colores · S, M, L»); «Se está acabando» dice qué talla falta («Falta L Beige»); el
  detalle suma «Lo que más sale» (tallas y colores, de lo más vendido a lo menos, con lo que tienes); los textos cuentan modelos. «Nunca salió al
  piso» pierde la cifra «son de un modelo que ya está en el piso»: por definición ya no puede pasar.
- **Lo que se paga:** un color que nadie vio, guardado mientras cuelga otro color del mismo modelo, ya no sale en «Nunca salió al piso»; y
  «Repón el piso» de Hoy deja de avisar de una talla vacía en el piso si el modelo tiene otra colgada (Existencias y Frescura la siguen viendo).
- **Sin la migración** (`ultima_venta` ausente), los días del modelo se cuentan con lo más reciente de sus tallas y se dice una vez arriba
  (`FALLA_ULTIMA_VENTA`): casi siempre da lo mismo; difiere si se colgó una talla después de la última venta.

**12 (b). El detalle del modelo y «Qué pedir», elegidos mirando (Felipe, 2026-10-10, noche).**

- **El detalle del modelo, opción B** (lámina privada `4mRrK4dotpJUnDg5tis9u2`, siete propuestas): «Dónde hay», «Lo que más sale» y la
  grilla talla × color decían los mismos números tres veces, con dos ventanas de días («30» y «11» para la misma cifra) y «0» rayados en
  rojo que había que adivinar. Ahora: una frase («Vendiste 10 en 11 días y te queda 1»), UNA tabla donde cada celda dice qué pasó («2
  vendidas · no queda», «queda 1 · sin ventas», «no hay»), con totales y **los colores que más se venden arriba**, y las otras tiendas en
  una línea (con «sus últimos 30 días», para no mezclarlos con los de la tuya). Lo agotado va en ámbar: es una tarea, no un error.
  `lib/analisis-ficha.ts` (`fraseDelModelo`, `tablaDelModelo`, `lineaOtrasTiendas`).
- **«Qué pedir», opción A** (lámina privada `CGrMNmo8b9Z1SKMe16axBs`, cuatro propuestas): no se notaba que la lista seguía ni que tocar un
  tipo filtraba lo de abajo (quedaba fuera de la vista). Ahora la lista va a la izquierda (se desplaza por dentro y dice «↓ N tipos más») y
  a la derecha, fijo, el panel del tipo elegido o de toda la tienda: una frase, las tallas y lo que más se vende. En una columna, tocar un
  tipo lleva la vista al panel. **«Lo que más se vende» muestra 5 por defecto y se elige Top 10, 15 o 20** (pedido de Felipe); solo se
  ofrecen los que tienen modelos para llenarse. `lib/analisis-pedir.ts` (`TOPS`, `topsPosibles`, `fraseDelTipo`).

## Lo que se tomó del estudio

| Del estudio | En CAYLA | Por qué |
|---|---|---|
| Talla × color como pieza principal | ~~La prenda es una talla de un color~~ — **reemplazado por la decisión 12 (2026-10-10):** la pieza es el modelo; la talla y el color, en su detalle | Con 1 a 3 unidades por talla, la talla sola decía «cómprala» y «nunca salió» del mismo modelo colgado |
| Cada alerta con su acción | Cada grupo y cada fila con su botón | Una alerta sin salida es ruido |
| Venta perdida | «Te pidieron y no había», **anotada**, no estimada | Estimarla con pocos datos es inventarla |
| Confianza del dato a la vista | El chip «Datos confiables / incompletos» y «Todavía no» | Decisión 2 |
| Meta junto a la cifra | «6 de 10» en las perchas | Decisión 9 |
| La temporada en pantalla | Semanas para Navidad y Plan de campaña | Diciembre triplica un mes promedio (R-19) |
| Comparación por tienda para el líder | En CAYLA Global, no en Análisis (Felipe, 2026-10-06) | Decisión 3 |
| Puntaje de salud de 0 a 100 | Cuatro gráficos, uno por pregunta | Sus pesos son inventados y con pocas ventas salta |
| GMROI | «Lo que más rinde: por cada S/ 1 en ropa, ganaste S/ …» | La idea sirve; la sigla, no |
| Semanas de cobertura | Días que te quedan | En tienda se cuenta en días |
| Antigüedad | Días sin venderse | La carga inicial no tiene edad real |
| Cantidad sugerida | No | Decisión 7 (ADR-0231) |
| Aprobar con un clic | Abre el flujo existente con las prendas marcadas | Decisión 7 (ADR-0245) |

«Costaron S/ …» en «No se vende» es la cifra de R-22 («se pierde más dinero estancando que perdiendo margen»). «Mándalas» y «Liquidar» son las
salidas de R-21.

## Lo que se descartó

- **El puntaje de salud de 0 a 100:** sus pesos son inventados, con pocas ventas salta, y no dice qué hacer.
- **GMROI con su nombre técnico:** queda la idea en palabras de tienda («Lo que más rinde»).
- **Comparar períodos:** sale del módulo (decisión 1).
- **La cantidad sugerida:** ADR-0231 (decisión 7).
- **Oferta y remate como grupos aparte** (decisión 5) y **una regla automática para pedir a otra tienda** (decisión 4).
- **Las formas que la prueba ciega no entendió:** baterías de días, enjambre de puntos y barras (de 1 a 3 sobre 5).
- **«Tallas que faltan» y «Te pidieron y no había» dentro de «Se está acabando»:** Felipe los quitó. El modelo entero está en la ficha, y lo que
  pidieron y no había se ve en «Todavía no» y en Pedidos no atendidos.
- **La hoja lateral de la maqueta** (decisión 8).
- **Para después:** un copiloto en lenguaje natural; los canales online (no están integrados); un simulador de rebajas; el presupuesto de compra
  (vive en Plan de campaña, ADR-0349); y el punto de reorden (no hay plazos de reposición guardados).

## Migraciones

Todas llevan el prefijo `retail.` y **ninguna está en producción**; las cuatro están aplicadas en la base local. Se pegan en este orden, cada
una con el OK de Felipe, antes de publicar la web:

| Migración | Qué hace |
|---|---|
| `20261006213000_analisis_preparacion_tres_tiendas.sql` | `fn_motor_demanda_preparacion` da las tres tiendas a quien puede analizar, no solo a quien ve CAYLA Global. El cálculo es el de `20261005223000`, sin cambios. Es un `create or replace` con su comentario y sus permisos, sin políticas: se puede pegar dos veces. |
| `20261006214000_analisis_prendas_de_sede.sql` | `fn_analisis_sede(p_ubicacion_id)`: las prendas de una tienda en un jsonb, una llamada por tienda. Lo libre en piso y almacén, lo vendido en 30 días y por semana, los días sin venderse, lo que llegó y cuánto de eso se vendió, precio, costo, origen, categoría y color; y cuántas ventas llevaron rebaja. Pide una cuenta de retail y Análisis (`fn_puede_analizar`), **no** operar la sede (decisión 3). Un `create or replace`, sin políticas: se pega en una sola parte. Prueba: `scripts/pruebas/analisis_lecturas.mjs`. |
| `20261006215000_analisis_por_llegar.sql` | `fn_analisis_por_llegar(p_ubicacion_id)`: lo que viene en camino a una tienda, por prenda: de dónde (compra, almacén, Taller u otra tienda), cuántas y cuándo se espera, sin dinero (decisión 6). Las mismas dos puertas que `fn_analisis_sede`. Un `create or replace`, sin políticas: una sola parte. Prueba: `scripts/pruebas/analisis_lecturas.mjs`. |
| `20261007100000_analisis_liquidar_desde_sin_tope.sql` | «Liquidar desde» sin tope: el check de `parametros_analisis` y `guardar_liquidar_desde` aceptan de 1 a 999 días (antes 30 a 85). Un `alter` de una tabla que solo leen las funciones de Análisis y el reemplazo de una función con la misma firma: una sola ejecución. Pegada en producción el 2026-10-07 (actualización 2 de la decisión 5). |
| `20261007120000_analisis_salio_al_piso.sql` | `fn_analisis_sede` devuelve `salio_al_piso` (la primera vez en un piso de venta de la tienda, o su primera venta; NULL si nunca salió) y `llego` (la primera entrada), y `dias_sin_vender` cuenta desde el piso (NULL si nunca salió). Mismo cuerpo de `20261006214000` (huella verificada contra producción) con esos cambios: un `create or replace` con la misma firma, sin políticas ni `alter`, una sola parte. **Pegada en producción el 2026-10-07** (antes de fusionar la web; huella verificada). Sin ella, la pestaña diría que todavía no lo puede saber. Prueba: `scripts/pruebas/analisis_lecturas.mjs` (casos F3, D1, D2 y D3). Decisión 11. |
| `20261010120000_analisis_ultima_venta.sql` | `fn_analisis_sede` suma `ultima_venta` a cada fila (la última venta en la tienda, sin tope; NULL si nunca se vendió): con ella se cuentan los días sin venderse del modelo (decisión 12). Mismo cuerpo de `20261007120000` (huella `874919d9…` verificada contra producción el 2026-10-10) más una clave; huella nueva `15598f29697b4a6229ba3d78d8630d5a`. Un `create or replace` con la misma firma, sin políticas ni `alter`, una sola parte. **Pegada en producción el 2026-10-10** (antes de fusionar la web; huella verificada). Prueba: `scripts/pruebas/analisis_lecturas.mjs` (casos F3, D4 y M1). |
| `20261006216000_analisis_liquidar_desde.sql` | «Liquidar desde»: la tabla `parametros_analisis` (una sola fila, de 30 a 85 días, 60 de fábrica), `fn_liquidar_desde()` (la lee toda cuenta de retail) y `guardar_liquidar_desde(p_dias)` (lo cambia quien ve Análisis, firma con el responsable y deja el antes y el después en `configuracion_historial`). Sin `alter` de tablas en uso ni políticas: una sola ejecución (decisión 5). |

«Lo que más rinde» no necesita migración: lee `fn_resumen_comparacion_json`, la misma del Análisis viejo, con los últimos 90 días de la tienda
(`lib/analisis-rinde.ts`).

Mientras una falte en producción, la pantalla no se cae. Lo que no se pudo leer se dice en una línea arriba («No se pudo leer …») y su sección se
calla (principio 9).

## Cómo se verifica

- **Reglas puras, con su prueba:** `lib/analisis-modelo.test.ts` (el modelo: qué se suma, salió al piso, días sin venderse que no se reinician,
  el caso del chaleco que decía «cómprala» y «nunca salió» a la vez), `lib/analisis-reglas.test.ts` (grupos, días que quedan con los días de ventas de la tienda, umbral, edad),
  `lib/analisis-piso.test.ts` («Nunca salió al piso»: qué entra, el orden por tipo, las cifras, el eje), `lib/analisis-pedir.test.ts` (para
  cuánto alcanza cada tipo contra Navidad),
  `lib/analisis-acciones.test.ts` (a dónde lleva cada botón y que no se dibuje sin acceso), `lib/analisis-armado.test.ts` (el cruce de las tres
  tiendas) y las de cada pestaña.
- **Movimiento:** `lib/analisis-movimiento.test.ts` revisa todas las hojas `app/estilos/analisis*.css`: sin bucle, sin rebote, `--ease-cayla`,
  hasta 1,2 s por pieza, solo tokens y apagado con «reducir movimiento».
- **Los candados de siempre:** `tema-colores`, `sugerir`, `sin-select-nativo`, `reglas-sin-uso` y `guia-de-foco`. La pantalla se declaró
  `no-aplica` (se lee, no se llena) y `PENDIENTES_HOY` bajó de 62 a 61.
- **En el navegador, en local:** sin `ANALISIS_SIN_CANDADO` se ve «Todavía no», lo mismo que verá producción hoy. Con `ANALISIS_SIN_CANDADO=1` se
  ve la pantalla completa con los datos locales.
- **Tema:** `pnpm --filter web tema:auditar -- --cuenta admin --ruta /inventario/resumen --escenarios` (los escenarios `analisis.*` de
  `tema/escenarios/registro.mjs`: cada pestaña y cada hoja).

## Lo que queda abierto

- **Compras recibe prendas por URL** y **Etiquetas recibe la rebaja con las prendas marcadas** (decisión 7).
- **Limpiar el Análisis viejo que quedó en `lib/`**: ver el backlog del día.
- **Probar con una encargada real.** La prueba ciega fue con lectoras simuladas.
- ~~**¿Las tarjetas «Por tienda» cambian de sede al tocarlas?**~~ Ya no aplica: «Por tienda» salió de Análisis (decisión 3, act.).
- **Dos decisiones de la maqueta que no se tomaron:** «Comprar» para quien no ve Compras ni Producción (hoy el botón no se dibuja; la maqueta
  proponía que se vea y llegue como pedido al líder) y «Mandar a Tareas» cuando exista Inventario ▸ Tareas.
- **R-21 dice que lo básico y atemporal se guarda.** La base no marca qué prenda es básica, así que «Liquidar» también la propone.
- **R-20 pide un umbral por categoría** cuando haya 8 semanas de ventas reales. Hoy «Liquidar desde» es uno para todos.
- **`/formidable`** sobre la pantalla (obligatoria, con tablero en `docs/formidable/README.md`).
- **«Comprar todas» cuando lo que se acaba mezcla prendas del Taller y de terceros:** hoy no se dibuja (no hay un solo destino). ¿Dos botones de
  grupo, «Pedir al taller» y «Comprar a terceros»?
- **Días sin venderse tras un agotamiento:** una prenda agotada mucho tiempo y repuesta ayer arrastra esos días y podría salir en «Liquidar» recién
  llegada. ¿Contar solo los días con stock, o empezar en la reposición?
- **Rebaja de 100:** cuentan el descuento de línea y el de toda la venta; el regalo de cumpleaños del club no (ADR-0288 1c). Falta confirmarlo.
- **Origen sin compra ni producción** (casi toda la carga inicial): «Comprar» abre Compras sin proveedor. ¿Usar `productos.proveedor_id` como
  respaldo? En local, los productos propios tienen el proveedor «CAYLA SAC».
- **Una compra agrupada** (una línea sin talla ni color, que se desglosa al recibir, ADR-0035) no se puede atribuir a una prenda y no sale en «Por
  llegar».
- **«¿Qué pedir?» pasada la Navidad:** la meta es siempre la próxima Navidad; el 26 de diciembre queda a 364 días y casi todo «no llegaría».
  ¿Medir contra la próxima campaña del Plan de campaña, o contra un horizonte fijo? Lo decide Felipe antes de diciembre (decisión 11).
- **`llegaron_30` y `vendidas_de_llegadas_30`** ya no los usa nadie («¿Se vende lo que llega?» salió de Hoy, decisión 11): se pueden quitar de
  `fn_analisis_sede` en una migración aparte, cuando la web de hoy ya no los lea.
- **Rendimiento a futuro:** el origen recorre `compra_items` una vez por modelo; un índice `compra_items (producto_id)` lo resuelve. Es tabla de
  Compras: necesita el OK de Felipe.
