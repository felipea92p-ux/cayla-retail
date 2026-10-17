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
- *(Act. 2026-10-16, A8: «con su proveedor a la vista» deja de ser la etiqueta genérica «Proveedor taller / terceros» y pasa a decir a quién por
  su nombre —«Pídelo a Textil Andino»— y de dónde se sabe: la última compra o, sin ninguna, el catálogo. Ver «Actualización 2026-10-16», viñeta A8.
  «Comprar» sigue abriendo lo mismo: a dónde lleva es A9.)*
- *(Act. 2026-10-16, A9, decisión D8 de Felipe: «Comprar» de terceros ya no abre «Registrar factura» (una compra ya hecha) sino una **orden de compra
  nueva** (`/compras/ordenes/nueva`) con el proveedor, la tienda y el modelo, sin cantidades; «Registrar factura» queda solo para quien ve Facturas y no
  Órdenes de compra. Ver «Actualización 2026-10-16», viñeta A9. La decisión 7 sigue intacta.)*

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
- *(Act. 2026-10-16, A3: una llegada ATRASADA —su fecha estimada ya pasó— deja de contar como «viene» y la prenda vuelve a «Comprar»; en «Qué
  pedir» lo que llega DESPUÉS de la meta tampoco suma. Ver «Actualización 2026-10-16», viñeta A3. Es un cambio a esta decisión que el plan
  marca como «requiere el OK de Felipe»: está hecho en la rama y queda por confirmar con él.)*

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
| `20261017043000_analisis_pedido_en_camino.sql` | (2026-10-16, A4) `fn_analisis_pedido_en_camino(p_ubicacion_id)`: lo YA PEDIDO que no llegó, por tipo y marca, sin dinero: órdenes de compra abiertas que llegan directo a la tienda, envíos del proveedor en camino, lo que «No vino» y, de la red, lo por repartir y la producción del Taller en proceso. Las mismas dos puertas que `fn_analisis_por_llegar`; un `create or replace`, sin políticas, una sola parte. **Se pega ANTES de fusionar la web que la llama.** Prueba: `scripts/pruebas/analisis_lecturas.mjs` (casos Y) y `motores_familias_apagadas.mjs` (H). |

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

- ~~**Compras recibe prendas por URL**~~ Hecho el 2026-10-16 (A9): la orden de compra nueva recibe proveedor, tienda y modelos por URL, sin cantidades. **Etiquetas recibe la rebaja con las prendas marcadas** (decisión 7) sigue abierto.
- **Limpiar el Análisis viejo que quedó en `lib/`**: ver el backlog del día.
- **Probar con una encargada real.** La prueba ciega fue con lectoras simuladas.
- ~~**¿Las tarjetas «Por tienda» cambian de sede al tocarlas?**~~ Ya no aplica: «Por tienda» salió de Análisis (decisión 3, act.).
- **Dos decisiones de la maqueta que no se tomaron:** «Comprar» para quien no ve Compras ni Producción (hoy el botón no se dibuja; la maqueta
  proponía que se vea y llegue como pedido al líder) y «Mandar a Tareas» cuando exista Inventario ▸ Tareas.
- **R-21 dice que lo básico y atemporal se guarda.** La base no marca qué prenda es básica, así que «Liquidar» también la propone.
- ~~**R-20 pide un umbral por categoría** cuando haya 8 semanas de ventas reales. Hoy «Liquidar desde» es uno para todos.~~ Hecho el
  2026-10-14 con la vara de Frescura (ver «Actualización 2026-10-14», 3): «Liquidar desde» queda de respaldo.
- **`/formidable`** sobre la pantalla (obligatoria, con tablero en `docs/formidable/README.md`).
- **«Comprar todas» cuando lo que se acaba mezcla prendas del Taller y de terceros:** hoy no se dibuja (no hay un solo destino). ¿Dos botones de
  grupo, «Pedir al taller» y «Comprar a terceros»?
- **Días sin venderse tras un agotamiento:** una prenda agotada mucho tiempo y repuesta ayer arrastra esos días y podría salir en «Liquidar» recién
  llegada. ¿Contar solo los días con stock, o empezar en la reposición?
- **Rebaja de 100:** cuentan el descuento de línea y el de toda la venta; el regalo de cumpleaños del club no (ADR-0288 1c). Falta confirmarlo.
- ~~**Origen sin compra ni producción** (casi toda la carga inicial): «Comprar» abre Compras sin proveedor. ¿Usar `productos.proveedor_id` como
  respaldo? En local, los productos propios tienen el proveedor «CAYLA SAC».~~ Hecho el 2026-10-16 (A8) como texto y agrupación, no como destino
  del botón: ver «Actualización 2026-10-16», viñeta A8. Lo de «CAYLA SAC» sigue abierto (D9).
- **Una compra agrupada** (una línea sin talla ni color, que se desglosa al recibir, ADR-0035) no se puede atribuir a una prenda y no sale en «Por
  llegar».
- **«¿Qué pedir?» pasada la Navidad:** la meta es siempre la próxima Navidad; el 26 de diciembre queda a 364 días y casi todo «no llegaría».
  ¿Medir contra la próxima campaña del Plan de campaña, o contra un horizonte fijo? Lo decide Felipe antes de diciembre (decisión 11).
- **`llegaron_30` y `vendidas_de_llegadas_30`** ya no los usa nadie («¿Se vende lo que llega?» salió de Hoy, decisión 11): se pueden quitar de
  `fn_analisis_sede` en una migración aparte, cuando la web de hoy ya no los lea.
- **Rendimiento a futuro:** el origen recorre `compra_items` una vez por modelo; un índice `compra_items (producto_id)` lo resuelve. Es tabla de
  Compras: necesita el OK de Felipe.

## Actualización 2026-10-14 — Análisis con todas las ventas y contra la vara de su tipo (tareas #1 a #4 de `docs/pantallas/gestion-analisis.md`)

**El problema primero.** El análisis `/pantalla` del 2026-10-14 (con producción leída en vivo) encontró que la pantalla razonaba con el 46 % de
las ventas de TRU (347 de 652 líneas sin prenda; AQP, el 5 %) y con un umbral que la tienda no podía alcanzar: TRU vende en el ERP desde el
30-sep, «Liquidar desde» estaba en 15 y ninguna prenda podía llevar 15 días quieta, así que «¿Qué no se mueve?» decía «Va bien» por aritmética.
Lo que falta tampoco se repartía parejo (de 82 % a 0 % por tipo), así que «Qué pedir» ordenaba por calidad de registro y no por demanda. Las
decisiones de Felipe del 2026-10-12 (memoria de esa sesión; no estaban escritas aquí ni en el código) y sus cuatro respuestas del 2026-10-14:

1. **Lo vendido sin registrar cuenta por tipo.** La venta cobrada con la prenda centinela trae en `prendas_por_regularizar` su categoría, talla y
   color (el 100 % en las dos tiendas). «Qué pedir» la suma a lo vendido de su tipo (pendientes y cerradas sin prenda, en los mismos 30 días de
   `vendidas30`; ritmo en los días de ventas de la tienda, porque no tiene prenda que se haya colgado). Un tipo vendido sin registrar que la
   tienda no tiene en el sistema se nombra aparte («no se sabe para cuánto te alcanza»). Una lectura para Análisis y Frescura:
   `lib/vendido-sin-registrar.ts` (paginada; Frescura la usa con sus 28 días como antes). Sin migración.
2. **Lo que puede haberse vendido sin registrar no se liquida** (Felipe: solo las pendientes, como Frescura, ADR-0208 act. 2026-10-10 (c)).
   Análisis lee la lectura de Frescura de su tienda (`getLecturaFrescuraDeTienda`, la misma cuenta que el Inicio) y toma `dudadas` por talla: un
   modelo quieto con alguna unidad en duda va al grupo nuevo **«Aún no se sabe»** (`duda`), con «Registrar ventas» (Por regularizar), en vez de
   «Liquidar», «Mándalas» o «Vigílalas». Sin el módulo Frescura no se lee (la base lo exige) y se juzga como antes; si falla, se dice.
3. **El ritmo se mide en los días que la prenda estuvo colgada** (2026-10-12), **con piso de 7 días** (2026-10-14: una venta suelta de ayer no
   dice «1 por día») y techo en los días de ventas de la tienda (`ventanaDeRitmo`). El modelo mide desde que se colgó cualquiera de sus tallas;
   «Qué pedir» suma el ritmo de cada prenda en su ventana. Reemplaza la decisión 11 («el ritmo con los días que hay»): aquella dividía entre los
   días de la tienda y lo colgado hace poco «duraba» el doble o el triple.
4. **«Vigílalas» y «Liquidar» contra la vara de su tipo** (2026-10-12; escalones del 2026-10-14): se vigila desde el p75 y se liquida desde el
   p90 de la vara de su categoría en Frescura, con su cascada (`varaQueJuzgo`: la del mes, la de CAYLA, la de hoy). Son «Envejeciendo» y
   «Envejecida»: Análisis y Frescura dicen lo mismo de la misma prenda, y «Vigílalas» (muerto con cualquier «Liquidar desde» ≤ 30) vuelve.
   **Para liquidar, la vara tiene que tener `VENTAS_PARA_JUZGAR_SOLA` (10) ventas**: con 3 ventas rápidas el p90 sale de 2 días y todo lo colgado
   hace 3 parecería para rebajar. Sin esa vara —o sin Frescura— manda **«Liquidar desde», que queda de respaldo** (y «Vigílalas» desde un mes).
   Cada fila del carril pinta su zona desde su propio umbral; la marca «Liquidar» del eje solo sale si todas comparten el día; la ficha dice
   «tardan 9 de cada 10 de su tipo»; una nota dice con qué se mide cada tipo. `lib/analisis-vara.ts`.
5. **Ninguna tarjeta dice «Va bien» cuando no puede saberlo.** Con el aviso de «Datos incompletos», una tarjeta sin nada dice «Para saber» y «Con
   lo registrado, …» (`estadoSinNada`, `conLoRegistrado`). «¿Qué no se mueve?» y la pestaña «No se vende» dicen **«Todavía no se puede saber»**
   mientras ningún modelo con algo en la tienda lleve en el piso lo que se espera para liquidarlo (`puedeJuzgarQuietas`).
6. **«Ver qué falta» registra lo que se puede.** «Registrar N sin prenda» cuenta las **pendientes** (`contarPendientes`), no las de 30 días (en TRU
   decía 347 y Por regularizar mostraba 41: las otras se cerraron sin prenda y no vuelven). Una sola regla para Análisis, Frescura y el Inicio
   (`pasoParaHablar`, que ahora recibe las pendientes). Se dice cuántas se cerraron en los 30 días y desde qué día puede cumplirse la parte de
   las ventas si desde hoy todo se cobra con su prenda (hoy más lo que le falta a la racha de 14 días: `fechaQueSeCumple`).

**Lo que se descartó.** Escalar el ritmo de cada modelo por el % de registro de su tipo (reparte a ciegas ventas que quizás no fueron de ese modelo);
subir «Liquidar desde» a 30 o 45 (medido el 2026-10-12, un número fijo no señala nada: el problema es que sea uno solo); usar la vara de hoy con
pocas ventas para liquidar (dinero sobre ruido); una migración para traer `categoria_id` (el nombre de la categoría es único en la base,
`categorias_nombre_clave_unica`, y Análisis ya agrupa por nombre).

**Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis- lib/frescura-piso` (pruebas nuevas de cada regla); en TRU, después del
deploy: «Qué pedir» muestra «vendiste 22 (14 sin su prenda)» en Faldas y la nombra entre las que no llegan; «¿Qué no se mueve?» dice «Todavía no
se puede saber» hasta que algún modelo cumpla su umbral; «Ver qué falta» dice «Registrar 41 sin prenda» (o las pendientes de ese día).

**Queda abierto.** Probar con una encargada real y pasar `/formidable` y `/chaos` (la hoja «Liquidar desde» sigue siendo la única escritura);
«Qué pedir» contra Navidad fija o contra el Plan de campaña (tarea #5, decide Felipe); la curva de tallas de «Qué pedir» todavía no suma la talla
de lo vendido sin registrar.

## Actualización 2026-10-16 — Análisis para decidir compras

Cuatro cosas que se tocan para que quien COMPRA decida con acierto (qué comprar o producir, cuándo, qué mandar, qué rebajar). Cada actividad
agrega su viñeta aquí; la decisión 7 («Análisis no sugiere cantidades») sigue intacta.

- **A14 · Lo que se degrada avisa, y las 11 lecturas de Análisis no esperan más de 7 s** (solo web, sin migración).
  - **El problema.** Cada visita lanza de 11 a 17 lecturas a la vez y ninguna tenía tope de espera: el 16-oct a las 21:54 hubo unas 100
    respuestas 520, 522 y 525 de Supabase, y `fn_mis_modulos` y `fn_es_admin` llegaron a 40 s. Cuando una pieza se degradaba con gracia
    (principio 9) el único rastro era un `console.error` que no llega a Sentry (unos 15 en la ruta de Análisis; 0 issues de Análisis en 30 días):
    nadie se enteraba. Y si fallaba la lectura de LA TIENDA ACTIVA, sus listas venían vacías y «Qué pedir» decía «Sin ventas en N días»: se lee
    «no se vendió, no pidas».
  - **Un resultado común** (`lib/analisis-con-tope.ts`, `ResultadoLectura<T>`): ok · sin módulo · no se pudo · tope vencido. Cada lector lo
    consume por dentro y devuelve lo de siempre (`{ …, falla }`): `fallas` no cambia de significado. **`leerPieza` produce tres de las cuatro**
    (ok, no se pudo, tope vencido): `sin_modulo` queda RESERVADO en el tipo, porque hoy lo decide `leerFrescura` antes de leer y lo guarda en su
    propio `estado` (Frescura es la única pieza que depende de un módulo). A `DatosAnalisis` no sube el resultado crudo sino lo que las pestañas
    usan: **`sedesSinLeer`** (ids, de `getPrendasPorSede`), `frescura` y `fallas`; si A2, A7 o A11 necesitan el motivo por pieza (tope o error),
    se sube entonces. Qué hace `grupoDe` con una tienda sin leer sigue como hoy (cuenta 0): es A11.
  - **Tope de espera de 7 s** (`conTope`, `TOPE_LECTURA_MS`), por lectura y sin reintentos. Es MENOR que los 8 s del `statement_timeout` del rol
    `authenticated` a propósito: la base ya corta sola una consulta lenta, así que el tope web solo cubre lo que la base no puede cortar (la red
    entre Vercel y Supabase colgada, como el 16-oct) y de paso deja de esperar una consulta que va a morir igual. No corta una lectura sana pero
    lenta: lo más lento medido en Análisis fue 3,8 s. No cancela la petición (solo deja de esperarla). **Sin reintentos propios**; ojo, el cliente de
    Supabase (postgrest-js) SÍ reintenta por dentro las lecturas GET y HEAD (`.from().select()`, `head: true`: pendientes por registrar, vendido
    sin registrar) hasta 3 veces, con 1, 2 y 4 s de espera, ante un 520, un 503 o un corte de red; las RPC son POST y no se reintentan. El tope
    acota la espera de la pantalla igual (a los 7 s deja de esperar), pero esas peticiones siguen en segundo plano. Si se quiere que una caída
    520 no las cuente, `.retry(false)` en esas lecturas (son de otro módulo: pide OK). **No cubre** las lecturas del layout (`fn_mis_modulos`,
    `fn_es_admin`), que fueron las de 40 s, ni `exigirModulo` y `getUbicaciones` de la página: una caída como la del 16-oct puede colgar la
    página ANTES de llegar a las 11 lecturas.
  - **Aviso a Sentry por pieza** (`lib/analisis-lectura.ts:leerPieza` → `capturarError`, ADR-0424): `analisis.<pieza>`, **a lo más uno por pieza
    y por hora** por instancia del servidor (11 lecturas fallando son UN aviso), sin Sentry no sale nada. Lleva ids con forma de uuid, el motivo
    (error, sin datos, tope vencido), los ms y el código del error (SQLSTATE; o el de red cuando `fetch` falla, que postgrest-js deja entre
    paréntesis en `details`: `(ENOTFOUND)`); **el mensaje de quien falló NO viaja** (puede traer lo que devolvió la base) ni el texto de Frescura
    (trae el nombre de la sede; una Frescura que devuelve su `fallo` avisa como error, con mensaje fijo). Un 520, 522 o 525 de afuera llega con
    el cuerpo de la respuesta y sin código: de esos solo viajan el motivo y los ms. Para quien programa, en `next dev` la terminal sí escribe el
    mensaje real (`console.warn`, solo con `NODE_ENV = development`): sin eso, una RPC que falta en la base local quedaba sin explicación. Una lectura SANA de `fn_analisis_sede` que tarde 3 s o más se
    avisa aparte (`analisis.sede.lenta`, con su propia hora de freno para que no calle una falla real): es la única que crece con toda la historia (~2,3 ms por día; llegaría a 8 s entre mediados de 2027 y
    2028) y es el disparador de guardar un resumen por tienda y prenda, aplazado hasta entonces.
  - **«No se pudo leer tu tienda»** (`miTiendaSinLeer`, `AnalisisPantalla`): si la mía está en `sedesSinLeer`, las cinco pestañas dicen eso (con
    `<Aviso tono="error">`, como el «No pude ver tus prendas» de Se está acabando) y las cuentas de las pestañas pasan a «—». También en
    «Todavía no» (cuando la tienda no cumple las tres condiciones): sus cuadros «Lo más vendido con su prenda» y «Modelos de …» dicen que no se
    pudo leer en vez de «Sin ventas…» y «Sin prendas…». El chip de arriba pasa a «Sin leer» (no puede decir «Datos confiables» al lado) y la nota
    gris de las fallas ya no cierra con «Lo demás está al día». Las decisiones son puras y están probadas (`contenidoDeAnalisis`, `hayCuentas`,
    `confianzaDelDato`, `notaDeFallas`, `textoSiVacio`: las 5 pestañas × tienda leída o no × se recomienda o no).
  - **Lo descartado.** `captureConsole` de Sentry (manda cada `console.error` de todo el ERP, con lo que traiga); copiar el mensaje del error al
    aviso; un botón «Volver a leer» en el aviso (un control nuevo, cambia la huella de la guía y la frase ya dice qué hacer); un tope de ~10 s (mayor que los 8 s de la base: nunca sería el que corta); un `AbortSignal` (los lectores compartidos crean su propio
    cliente); dividir `loading.tsx`, `Suspense` por pieza, `next/dynamic` y una RPC liviana para las otras tiendas (aplazados: sin medición no se
    justifican); editar `lib/frescura.ts` (es de Frescura: sus `console.error` se quedan en los logs; el `console.error` del Inicio, lo mismo).
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis-con-tope lib/analisis-lectura lib/analisis-lecturas`: el tope
    (resuelve, vence, falla), el freno de una hora, que el aviso no lleva nombres ni DNI, `sedesSinLeer` con una tienda caída y otra colgada,
    que las `fallas` son las mismas frases de siempre y que una caída total arma la pantalla al vencer el tope. En producción solo se ve
    cuando algo se degrada de verdad: aparece el issue `analisis.<pieza>` en Sentry (si Felipe ya lo encendió, ADR-0424); sin Sentry queda la
    línea JSON en los logs de Vercel. **Sin confirmar:** que el aviso salga desde el render de una pantalla (hasta hoy todo `capturarError` del
    repo corre en rutas de API); al encender Sentry se provoca una degradación en una vista previa y se mira que llegue (backlog de este día).

- **A3 · Lo que ya viene cuenta, y la llegada atrasada vuelve a «Comprar»** (solo web, sin migración).
  - **El problema.** `alcancePorTipo` medía «para cuánto te alcanza» solo con el piso y el almacén de la tienda: con 2 en el piso, 6 vendidas en
    30 días y 20 por llegar decía 10 días (con lo que viene serían 110), así que apenas llegara el primer pedido para Navidad seguiría diciendo
    «pídelo». Y la lectura de lo que viene (`fn_analisis_por_llegar`) no pone límite de fecha: una llegada cuya fecha estimada ya pasó seguía
    contando como «Por llegar» y sacaba la prenda del filtro «Comprar», escondiendo una compra que sigue haciendo falta. Sumar lo que viene a
    «tiene» y, a la vez, mantener lo atrasado en «viene» se contradicen.
  - **La decisión.** Una sola regla (`llegadasDe`, `analisis-reglas.ts`): se ESPERA lo que llega hoy o después, o lo que no tiene fecha (se dice
    «sin fecha»; no se inventa una); está ATRASADO lo que tiene fecha pasada. Solo lo que se espera cuenta como «viene». En «Qué pedir»
    (`AlcanceTipo.vienen`, `vienenSinFecha`, `atrasadas`, `despues`) los días son `(tiene + vienen) / ritmo` y la fila dice «tienes 12 y vienen
    20»; `tiene` sigue siendo lo que hay hoy (la frase «Tienes 92» no miente). Lo atrasado no suma y se dice aparte en una segunda línea de la fila
    («8 atrasadas aparte»; en el panel, «no cuentan hasta que lleguen»). **Lo que llega DESPUÉS de la meta tampoco suma** (revisión
    independiente, 2026-10-16): `alcancePorTipo` pasa a `llegadasDe` el último día que importa (`hoy + hastaNavidad`, Navidad hoy) y lo que llega
    después va en `despues` («20 llegan después de Navidad»), porque un pedido del 5 de enero no cubre el 25 de diciembre y apagaría un «pídelo»
    que sigue haciendo falta; el día de la meta todavía cuenta. Cuando la meta sea el fin de la campaña (D3, A6) cambia `hastaNavidad`, no esta
    regla (ni el texto «después de Navidad»: A6 lo rotula con la campaña). En «Se está acabando» NO hay meta, así que ahí solo se aparta lo
    atrasado. La prenda atrasada vuelve a «Comprar» **solo si no viene nada más a tiempo**: con una parte a tiempo y otra atrasada queda en «Por
    llegar» (con las dos píldoras) y el tooltip de «Atrasada» solo dice que esa parte no cuenta (`notaAtrasada`); decir «sigue en Comprar» ahí
    mandaba a una lista donde la prenda no está. Lleva «Atrasada N días» (los de la parte que más se atrasó) en ámbar, con su tooltip. El mismo criterio sale en el «N por llegar» de Qué hacer hoy y en la ficha. `diasQueQuedan` NO se toca:
    los días de «Se está acabando» siguen siendo del stock en tienda y el filtro Todos/Comprar/Por llegar sigue separando lo que falta pedir de
    lo que viene (decisión 6). Es un cambio a la decisión 6 en un solo punto: una llegada vencida deja de contar como «viene».
  - **Lo descartado.** Que `tiene` incluyera lo que viene (la fila diría «tienes 32» y la ficha «Tienes 92» mentiría); contar la llegada atrasada
    «con un descuento» (inventa una probabilidad que nadie midió); inventar una fecha para lo que no la tiene (la compra sin fecha de llegada se
    queda en «sin fecha»); sumar órdenes de compra, despachos o producción en proceso (A4, que además debe deduplicar contra esto). Lo que se
    descartó al revisar: cortar lo que llega después de Navidad «hasta A6» (A3 sale antes y es justo cuando se hacen los primeros pedidos), y
    una tolerancia de N días antes de llamar «atrasada» a una llegada (decisión de Felipe, ver abajo).
  - **Lo que NO es igual que en Compras (pendiente de Felipe).** Compras trata una factura sin fecha estimada como esperada para su emisión + 7
    días (`fechaEsperada`, «misma regla que la base») y la marca atrasada pasado ese día; Análisis recibe `fecha = null` de
    `fn_analisis_por_llegar` y la cuenta como «viene (sin fecha)» sin tope de antigüedad. Hoy casi no se nota (la hoja de compra pide la fecha y
    en producción no hay compras con prenda por recibir), pero una factura vieja sin fecha apagaría un «pídelo» para siempre. El arreglo es de la
    base (`coalesce(c.fecha_estimada_llegada, c.fecha_emision + 7)` en las compras de `fn_analisis_por_llegar`, un `create or replace`) y de
    Felipe: no se hizo aquí. También de Felipe: con la regla de hoy un pedido con fecha de AYER cuenta como atrasado y el «pídelo» vuelve de un
    día para otro (acantilado); una tolerancia de N días es un solo valor en `llegadaAtrasada`.
  - **Un traslado sin líneas no cuenta, ni siquiera llega.** En producción hay un solo traslado de Taller a tienda en tránsito (estimado el
    20-sep) y tiene 0 líneas y 0 unidades: la base emite una parte por prenda, así que no emite nada para él. Se fija con pruebas para que un día
    una parte en cero tampoco infle ni esconda; el traslado mismo se cierra en su origen (Traslados), no en Análisis.
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis-reglas lib/analisis-pedir lib/analisis-acaba lib/analisis-hoy lib/analisis-ficha`
    (el caso de 2 / 6 / 20 → 10 y 110 días; fecha pasada → atrasada y de vuelta en «Comprar»; hoy, mañana y sin fecha cuentan; 20 que llegan el
    5-ene con Navidad a 79 días → 10 días y se pide; el 25-dic cuenta y el 26 no; una parte a tiempo y otra atrasada → «Por llegar» y la nota no
    nombra «Comprar»; el traslado de 0 líneas no cambia nada). En el navegador local: crear un traslado en tránsito y una compra repartida con prenda, ver la píldora «Por llegar»
    y el «vienen» de la fila de su tipo; cambiar la fecha estimada al pasado y ver «Atrasada», el filtro «Comprar» y que «vienen» baje.

- **A8 · Comprar dice a quién pedir, con el proveedor del catálogo agrupado** (solo web, sin migración).
  - **El problema.** El proveedor de «Comprar» salía de la última compra o producción (`fn_origen_producto`), y en producción ningún modelo tiene
    ninguna (0 compras con prenda, 0 producciones): la fila no decía a quién pedir —solo una etiqueta genérica, «Proveedor terceros»— y
    «Comprar todas» mezclaba a todos. El catálogo SÍ trae el proveedor de casi todos los modelos (`productos.proveedor_id`: 260 de 357 el 2026-10-16,
    de 40 proveedores del catálogo).
  - **La decisión.** Una sola regla (`lib/analisis-a-quien-pedir.ts`, `proveedorDelModelo`), de más fuerte a más débil: (1) el origen REAL
    manda: del Taller es del Taller; con una compra, el proveedor de esa compra; (2) sin origen, el proveedor del CATÁLOGO, y se dice que lo es
    («proveedor del catálogo»: es con quien se compra «habitualmente» ese modelo, no el de una compra que ya pasó); (3) sin nada, «Sin
    proveedor», nunca uno inventado. Se muestra como «Pídelo a Textil Andino» bajo «Comprar» (con «proveedor del catálogo» A LA VISTA cuando el nombre
    sale del catálogo, y un tooltip con el detalle), como la
    tarjeta «A quién pedir» sobre el carril (lo que todavía no viene en camino, agrupado por proveedor: dentro de cada uno, del más urgente
    al menos; entre proveedores, primero quien tiene lo más urgente —lo agotado antes que lo que queda—; «Sin proveedor» siempre al final; los
    4 primeros a la vista y «Ver N más»; sin botón por proveedor), como el pie del tooltip del camino «Compra» de Hoy («Pídelas a 12 proveedores ·
    3 sin proveedor»; si parte de la lista ya viene en camino, «Las que aún no vienen: pídelas a …») y como la tarjetita de proveedor de la ficha. Se lee con un SELECT del servidor (`lib/analisis-proveedores.ts`, pieza
    `proveedores` de `leerPieza`): `productos.id, proveedor_id` y `proveedores.id, nombre, activo` (nunca RUC, banco ni teléfono), sin RPC ni
    migración. `productos_select` y `proveedores_select` piden `fn_tiene_acceso_retail()` (comprobado en producción, solo lectura), la primera de las
    dos puertas de `fn_analisis_sede`: toda cuenta que abre Análisis puede leerlas. Si la lectura falla, `DatosAnalisis.proveedores` es null, se
    dice en `fallas` y no se dibuja nada de esto (principio 9: nunca «Sin proveedor» por un error). Un directorio SIN ni un proveedor también cuenta
    como no leído (`leerProveedoresAnalisis` devuelve null): es lo que responde una política de filas cuando la cuenta pierde la puerta de lectura
    (cero filas, no un error), y leerlo como dato pondría «Sin proveedor» a todos los modelos por una falla. A la pantalla solo viaja lo que sus
    prendas pueden usar (`recortarProveedores`: el proveedor del catálogo de sus modelos y los nombres de a quienes apuntan), no el catálogo ni el
    directorio enteros.
  - **El catálogo NUNCA decide Taller contra terceros** (paso 0 del plan). El plan pedía comprobar en producción que lo que fabrica el Taller no
    apunte a un tercero en `proveedor_id`; no se puede: hay 0 producciones, 0 movimientos en el Taller y 0 líneas de compra, así que no existe una
    sola prenda de la que se sepa que es del Taller. Y 26 modelos apuntan a «CAYLA SAC», la marca propia (ADR-0109 y ADR-0283 la cuelgan de ese
    proveedor), que puede ser el Taller o una maquila. Por eso el respaldo solo se usa cuando el modelo NO tiene origen, la etiqueta dice «del
    catálogo» y no afirma «terceros», `hrefComprar` NO cambió (`?prov=` sigue saliendo solo de una compra real) y un proveedor del catálogo no
    mueve a «Comprar» hacia Compras ni hacia Producción. Qué hacer con «CAYLA SAC» es de Felipe (D9).
  - **«También se acaba en AQP»** (`seAcabaEnOtras`, `ventanasPorSede`): para cada otra tienda donde el modelo se vende y, al ritmo de SU tienda
    (sus días de ventas en el ERP, hasta 30), le quedan 14 días o menos (la regla de `seEstaAcabando`, con `diasQueQuedan`), la fila lo dice con
    una píldora («AQP también se acaba»; «también se agotó» si allá ya no hay). Es lo que ya se lee en `otras`: sin RPC. Existe porque una orden
    de compra tiene UN solo destino (`ordenes_compra.ubicacion_destino_id`) y Análisis ve UNA tienda: el comprador que arma un pedido para la suya
    debe saber que el mismo modelo falta en otra. No dice cuántas pedir (la decisión 7 sigue intacta). Una tienda cuyo motor no se leyó no dice nada.
  - **La tarjeta no depende del filtro del carril** (`modelosPorPedir`, regla única de la tarjeta y del pie de Hoy): lo que se acaba y no viene en
    camino, venga el filtro «Todos», «Comprar» o «Por llegar». Los botones del filtro viven DEBAJO de la tarjeta; una tarjeta que aparece y
    desaparece al elegir «Por llegar» correría el carril ~250 px y los botones se irían de debajo del mouse (ADR-0185). Sí sigue al buscador, que
    está arriba de todo.
  - **Lo descartado.** Que «A quién pedir» lleve un botón por proveedor (hoy «Comprar» abre «Registrar factura», una compra ya hecha: es A9, tras
    A4); pasar el proveedor del catálogo a `?prov=` (cambiaría a dónde lleva el botón); decidir el Taller o terceros por el nombre del proveedor
    («CAYLA SAC»): una regla de negocio de Felipe; agregar el proveedor a `fn_analisis_sede` (una migración para algo que se lee con un SELECT);
    poner la tarjeta debajo del carril (con 40 filas quedaría fuera de la pantalla) o dentro de los filtros (escondida); que la tarjeta siga al
    filtro (salta el carril); decir el origen del nombre solo en un tooltip (no se alcanza con el dedo ni con el teclado: ley 6 de ADR-0350); cambiar
    el botón «o pedir a Arequipa» cuando allá también se acaba (la píldora ya lo avisa en la misma fila; el botón es de D10).
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis-a-quien-pedir lib/analisis-proveedores-lectura lib/analisis-lecturas lib/analisis-acaba lib/analisis-hoy lib/analisis-ficha`
    (el origen real contra el catálogo; el Taller no cambia por el catálogo; 40 modelos y 17 proveedores sin perder ni repetir ninguno y en orden
    de urgencia; la lectura que falla o se cuelga y no nombra a nadie; el directorio vacío que no se lee como dato; «también se acaba» en el borde de
    14 días; la pestaña entera con los tres filtros, que dibuja la misma tarjeta con cada uno). En el navegador local: la tarjeta «A quién pedir»
    en «Se está acabando» con los tres filtros (el carril no debe saltar al cambiar de uno a otro), a 1440, 1024 y 375 px, claro y oscuro;
    «Pídelo a …» con un nombre largo y su «proveedor del catálogo» debajo; el tooltip de «Compra» en Hoy. En producción, con la base real: la fila dice «proveedor del catálogo» (no hay ninguna compra).


- **F1 · Lo que se vio en pantalla: «Se está acabando» claro, «A quién pedir» como modo, la ficha y los avisos sin contradicciones** (solo web, sin
  migración; corrige lo que mostraron las capturas de A14, A3 y A8 con datos inventados, 1440 y 1024 px, claro y oscuro, miradas por una compradora
  sin formación técnica y por un control de calidad visual).
  - **El problema.** Con las capturas a la vista, una compradora ciega entendía «qué se acaba» en 5 segundos pero no «a quién pedírselo»: en el filtro
    «Por llegar» el título seguía diciendo «Cómpralas» y cada fila «Pídelo a X» (invita a pedir dos veces lo que ya viene); «Compra 12 · 4 por llegar»
    en Hoy no cuadraba con el filtro «Comprar 8»; la tarjeta «A quién pedir» empujaba el carril 381 px (a 1024 px lo dejaba bajo el pliegue) y dejaba
    «Sin proveedor», con un agotado, tras «Ver 2 más»; a un proveedor archivado se le seguía diciendo «Pídelo a»; «compra 16» en la ficha se leía como
    una orden; el nombre del proveedor se partía a media palabra; y a 1024 px «Qué pedir» ni se veía.
  - **Qué se decidió** (todo dentro de Análisis; cada regla pura tiene su prueba):
    - **El título del carril sale del filtro** (`tituloDelCarril`): «Se están acabando» · «Cómpralas» · «Ya vienen»; su cuenta es la del filtro. Sobre
      «Ya vienen» no se ofrece «Comprar todas» y su ícono pasa a «llega» en verde (no es una urgencia). El botón de cada fila ya era el secundario
      (`btn-secundario`): se fijó con una prueba. La píldora dice cuándo (`cuandoLlega`): «Por llegar 24 · en 4 días», «· sin fecha».
    - **«Pídelo a X» solo para lo que falta pedir.** Lo que ya viene a tiempo dice «Viene de X» (`textoVieneDe`: el origen de lo que llega, el de más
      unidades; «de Textil Andino» solo si se sabe cuál —el proveedor de su última compra—, nunca inventado: la llegada no trae el proveedor de su orden,
      así que el solo ANOTADO en la ficha del catálogo no se nombra) en tinta tenue. El nombre va sin el sufijo legal (`nombreCortoProveedor`:
      SAC, S.A.C., S.A., E.I.R.L., EIRL, S.R.L.) y entero en el `aria-label` y el tooltip; la fuente se dice SIEMPRE y en palabras de tienda: «le
      compraste la última vez» o «anotado en su ficha» (antes, «proveedor del catálogo», que se leía como el catálogo de ventas). Sin proveedor o con
      uno archivado la fila lo dice («Sin proveedor / falta elegirlo en el catálogo», «Sin proveedor activo / su proveedor está archivado: elige
      otro»). A ≤ 780 px el bloque pasa a la línea de las píldoras, bajo la barra (`.c-quien`), para que el nombre no quede separado de su barra.
    - **Compra en Hoy cuenta lo mismo que «Comprar»** (`caminosDeHoy` usa `modelosPorPedir`, la regla única): «Compra 8 · 2 agotadas · 4 más ya
      vienen». Si todo lo que se acaba ya viene, no hay camino de compra. La lista del tooltip y su pie («Pídelas a 5 proveedores») hablan de lo mismo.
    - **«A quién pedir» deja de ser una tarjeta encima del carril y pasa a ser OTRA FORMA de ver la misma lista**: el segmento «POR DÍAS / POR
      PROVEEDOR» (`SegmentoDeslizante forma="modo"`, la pieza que /unificar decidió para «lo mismo de otra forma») en la cabecera. «Por proveedor» dice
      de qué habla («Lo que aún no viene: 7 modelos de 5 proveedores y 1 sin proveedor», cada cifra cierta) y muestra lo que todavía no viene
      (`modelosPorPedir`). Los filtros viven a la izquierda del segmento y solo «por días»: el segmento no se mueve de debajo del mouse (ADR-0185).
      Si no se leyeron los proveedores o todo ya viene, «Por proveedor» no se puede elegir y dice por qué. «Sin proveedor» no cuenta para el tope de
      4 grupos y, si trae un agotado, siempre se ve (`repartirGrupos`: `fijo`, al final aunque «Ver más» esté cerrado); lleva `<EnlaceVer>` «Elegir
      proveedor» a la ficha del producto en Catálogo (`/productos/[id]/editar`; con varios modelos, a `/productos`), solo si la cuenta puede editar el
      catálogo (`AccesoAnalisis.catalogo`). Un proveedor ARCHIVADO no se recomienda: sus modelos caen en «Sin proveedor» con su motivo y su nombre con
      un `<Chip>` «Archivado» (`proveedorDelModelo` ya no devuelve «(archivado)» como si fuera una indicación). El modo no cambia qué se pide ni
      propone cantidades (decisión 7).
    - **La ficha**: el proveedor y lo que viene en camino van en franjas de ancho completo (`Hecho.ancho`), no en la cuadrícula de 4 cifras; se quita
      `overflow-wrap: anywhere`. «Por llegar» y «Atrasada» son UNA franja con cada parte y su fecha («pediste 10 · llega el 20 oct.», «· sin fecha»; ya
      no «compra 16»), lo que llega antes y después de la meta («10 antes de Navidad, 6 después», `meta` de `hechosDe`: la misma Navidad de «Qué
      pedir») y lo atrasado. Lo que dice de las otras tiendas coincide con la lista: la que lo vendió y quedó en 0 «se quedó sin stock (vendió N en sus últimos
      30 días)», con «también» solo si la tuya TAMBIÉN está en cero (en un modelo que mandas o liquidas, tu tienda sí lo tiene); «no tiene este
      modelo» solo si nunca lo tuvo. Si algo ya viene en camino a tiempo, la ficha dice lo mismo que el carril: el chip es «Ya viene» (sin rojo,
      no «Cómpralas»), «Comprar» queda como botón secundario y la franja del proveedor no dice «pídelo aquí».
    - **Un solo número y un solo destino de «Comprar»** (revisión independiente de F1): tocar «Compra 8» en Hoy abre «Se está acabando» ya en el
      filtro «Comprar» (`filtroAcabaDelCamino`, que `irA` no necesita conocer), así el 8 de la tarjeta es el del título del carril y no un 12;
      y «Comprar todas» en «Todos» calcula su destino solo con lo que falta pedir (`hrefComprarLasQueFaltan` → `modelosPorPedir`), porque lo que
      ya viene no se compra otra vez ni debe decidir adónde lleva el botón. «Elegir proveedor» pide además el módulo «Productos» (el layout de
      `/productos/[id]` lo exige; `editarCatalogo` también sale de «Categorías y atributos»). Al cambiar «Por días / Por proveedor» el segmento se
      vuelve a montar (cada forma dibuja su tarjeta) y quien lo manejaba con ← → perdía el foco: si quedó en la nada, vuelve a la opción elegida.
    - **Tienda sin leer**: desaparece la nota gris que repetía lo mismo (`fallasSinMiTienda`, solo cuando el aviso grande está a la vista); el aviso
      lleva el nombre de la tienda («No se pudo leer Tienda Lima») y «Volver a intentar», que relee con `router.refresh()` anunciado con
      `navegacionSinEspera` (ADR-0149: es una lectura, no abre el loader a pantalla completa; el botón dice «Leyendo…» y no se puede apretar dos veces).
    - **«Qué pedir», solo texto y CSS**: «vendiste 56 · 6 sin registrar la prenda»; «12 atrasadas: no las cuento»; el mismo interlineado en las dos
      líneas de la fila; sin las «→» sueltas; titular de la tarjeta de Hoy con `text-wrap: balance`. El orden por defecto y el ✓ verde del ranking
      siguen igual (A6, D13).
    - **CSS puntual**: la fila de pestañas pasa el chip de confianza a su propia línea a ≤ 900 px de contenedor y usa etiquetas cortas a ≤ 760 px
      («Se acaba», «Nunca salió», «Pedir»): a 1024 px la píldora medía 742 px y el contenedor 672, y «Qué pedir» no se veía; la cifra dentro de la barra
      de días usa `--color-tinta-fija` en oscuro (crema sobre ámbar claro, ~1,5:1); la columna de píldoras toma hasta 260 px en contenedores de más
      de 1000 px y las píldoras se acomodan en fila.
  - **Lo descartado.** Seguir con la tarjeta arriba pero plegada («Pídeselo a 5 proveedores · 8 modelos»): sigue siendo una pregunta distinta puesta
    sobre la lista, y a 1024 px lo primero que se ve no es lo urgente. Que «Por proveedor» siga al filtro del carril (la lista de «Comprar» ya es la
    suya). Una página nueva por proveedor, o el botón de compra por proveedor (A9, tras A4). Un enlace por modelo en «Sin proveedor» (con varios,
    lleva a la lista de Productos; un enlace directo por modelo queda pendiente). Decir «Viene de X» con el proveedor ANOTADO en la ficha del
    catálogo (no se sabe de quién es la orden en tránsito; nombrarlo pide que la lectura traiga el proveedor de cada llegada). Que un modelo cuya
    última compra fue a un proveedor ARCHIVADO caiga al proveedor activo que su ficha ya anota (hoy sale «Sin proveedor activo… elige otro»): cambia
    la regla «el origen real manda» y queda por decidir con Felipe; hoy ningún modelo tiene compras. Un título del carril que no cambie con el filtro. Cambiar el filtro «Comprar» para que la
    prenda con una parte a tiempo y otra atrasada (la capa) vuelva a «Comprar»: sigue en «Por llegar» a propósito (algo viene a tiempo) y su
    píldora «Atrasada» lo dice.
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis-a-quien-pedir lib/analisis-acaba lib/analisis-hoy lib/analisis-ficha
    lib/analisis-con-tope lib/analisis-reintentar lib/analisis-pedir lib/analisis-acciones lib/guias`. La pestaña entera con los tres filtros y los dos
    modos —y «Viene de» solo con una compra, «Comprar todas» solo sobre lo que falta— está en `analisis-a-quien-pedir-pantalla.test.tsx`; que «Volver a intentar» no abre el loader, en `analisis-reintentar.test.ts`. En el
    navegador local (lo mira el orquestador): «Se está acabando» a 1440 y 1024 px, claro y oscuro, con los tres filtros y los dos modos (el carril
    empieza arriba y el segmento no se mueve); la ficha de la capa, la camisa y el bolso; la fila de pestañas a 1024 y 1280 px con las cinco
    visibles; la tienda sin leer con su botón; y `pnpm --filter web tema:auditar` sobre `/gestion/analisis`.

- **A4 · Lo ya pedido (órdenes de compra, envíos del proveedor, producción en proceso) cuenta como «ya pedido»** (lectura NUEVA y aditiva en la
  base + web; migración `20261017043000_analisis_pedido_en_camino.sql`, que pega Felipe).
  - **El problema.** `fn_analisis_por_llegar` exige `variante_id`: solo ve traslados y compras con su talla y color. Una orden de compra se pide por
    «tipo + marca» (la prenda se crea al recibir), el envío del proveedor y la producción del Taller tampoco son una prenda. El día del primer pedido
    real para Navidad, Análisis seguiría diciendo «pídelo» y el comprador lo pediría dos veces (el Plan de campaña sí resta las órdenes, ADR-0372;
    Análisis no). Hoy (2026-10-16, solo lectura en producción) hay 0 órdenes, 0 líneas y 1 envío abierto SIN líneas: el riesgo empieza con el primer pedido.
  - **La lectura** (`fn_analisis_pedido_en_camino(p_ubicacion_id)`, `security definer`, `fn_tiene_acceso_retail()` y `fn_puede_analizar()`, sin dinero:
    ni precio, ni descuento, ni subtotal, ADR-0126; el nombre lleva `fn_` para que no abra el loader). Devuelve partes `{de, categoria, prefijo, marca,
    cantidad, fecha, numeros}` con cinco orígenes: `orden` (orden abierta directa a mi tienda, sin enviar), `envio` (en un envío a mi tienda, en camino
    o abierto), `reposicion` (lo que el proveedor debe reponer de un envío cerrado, «No vino» o devuelto por llegar dañado, solo las diferencias VIGENTES, menos lo
    que «Nos debe» ya saldó; las mismas que cuenta el Plan), `por_repartir` (orden sin destino, o a un almacén, sin enviar) y
    `taller` (producción `en_proceso`, sin muestras). Las dos últimas son de la RED. Una orden que llega directo a OTRA tienda, una anulada y una familia
    fuera de los motores (`fn_categoria_entra_a_motores`, ADR-0377; caso H1/H2 de `pruebas:motores-familias-apagadas`) no salen. **Paso 0:** las seis tablas
    (`ordenes_compra`, `orden_compra_items`, `despachos`, `despacho_items`, `despacho_diferencias`, `proveedor_deuda_resoluciones`) tienen RLS encendido y
    CERO políticas en producción (las viejas `ordenes_compra_select*` ya no existen), así que una cuenta con solo Análisis no puede leerlas: la función
    `security definer` es obligatoria.
  - **Sin doble conteo.** La misma unidad es línea de la orden, línea de un envío y, al llegar, entrada al stock. Se cuenta UNA vez, donde está ahora, con la
    cuenta del Plan de campaña (`fn_plan_compra_pedido`, 20261013213000): `pedido = por enviar + en camino + por reponer` y `por enviar = pedido − lo que
    ya salió en un envío vigente` (nunca < 0). Una orden de 100 que pasa por «sin enviar» → «40 en un envío en camino» → «recibido» se lee 100 → 60 + 40 → 60
    (caso Y2). Y no se cruza con `fn_analisis_por_llegar`: el papel de una orden se guarda sin prenda (`compra_items.variante_id` nulo; nada lo actualiza) y
    esa lectura exige prenda, así que la compra de una orden jamás aparece allí (caso Y8). Lo que ningún dato une: alguien que registre a mano, por el camino
    viejo de «Registrar factura», una compra con prendas de lo MISMO que ya tiene su orden.
  - **La regla de qué suma** (la fija `pedidoPorTipo`, `lib/analisis-pedido-en-camino-reglas.ts`; Felipe puede cambiarla ahí sin tocar la base). SUMA a «tienes /
    vienen» del TIPO (`AlcanceTipo.pedido.suma`, cuenta para `dias`): lo que ya va en un envío hacia mi tienda (ya salió: suma aunque la fecha de la orden haya
    pasado o falte) y lo pedido en una orden con entrega de hoy en adelante y hasta la meta. SE MUESTRA y NO SUMA: lo pedido sin fecha, con la entrega vencida,
    después de la meta (el 25-dic cuenta, como en A3) y lo que el proveedor debe reponer; y, de la red, lo por repartir y lo que el Taller tiene en proceso. Así un
    tipo con una orden abierta con fecha ya no dice solo «pídelo», y uno con una orden sin fecha sigue diciéndolo y avisa que la hay. Es la idea de A3 para las
    llegadas por prenda: lo atrasado y lo tardío no esconden una compra que sigue haciendo falta.
  - **La producción en proceso va SOLO a nivel red** (decisión 6 de ADR-0357 intacta): mientras se cose no dice a qué tienda irá. Se dice («el Taller tiene 40 en
    proceso») y nunca suma a una tienda; recién cuenta, por prenda, cuando sale como traslado. Lo pedido «por repartir» es igual: no es de ninguna tienda hasta
    que sale en un envío; el pedazo que sale en un envío a mi tienda sí es de mi tienda.
  - **Dónde se ve.** «Qué pedir»: bajo cada tipo, «Ya pedido 40 · llegan el 12 nov.» y, aparte, lo que no cuenta («15 pedidas sin fecha: no las cuento», «el proveedor
    debe 10», «el Taller tiene 40 en proceso»); el panel del tipo lo dice completo («Ya pedido 40: 30 van en un envío y 10 llegan el 12 nov.»); un tipo con algo
    pedido para mi tienda y SIN prendas aquí se nombra bajo la tabla (si no, quien lo busca y no lo ve lo vuelve a pedir). La tarjeta «¿Qué pedir?» de Hoy usa
    la misma cuenta. «Se está acabando»: la fila que sigue en «Comprar» dice «Ya pedido: 40 Blusas» (o «Pedido atrasado», «sin fecha de entrega», «El proveedor
    debe»), con la marca y los números de orden en su tooltip. **No cambia en qué grupo cae una prenda**: una orden no dice a qué modelo irá y se habla del TIPO,
    nunca de «esta prenda viene». La lectura que falla es `pedido: null` y se dice en `fallas`; nunca «no hay nada pedido» por un error.
  - **Lo descartado.** Atribuir la producción en proceso (o lo «por repartir») a una tienda; sumar la orden SIN fecha (no es una promesa que se pueda contar,
    pasa lo mismo con la vencida); sumar el envío solo si la orden tiene fecha vigente (un envío en camino con una orden de fecha pasada es lo más probable en
    la vida real y daría un «pídelo» falso sobre mercadería en el camión); reemplazar o parchar `fn_analisis_por_llegar` (aditiva: sin candado de md5 ni riesgo
    para las suites que la leen); devolver precio o proveedor de la orden (sin dinero; el proveedor lo pedirá A9); atribuir la nota de «Comprar» a una marca
    (la prenda no trae su marca: la nota dice el tipo y, en el tooltip, las marcas de la orden); abrir un tipo por algo que no suma.
  - **Revisión de A4 (dos revisores, 2026-10-16; lo real se corrigió en el mismo commit).** (1) «Lo que debe el proveedor» leía la tabla `despacho_diferencias` entera y solo
    la causa «No vino»: tras reabrir un envío contaba la diferencia vieja (`vigente = false`) y la nueva (10 + 4 = 14 en vez de 4) y no veía lo devuelto por llegar dañado
    (`devuelta`); ahora lee `despacho_diferencias_vigentes` con las dos causas, como `fn_plan_compra_pedido` (casos Y10, Y11), la guarda de la migración exige la vista, y la
    prueba F1 de `reabrir_envio.mjs` ahora también atrapa un `join` (solo miraba `from`, por eso no vio esta función). (2) Una orden con destino un ALMACÉN
    (`crear_orden_compra` admite tienda o almacén) no era de ninguna tienda y desaparecía; ahora es de la red, como la que no tiene destino (caso Y12; producción hoy
    no tiene ningún almacén: es una defensa). (3) La prueba Y5 usaba `saldo_a_favor`, que desde 20261015145000 exige una nota de crédito: pasó solo porque la base local
    estaba atrasada; usa `repuesta` y todas las pruebas de A4 se corrieron contra una copia con TODAS las migraciones. (4) Textos: con un envío y una orden con fecha la
    fila dice «Ya pedido 40 · 30 en camino y 10 el 12 nov.» (antes parecía que los 40 llegaban el 12); «1 de Polos» en vez de «1 Polos»; la nota del tipo sin fila ya no
    dice «no tiene prendas» (puede tenerlas sin stock ni ventas); lo pedido con entrega tras Navidad dice «pedidas con entrega después de Navidad» para no repetir la
    frase de las prendas. **Se rechazó:** contar el envío solo si tiene fecha (sin cambio, ver «Lo descartado»); y reabrir como no-suma (ver pendientes).
  - **Pendiente (Felipe).** Que una orden `generada` nunca se cierra sola: una vieja sin enviar sigue contando como «sin fecha» o «vencida» para siempre (hace falta
    una regla para darla por cerrada); si un envío en camino de muchos días debe seguir sumando; y qué hacer con el modo «Por proveedor», que aún no dice lo ya pedido
    (A9, que necesita el proveedor de cada orden); un envío REABIERTO (cerrado → abierto) cuenta entero como «va en camino» aunque lo que entró ya está en el stock
    (igual que hace el Plan): la ventana es corta, pero la regla correcta depende de cómo se cuenta una reapertura y es de Compras; y lo que un envío cerrado por
    conteo dejó «sin tallas» (en el almacén, no en el stock libre) lo da por recibido.
  - **Cómo se verifica.** `node scripts/pruebas/analisis_lecturas.mjs` (F4, P6, P7, Y1 a Y12, M1) y `pnpm pruebas:motores-familias-apagadas` (H1, H2, R1) contra un Postgres
    local **con todas las migraciones del repo** (como el del CI: la función lee envíos, «Nos debe» y la vista de diferencias vigentes; en la base local compartida, atrasada,
    se detiene en su guarda); `pnpm pruebas:roles-cobertura`; `pnpm pruebas:reabrir-envio` (F1 vigila que ninguna función lea `despacho_diferencias` sin filtrar, con `from` o `join`); `pnpm --filter web exec vitest run lib/analisis-pedido-en-camino lib/analisis-pedir lib/analisis-lecturas
    lib/analisis-a-quien-pedir-pantalla lib/guias` (la regla en cada borde, los textos, la fila de «Comprar», la lectura que falla o se cuelga, el tipo sin prendas).
    En el navegador local: crear una orden de Polos para la tienda (Compras ▸ Órdenes de compra) y ver «Ya pedido» en «Qué pedir»; hacer un envío y verlo pasar a
    «en camino»; recibirlo y verlo desaparecer. En producción, tras pegar: `select retail.fn_analisis_pedido_en_camino(<tienda>)` con sesión (hoy `[]`) y el volcado
    refrescado.

- **A9 · «Comprar» abre una orden de compra con el proveedor y los modelos, no una factura** (decisión D8 de Felipe, 2026-10-16; solo web, sin migración).
  - **El problema.** «Comprar» y «Comprar todas» abrían `/compras/nueva`, que es «Registrar factura de proveedor»: una compra YA HECHA, con serie y número. Quien
    decide qué pedir llegaba a un formulario para anotar algo que todavía no existe. Y el botón se escondía si la cuenta no tenía Facturas y el dinero de Compras, aunque
    tuviera Órdenes de compra (el módulo de pedir). Con «A quién pedir» (A8) la cosa empeoró: la tarjeta agrupa por proveedor y no había cómo abrir una orden con él.
  - **La decisión.** «Comprar» de terceros abre **Compras ▸ Nueva orden de compra** con `?prov=<proveedor>&destino=<la tienda que analizas>&modelos=<ids>&desde=analisis`:
    **solo ids** (de proveedor, tienda y modelo); la categoría, la marca y el nombre del modelo los lee Compras de `productos` (`getModelosParaOrden`), así un enlace viejo o
    armado a mano no puede traer una marca que ya no existe ni un texto inventado. La página lo trata como dato de afuera (`lib/orden-compra-desde-analisis.ts`): ids con forma
    de id, sin repetir, a lo más 100 (las líneas que cabe una orden); un modelo se acepta si EXISTE en `productos` (Análisis también lista los descontinuados, así que no se filtra
    por estado) y un proveedor, una tienda, una categoría o una marca que ya no están activos quedan vacíos para elegirlos; lo que se ignora se DICE («1 prenda de Análisis ya no
    está en el catálogo», «El proveedor que traía Análisis ya no está activo»), nunca en silencio. Arma un **borrador**: una línea por modelo con su categoría, su marca (si no tiene, la única marca de ese proveedor) y su nombre como
    descripción, **sin cantidad ni precio**; no guarda nada (`crear_orden_compra` no se tocó). El proveedor es el MISMO que dice la fila en «Pídelo a …» (`proveedorDelModelo`:
    la última compra o, sin ninguna, el catálogo); uno archivado o ninguno deja el campo vacío.
  - **Quién ve qué botón.** El módulo que realmente se abre: `ordenes_compra` (su layout no pide el dinero de Compras). Quien ve Facturas y NO Órdenes cae en «Registrar factura»
    como hoy (con el proveedor de una compra real, nunca el del catálogo: una factura no es una conjetura). Hoy 2 roles tienen Facturas, 1 Producción y ninguno Órdenes sin ser
    líder (consultado en producción el 2026-10-16): el cambio de puerta es de diseño, no un hueco de hoy. El Taller no cambia: Producción, si la cuenta la ve.
  - **«Comprar todas» y «Pedir a X».** «Comprar todas» abre UNA orden con todos los modelos cuando todos se piden al MISMO proveedor (o todos están sin proveedor); con varios
    proveedores no abre N órdenes (N pestañas sin saber cuál se guardó) y «Comprar todas» no sale: **cada proveedor de «A quién pedir» trae su botón «Pedir a X»**, con sus modelos, solo con Órdenes de compra (con Facturas sola
    diría «Pedir» y abriría una factura). El Taller y «Sin proveedor» no lo traen. **Para que «Comprar todas» no se esfume sin decir por qué**, cuando hay varios proveedores y la
    cuenta ve Órdenes, en su lugar sale **«Pídelas por proveedor»**: un botón (no navega ni guarda) que abre el modo «Por proveedor», donde cada uno trae su «Pedir a X». Una orden tiene UN destino y Análisis ve UNA tienda: la píldora «AQP también se acaba» (A8) es
    lo que avisa de las otras; no hay pedido único para la red.
  - **Guía de foco (ADR-0284, regla 4).** Lo que llega armado no lleva ✓. El proveedor y la tienda los eligió la persona al apretar el botón (llegan completos y sin ✓, como al
    editar); cada línea armada dice **«Por revisar»** hasta que se REVISA —toca su categoría, su marca o su descripción— o queda completa (`lineaPorRevisar`; escribir solo la cantidad o el
    precio no la revisa: la marca que puso Análisis, o el proveedor si el modelo no tenía, sigue sin mirar), y la luz va a **la primera cantidad** («Vino de Análisis: revisa la
    categoría y la marca, y escribe la cantidad»; la descripción, que ya viene escrita, lleva `data-sin-cursor` para que el cursor no caiga ahí): para eso, y solo con una orden armada,
    la entrega estimada —que solo se sugiere— espera detrás de las líneas (`lineasPrimero`). Un aviso arriba dice de dónde
    vinieron y que Análisis no sugiere cantidades. «Volver» y «Cancelar» regresan a Análisis (a «Se está acabando») si vino de ahí y la cuenta ve ese módulo; cualquier otro `desde`
    se ignora, así la URL nunca decide un destino libre.
  - **Lo descartado.** Llevar la categoría, la marca y el nombre en la URL (más largo, y desactualizado o falsificable: los lee Compras); abrir N órdenes con «Comprar todas»
    (N pestañas sin saber cuál se guardó; por eso «Pedir a X»); sugerir cantidades (decisión 7); prellenar el precio con el último costo (es dinero: pide el OK de Felipe); una
    columna de «lo que tienes en fondo y lo que debes a este proveedor» en el borrador (omisión de la crítica: toca dinero y dos módulos, queda para Felipe); decir «Pídelo en el
    Taller» desde una tienda (lo decide D9, Producción contra Análisis); guardar la orden sola.
  - **Pendiente (Felipe).** (1) **D9:** hoy un modelo de origen Taller, visto desde una tienda, sigue llevando a Producción, que solo se trabaja desde el Taller (a quien no es líder lo
    manda al inicio sin explicar); nadie lo dispara aún (0 producciones en producción). (2) El modo «Por proveedor» todavía no dice lo ya pedido por proveedor (la función de A4 no
    devuelve el proveedor de cada orden: pide migración). (3) 96 de 361 modelos no tienen marca en el catálogo: su línea llega sin marca, a menos que el proveedor traiga una sola.
    (4) **«CAYLA SAC» (D9, de A8):** la fila dice «Pídelo a CAYLA SAC · anotado en su ficha» para 26 modelos que apuntan a la marca propia (puede ser el Taller o una maquila), y como el
    proveedor de la orden es el que dice la fila, **«Comprar» y «Pedir a CAYLA SAC» ahora abren una orden de compra a la propia empresa** (antes, «Registrar factura» sin proveedor;
    A8 descartó pasar el proveedor del catálogo al botón justamente porque cambiaría a dónde lleva). La orden no se guarda sola y no se decidió por el nombre del proveedor (regla de
    Felipe); Felipe decide si eso tiene sentido o si esos modelos van a Producción. (5) «Volver» regresa a «Se está acabando» en «Por días»: el modo «Por proveedor» vive en el
    estado de la pantalla, no en la URL; quien pide a un proveedor tras otro lo vuelve a elegir. (6) «Llega a» viaja como ya elegido (la tienda que se analiza) y sin ✓: quien compra
    para repartir desde otra sede debe notarlo; si se prefiere «sugerido», la luz iría primero al destino y no a la línea.
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/orden-compra-desde-analisis lib/analisis-acciones lib/analisis-ficha lib/analisis-a-quien-pedir lib/orden-compra-alta lib/guias`
    (el enlace y su lectura, ids ajenos, repetidos, enormes y mal formados, una orden armada que no se puede guardar sin cantidad, la guía de foco, el cableado entre las dos
    pantallas —lee el código de la página, el formulario y Análisis— y la matriz de módulos por origen por proveedor). En el navegador local: Análisis ▸ Se está acabando ▸ «Comprar» → la orden con el proveedor, la tienda y la línea «Por revisar» sin cantidad → «Volver» regresa a
    Análisis; «Por proveedor» ▸ «Pedir a X»; una cuenta con solo Órdenes ve el botón, una con solo Facturas cae en «Registrar factura», una sin ninguna no lo ve; a 1440 y 1024 px, claro y oscuro.

- **A5 + A15 · El ritmo se ve con su base («Vendió N en D días», el peor caso y el rango, «Una sola venta») y cuánto cuesta esperar** (decisión D6 de Felipe, 2026-10-16; solo web, sin
  migración).
  - **El problema.** «Quedan 14 días» parece un número sólido y puede descansar en una sola unidad vendida. Medido en producción el 16-oct (por la verificación del plan, con las cifras
    corregidas): de 40 modelos que se acaban en Trujillo, 17 descansan en UNA venta y 22 en una o dos; de 14 agotados, 10 vendieron una sola unidad y 11 una o dos. Un agotado con una
    venta salía «Urgente: Compra» en rojo sin decir su base, y quien compra decide por el peor caso, que la pantalla no mostraba. Además, dos agotados con las mismas unidades vendidas
    salían empatados aunque uno deje el doble por prenda.
  - **El rango** (`lib/analisis-ritmo.ts`, función pura `rangoDeDias`). Con las `ventas` observadas en la ventana de ritmo (`ventanaDe`, la MISMA de `diasQueQuedan`) y lo que hay en la
    tienda, los días que quedan caben entre `stock × ventana / λalto` y `stock × ventana / λbajo`, con λ entre los límites **exactos** (Clopper-Pearson) de una Poisson al 80 % (10 %
    de azar por cada lado). Una venta es un conteo de sucesos sueltos en una ventana de tiempo; exacto, porque con 1 o 2 ventas la aproximación normal da límites negativos. Se resuelve
    por bisección sobre la Poisson (sin librerías) y se guarda por número de ventas. Ejemplos de la prueba: **2 ventas en 7 días con 4 en tienda → 5,3 a 52,7 días; 1 venta en 9 días
    con 1 → 2,3 a 85,4**; sin ventas o sin stock no hay rango (una agotada ya no tiene días que contar). El rango SIEMPRE rodea a lo que dice la barra (`días = stock × ventana / ventas`):
    el peor caso no pasa de ella.
  - **Qué se ve.** Debajo de la barra de cada fila de «Se está acabando»: **«Vendió 2 en 7 días · puede acabarse en 5 días, o durar hasta 53 días»**. La COTA BAJA es la respuesta (quien
    compra actúa por el peor caso: ley 2 de /formidable, una pregunta, una respuesta); el rango, de detalle, y entero a un toque (tooltip: «Según lo vendido hasta hoy, te puede durar entre 5
    y 53 días»). Ni «Poisson» ni «80 %» ni «intervalo» a la vista (ley 4; lo vigilan las pruebas). Más de un año no se escribe en días («o durar más de un año») y si el rango no se abre
    no se repite el número. La ficha lo dice en una franja: «Puede acabarse en 5 días · Según lo vendido: te puede durar entre 5 y 53 días».
  - **D6: una sola venta.** Sigue en «Comprar» (no se esconde un posible quiebre) pero **no grita**: chip «Una sola venta» (`<Chip tono="ambar">`, con su porqué a un toque), la barra de una
    semana o menos va en ámbar y no en rojo, el agotado va «suave» (rayas y borde ámbar, la palabra en tinta), y en la ficha el chip «Cómpralas» y el «Ya no hay» pasan a ámbar. Lo demás
    no cambia: el rojo de los demás agotados y la escala de urgencia son de A13, y el icono rojo del grupo «Cómpralas» y el camino «Compra» de Qué hacer hoy siguen en rojo (se unifican
    con A13). `grupoDe` no se tocó: nada cae a otro grupo por esto.
  - **Un piso, no un promedio.** `ventanaDeRitmo` divide entre los días desde que se colgó, NO entre los días con stock (Producción sí usa los de stock, mínimo 3). Un modelo que estuvo
    agotado parte de la ventana vende más rápido de lo que dice la pantalla y sus días «que quedan» salen más largos de lo real. El rango cubre el azar de pocas ventas; **no corrige este
    sesgo** (queda escrito en `ventanaDeRitmo` y en `analisis-ritmo.ts`). Tampoco se escala ni se contrae el ritmo: el backtest de la verificación (ritmo del 3 al 9 de octubre contra lo
    vendido del 10 al 16) muestra que la pantalla SOBREstima a los modelos elegidos por sus ventas recientes (+61 % a +78 %), que el factor 1,45 que se sospechaba no existe en los modelos que
    se acaban (0,87) y que el sesgo grande es solo de Arequipa, que registra pocas ventas con prenda. No hay corrección que aplicar: se muestra el rango y decide quien compra.
  - **A15 · Cuánto cuesta esperar.** En las filas agotadas, sin chip rojo: **«Dejas de ganar ~S/ 26 por día»** = `vendidas30 / ventana × (precio sin IGV − costo)`, con el margen del modelo
    (promedio de sus tallas y colores, `analisis-modelo.ts`), y **«última venta hace N días»** (`ultimaVenta`, que ya llega de `fn_analisis_sede`). **Sin el IGV:** el precio de venta de CAYLA lo trae adentro y el costo de compra no (la misma cuenta que «Lo que más rinde», `analisis-rinde.ts`, con `IGV_TASA`); restar el costo del
    precio entero inflaba lo que se deja de ganar en el 15 % del precio, y esa plata es de la SUNAT. Solo con precio Y costo (sin costo no
    se inventa la cifra) y solo con ganancia positiva; por debajo de S/ 1 se escribe a los diez céntimos y por debajo de diez céntimos no se pinta. El monto se escribe con `solesFicha`
    (el espacio de «S/» no se parte, ADR-0413) y lleva «~»: es una estimación. En la ficha, dos tarjetas («Hace 3 días · fue tu última venta», «~S/ 26 por día · dejas de ganar mientras no hay»).
    **Es además el desempate de `ordenSeAcaba`**: primero los días (los agotados con ventas van antes, como siempre), luego el que más deja de ganar por día **con el ritmo en su cota baja** (`margenPrudentePorDia`: el mismo intervalo del rango; sin costo, después de quien sí lo
    tiene), luego el que más vende y por último el nombre. La cota baja es lo que ordena y la cifra puntual es lo que se lee: con una sola venta el ritmo puntual es el menos fiable, y
    ordenar por él hacía que una prenda de UNA venta de S/ 150 de ganancia (5 por día) pasara delante de otra de cuatro ventas de S/ 30 (4 por día), que es premiar al azar (rankear
    con poca muestra); con la cota baja gana la que tiene más base. Solo el desempate: no mueve a nadie de su lugar por plazo ni cambia el grupo. Medido en producción por la crítica del plan: en
    TRU ninguna de 1.236 variantes con stock está sin costo; en los 14 agotados con ventas el margen por unidad va de S/ 19 (p10) a S/ 39 (p90), mediana S/ 26 (medido como precio − costo, con el
    IGV adentro: sin él cada margen baja alrededor del 15 % del precio). No sugiere cantidades (la
    decisión 7 sigue intacta).
  - **Lo descartado.** Multiplicar o encoger el ritmo (×1,45: no hay evidencia, ver arriba); la aproximación normal (límites negativos con 1 o 2 ventas); decir «Poisson», «80 %» o «intervalo
    de confianza» a la vista; mover a «Vigila» lo que tiene una sola venta (la opción 2 de D6: se puede perder el primer síntoma de un hit); exigir un mínimo de ventas para entrar a
    «Comprar» (D14, pendiente); mostrar «dejas de ganar» en lo que todavía tiene stock (lo estás vendiendo); un chip rojo para la pérdida; un control nuevo (el rango va en un tooltip y en la ficha,
    así la huella de la guía no cambia).
  - **Pendiente.** (1) El ADR/tabla «qué ritmo usa cada pantalla» (9 a 10 fórmulas: Producción en `resumen-reglas.ts` con días con stock, Existencias en `existencias-filtros.ts`, Análisis,
    `demanda-reglas.ts`, `piso-plan.ts`, `plan-compra-reglas.ts`, `fn_productos_listado` ÷ 30…), con su enlace desde `docs/datos/15-COMO-OPERA-CAYLA.md`: necesita reservar número de ADR y
    es D9 (Producción contra Análisis); no se hizo aquí. (2) Hoy («Compra» y «Qué hacer hoy») sigue contando y pintando como urgente al agotado de una sola venta (es la escala de urgencia, A13).
    (3) El margen de un modelo agotado es el promedio simple de sus tallas (con stock cero todas pesan igual); una talla muy cara o muy barata lo mueve. (4) D14: el piso de ventas para
    «Comprar» sigue como hoy. (5) **«Ganas por cada una»** de la ficha (`dineroDe`, de la actividad 6) sigue restando el costo del precio entero, con el IGV adentro: en la ficha de un agotado
    conviven dos bases (esa tarjeta y «dejas de ganar», que ya va sin IGV; el tooltip lo dice). Corregirla cambia una cifra ya entregada y es dinero: espera el OK de Felipe.
    (6) El orden por la cota baja es una decisión de ordenar con poca muestra; si Felipe prefiere la cifra puntual, es una línea (`ordenSeAcaba`).
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis-ritmo lib/analisis-reglas lib/analisis-acaba lib/analisis-ficha lib/analisis-a-quien-pedir-pantalla lib/guias`:
    los dos ejemplos (5,3 a 52,7 y 2,3 a 85,4), que los límites cumplen su definición contados aparte (P = 0,1 por cada lado), que el ritmo de la barra siempre cae adentro (1 a 200 ventas,
    ventanas de 7, 17 y 30), que el peor caso nunca pasa de los días de la barra, que más ventas cierran el rango, que no hay NaN con 600 ventas, que el margen quita el IGV (precio S/ 118 y costo S/ 70 dejan S/ 30, no S/ 48) y que la cota baja de ordenar nunca pasa de la cifra que se ve y no deja que una venta de S/ 150 pase delante de cuatro de S/ 30, que una sola venta no pinta rojo (barra,
    agotado, chip de la ficha), que el desempate por margen no cambia el lugar por plazo ni el grupo y que sin costo no hay cifra. En el navegador local: Análisis ▸ Se está acabando con
    filas de 1, 2 y 10 ventas y un agotado, a 1440, 1024 y 375 px, claro y oscuro: la nota bajo la barra, el chip «Una sola venta», «Dejas de ganar» en el agotado, la ficha.

- **F2 · Segundo pase visual: lo ya pedido por tipo, «Llega tarde», una sola cifra por fila y avisos coherentes** (solo web, sin migración; 17-oct). Una compradora ciega (7/10, antes 6/10) y
  el control de calidad (125 capturas a 1440, 1280 y 1024) encontraron lo que los siete commits de la rama habían dejado a medias o creado. Cada hallazgo se comprobó leyendo el código.
  - **Decisión.** (1) **Lo ya pedido es de un TIPO**: se dice una vez por tipo, en una franja `<Aviso tono="info">` dentro de la tarjeta del carril (prop `franja`, entre la cabecera y las filas, así no mueve los
    filtros bajo el mouse: ADR-0185), con «Todos» y «Cómpralas», y en la ficha de sus modelos; nunca pegado a una fila. La regla de qué suma no cambia. (2) **«Llega tarde»** = lo primero que viene llega
    DESPUÉS de los días del peor caso (`rangoDeDias`): la píldora «Por llegar» pasa a ámbar con su segunda línea «Llega tarde · te quedas unos N días sin stock» (N contra la cifra de la barra; si solo
    el peor caso llega tarde, «Puede llegar tarde», sin inventar un número), la franja de la ficha también y el chip dice «Ya viene, pero tarde» SOLO cuando a ese ritmo llega tarde (`unos` > 0); si solo el peor caso la pasa, la franja duda («Puede llegar tarde») y el chip sigue en «Ya viene».
    Solo se afirma con todas las partes con fecha; sin fecha no se dice nada. Mide la PRIMERA parte que llega, no la que cubre el stock. NO cambia en qué filtro cae. (3) **Una cifra por fila**: la barra dice los días y UNA frase («Vendió 2 en 7 días · entre 1 y 13 días»); la ficha junta la cifra y el rango en una tarjeta
    («Te dura ~12 días · entre 8 y 17 días · tienes 6»). Esto reemplaza lo dicho en A5 («puede acabarse en X, o durar hasta Y»). (4) **Ritmo reciente** en la ficha: con 3 o más ventas la última semana y 1,5
    veces el ritmo de la ventana, «La última semana vendiste 4: a ese paso te quedan ~5 días» (`ritmoReciente`); la cifra principal no cambia. (5) **Una ventana por plazo**: «en 23 días, desde que se
    colgó» arriba y «en tus últimos 30 días» abajo. (6) **1280 px**: «dejas de ganar» sale de la columna de píldoras (de 184 px en una de 150) a la nota bajo la barra y, en la ficha, a la bajada de «Ya no
    hay». (7) **Tono**: Hoy usa el de una sola venta (ámbar) y el chip «Cómpralas» de la ficha es rojo solo si se agotó o queda una semana o menos (`UNA_SEMANA`, como la barra). (8) Quitar «Pídelas por
    proveedor» (una función, una pieza), «Faltan 3 tallas o colores», «pídelo aquí» fuera, el proveedor archivado en el chip del modelo, una sola voz y el buscador apagado con la tienda sin leer.
    (9) Compras ▸ Nueva orden: Categoría con 11 rem de mínimo desde 62 rem. (10) El titular de «¿Qué pedir?» de Hoy sin salto escrito a mano.
  - **Lo descartado.** Recortar el vacío sobre «Qué hacer hoy» (sale del alto FIJO del dibujo, una decisión escrita; no de `analisis-hoy.css`: queda como pendiente); subir de 56 a 62 rem el umbral de
    fila de la orden de compra (cambia el aspecto de todas las órdenes en un laptop de 1280); contar N de «llega tarde» contra el peor caso (la pantalla habla de la barra y el tooltip da el peor caso);
    rojo para el chip de 8 a 13 días (el rojo llega hasta 7, `UNA_SEMANA`, como la barra del carril; el brief decía 6 y habría un día en que la barra y el chip no coinciden); decir «tarde» con una parte sin fecha (quizá la que no tiene llega mañana); un botón nuevo para lo ya pedido; sugerir cantidades (la decisión 7 sigue intacta).
  - **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis- lib/guias` (la regla de «llega tarde» en todos sus bordes, la frase única, `ritmoReciente`, `franjaDePedido` y la franja en
    pantalla, la ficha con la cuadrícula de 4, el chip por días, el tono de Hoy y el titular) más `pnpm --filter web typecheck`, `pnpm knip` y `pnpm knip:produccion`. En el navegador local, con la página de ensayo
    de datos inventados: «Se está acabando ▸ Todos / Cómpralas / Ya vienen» a 1440, 1280 y 1024 (claro y oscuro), las fichas de la Camisa, el Bolso, los Aretes y la Capa, Hoy, la tienda sin leer y
    «Nueva orden de compra» con 8 modelos.

### Actualización 2026-10-17 — «Qué pedir» mide contra la campaña real (A6)

- **Qué cambia.** «¿Para cuánto te alcanza?» ya no compara contra un 25-dic fijo. La meta (`lib/analisis-horizonte.ts`, `analisis-campanas-reglas.ts`, solo servidor) es **el fin de la próxima campaña del Plan de campaña si EMPIEZA en 120 días o menos** (si otra campaña se cruza con ella —Diciembre contiene a Navidad—, el fin de la que termina más tarde); si la próxima está más lejos, **el plazo del pedido más un mes**; sin campañas o sin el módulo Plan, el respaldo es el **25-dic** (y pasado el 25-dic, plazo + un mes, no 364 días). La pantalla dice cuál usó (`Horizonte.nota`). Solo cuentan las campañas con plan (`fn_planes_compra`), no el calendario de Etiquetas (Día del Gato dejaría la meta a 14 días). Ninguna función nueva en la base ni cambio a las firmas del Plan.
- **Plazos fijos y visibles (D4).** Un pedido tarda **14 días si todos los modelos del tipo son del Taller y 30 si no** (terceros, o sin saber: lo conservador). Son supuestos en el código (`PLAZO_TALLER_DIAS`, `PLAZO_TERCEROS_DIAS`) y la pantalla lo dice. «Pídelo antes del X» = hoy + lo que te alcanza − el plazo; si ya no se llega, «pídelo ya». En la meta «plazo + un mes» cada tipo mide con SU plazo (44 o 60 días). Sigue sin sugerir cantidades (decisión 7).
- **Temporada (D5).** Una línea más por tipo («con temporada: unos 62 días»), solo si la tienda tiene **3 o más años** comparables en `ventas_historicas` (mediana de cuánto más se vende de hoy a la meta que en los días del ritmo, 5 años; un año sin ventas en alguna de las dos ventanas no cuenta) y la temporada se nota (±5 %). Es de la TIENDA, en soles, no del tipo. AQP y LIM: «sin historia suficiente». La cifra base no se toca. Las lecturas (`analisis-campanas.ts`) piden el módulo Plan de campaña; sin él, se dice.
- **Orden y peso (D13), que revierte el «Más vendido» por defecto del 12-oct.** El orden de fábrica es **«Qué pedir primero»**: la situación (se agotó, no llega, llega, sin ritmo, catálogo incompleto) y, dentro de ella, las unidades vendidas; «Más vendido» y «Se acaba antes» siguen a un toque. Una columna **«Pesa %»** (qué parte de lo vendido es del tipo). El titular de Hoy usa el mismo orden: nombra «Polos y Camisas», no un tipo chico.
- **La fila en pocas líneas (a).** Primera línea lo que se CUENTA («vendiste 56 (6 sin registrar) · tienes 32 + 40 que llegan el 29 oct.»); segunda lo que NO («No cuento 43: 20 atrasadas, 15 sin fecha y 8 después del 31 dic.»; una sola palabra para atrasada y vencida); a la derecha, los días, «pídelo antes del X» y la temporada. Lo del Taller en proceso, lo por repartir y lo que el proveedor debe salen de la fila y quedan en la frase del panel del tipo. Una orden abierta nunca deja un «solo pídelo» (dice «ya hay orden · pídelo antes del…»).
- **Una cifra para «cuánto falta» (b)** (`semanasHasta`, la misma para la tarjeta y el eje) y **el eje hasta la meta × 1,15** con «→ más de N» (i) en lugar del tope de 182 días.
- **Ranking (c).** «Lo que más se vende» usa la MISMA regla de días que «Se está acabando» (`diasQueQuedan`, ≤ 14 días = ámbar) y dice unidades y días («Quedan 3 · 2 días»), no un ✓ verde contra el «2 días» del carril.
- **Honestidad de los datos (d, e, g).** «Lo que más rinde» se calla («Sin dato») donde la mitad o más de lo vendido se cobró sin registrar la prenda (`PARTE_SIN_REGISTRO_QUE_CALLA`); la curva de tallas suma lo vendido sin registrar por la talla anotada en caja y **nunca dice «pide más» con menos de 10 ventas** (`VENTAS_PARA_JUZGAR_SOLA`, el mismo umbral de la vara); un tipo con 0 ventas con prenda (Aretes) sale del titular y dice «Catálogo incompleto». (f) Si casi toda la ventana del ritmo cayó dentro de una campaña del Plan, la lista lo avisa («Ojo: 16 de estos 17 días cayeron en Aniversario…»).
- **Lo descartado.** Que la temporada mueva la cifra base o el «pide» (D5 pide una línea más); usar `productos.temporada` (vacío en el 70 %); medir contra la fecha de la campaña ya empezada (la próxima es la que todavía no empieza); mostrar la temporada por tipo (el historial es por tienda).
- **Pendiente de Felipe.** El rojo (¿solo «Se agotó» y ≤ 3 días?), si una llegada atrasada vuelve a «Cómpralas», si un envío sin fecha sigue sumando, el verbo pedir/traer, «CAYLA SAC» (¿Taller o maquila?).
- **Cómo se verifica.** `pnpm --filter web exec vitest run lib/analisis-` (horizonte, campañas, temporada y los casos de A6 en `analisis-pedir-a6.test.ts`) más `typecheck`, `knip` y `knip:produccion`. **Sin correr (no hay Postgres ni navegador en la nube):** `pnpm pruebas:analisis-lecturas`, el pase visual con datos inventados a 1440 y 1024 px, `tema:auditar`, `guias:recorrer` y `/chaos`.
- **Lo que arregló la revisión independiente de A6 (dos revisores, 2026-10-17).** (1) Una campaña **en curso** sirve de meta si termina después de lo más pronto que llega un pedido (`PLAZO_TALLER_DIAS`): el 12-dic, Diciembre (hasta el 31) y no el 25-dic de Navidad; Aniversario con 4 días por delante no sirve. (2) La meta **nunca pasa de 120 días**: un plan «Anual» ni se elige ni estira a otra. (3) La temporada y la base de cada año quedan pegadas (en un 29-feb se perdía o se contaba dos veces un día). (4) La curva de tallas ya no esconde lo vendido sin registrar: un tipo de talla estándar con ventas anotadas por talla (el caso de Arequipa) ahora tiene curva; sin tipo elegido no cuenta tipos que la tienda no tiene; una talla de otro sistema no abre una columna. (5) El plazo de la ficha es el del TIPO, el mismo que en «Qué pedir». (6) La frase del panel y la fila dicen lo mismo del eje («más de 12 semanas»), una orden abierta no dice «pídelo ya» («ya hay orden: mírala antes de pedir») y una temporada que contradice a la fila lo dice («con ella no llegaría»). (7) La fila se recorta a 1 renglón por línea (2 en una lista ancha), con el texto entero en el `title`.

### Actualización 2026-10-17 — Sin días fijos: «Todavía sin ritmo» y se retira «Liquidar desde» (B1)

- **Qué cambia.** «Liquidar desde» (el número de días de toda la red; 60 de fábrica, 7 de hoy) **se retira**: la hoja, el botón, la caja con − y +, el borrador que movía Hoy, «Probando N días, sin guardar» y la guía de ese control. La web deja de llamar `fn_liquidar_desde` y `guardar_liquidar_desde`. Felipe, que lo repitió dos veces: «no es lo mismo un polo que un jean», **nunca un número fijo de días**.
- **La regla.** Una prenda quieta se juzga **solo** contra lo que tarda en venderse su tipo (la vara de Frescura: `varaQueJuzgo`, `VENTAS_PARA_JUZGAR_SOLA = 10`, P75 para «Vigílalas» y P90 para «Mándalas» o «Liquidar»), y solo si el tipo tiene vara suficiente (10 ventas con edad conocida y P75/P90 calculables). Sin vara, **no hay respaldo en días**: el modelo quieto queda en el grupo nuevo **«Todavía sin ritmo»** (`GrupoAnalisis = "sin_ritmo"`, nombre distinto del «Aún no se sabe» de ventas sin registrar, tono pizarra, ícono de reloj): ni se rebaja, ni se manda, ni se vigila por ahora.
- **Cuándo se rotula.** Solo cuando el modelo ya lleva en el piso **lo que tardó en venderse la mitad de su tipo (P50)** o, si ni la mitad se vendió, **lo que tardó la venta más lenta vista de su tipo** (ninguna de las que sí se vendieron tardó tanto; `VaraCategoria.ultimaVentaSeg`, un campo opcional y aditivo que se sumó al mapeo de Frescura; ningún cálculo de Frescura lo usa). Un tipo sin ninguna venta no rotula (no hay con qué comparar). Sin Frescura (el rol no la ve, falló o la sede no separa piso) toda quieta va al **mismo grupo con su razón** («No se pudo leer cuánto tarda en venderse su tipo…»), nunca a «Liquidar». Cada fila dice por qué en una frase de tienda («Su tipo todavía no tiene ventas suficientes para saber cuánto tarda en venderse: ni se rebaja ni se manda por ahora; vendió 7 de 35 de los que colgaste») y la ficha lo repite.
- **Lo que se queda.** La regla «lo que vendió algo en 30 días no está quieto» (`vendidas30 > 0`): Felipe la dejó por ahora y se decide con 30 días de historia, hacia el **30-oct** (comentario en `grupoDe`). Sin cambios en `Frescura`, mandar/enviar (B2), «Sobra» (B3) ni los avisos de carga (B4).
- **Efecto esperado hoy en TRU (reconstrucción aproximada de los analistas, 17-oct).** «Liquidar» baja de 9 modelos y 53 unidades a **0** (los 9 eran de tipos sin vara: Jeans, Casacas, Carteras, Blazers, Vestidos); «Vigílalas» queda igual (5 modelos: Pantalones y Tops); «Todavía sin ritmo» recibe unos 8 modelos y 58 unidades (los que ya llevan lo que tarda la mitad de su tipo). **«Liquidar» vacío en TRU durante 2 a 4 semanas es lo esperado** (hasta ~1-nov, cuando se congele la vara de octubre) y Felipe lo aceptó: la pantalla lo dice con la pieza `<Vacio>` («Todavía no se puede saber qué liquidar»), nunca con «Todo se mueve». Cómo se prueba: `analisis-reglas.test.ts` (tipo con vara y sin vara, P50 no alcanzado, tipo sin ventas, sin Frescura, vendió algo en 30 días, límites 29/30 y 59/60) y `analisis-vara.test.ts` (Polos P75 13 y P90 22 contra Jeans sin vara).
- **El carril.** El eje se alarga hasta el escalón de «Liquidar» más largo de los tipos que lo tienen (antes, el número fijo); la marca «Liquidar» solo aparece si todas las filas con escalón la comparten; una fila sin ritmo no dibuja zona de liquidar (solo la de 3 meses). La tarjeta de Hoy dice cuántos modelos quedaron «todavía sin ritmo».
- **Sin base.** No hay migración. La tabla `parametros_analisis`, `fn_liquidar_desde` y `guardar_liquidar_desde` quedan **sin llamador**: retirarlas es una migración futura de Felipe. `pnpm pruebas:roles-cobertura` puede marcar `guardar_liquidar_desde` como función a la que no se llega; se corre en una sesión local (no hay Postgres en la nube) y, si la marca, la limpieza va en esa migración.
- **Lo que arregló la revisión independiente de B1 (dos revisores, 2026-10-17).** (1) Lo quieto de un tipo que no vendió nada ya no desaparece sin decirlo: la pestaña lo cuenta aparte («3 modelos quietos son de tipos que todavía no vendieron nada: no hay con qué compararlos»). (2) Una prenda sin categoría también cruza con la vara de «Sin categoría» de Frescura. (3) Con Frescura sin leer, Hoy y la franja de «Liquidar» dicen «No se pudo ver cuánto tarda en venderse cada tipo» y no que el tipo vendió poco. (4) La razón de cada fila habla de su TIPO («Su tipo vendió 7 de 35…»), en una versión corta para la fila y una larga para la ficha. (5) Un tipo sin ritmo ya no se pinta en rojo ni en ámbar, por viejo que sea. (6) «Liquidar» vacío dice a qué escalón se refiere («lo que tardan 9 de cada 10 de su tipo»). Pendiente: el contador de la pestaña «No se vende» no cuenta «Todavía sin ritmo» (no hay nada que hacer con ellos); con Frescura caído la pestaña puede mostrar 0 mientras el carril lista modelos sin ritmo.

### Actualización 2026-10-17 — «Mándalas» y «Enviar» dicen la verdad y una tienda sin leer no cuenta como cero (B2)

- **Qué cambia (decididas por el orquestador con la recomendación del plan, D10 y D7; Felipe puede cambiar una constante cada una, todas en `lib/analisis-enviar.ts`).**
  1. **A qué tienda se manda.** Una tienda que se LEYÓ, que vendió 2 o más en 30 días (`VENDIDAS_PARA_ENVIAR`) **y a la que le queda poca cobertura**: menos de 30 días de stock a su propio ritmo (`COBERTURA_DESTINO_DIAS`; `stock ÷ (vendidas ÷ 30)`). Si ya tiene de sobra, no se le manda más: ese modelo se liquida aquí. **Lo que viene en camino a esa tienda todavía no se lee** (Análisis solo lee lo que llega a la mía): pendiente anotado en el backlog. Entre dos destinos con la misma venta, la que tiene **menos** stock (antes, la que más tenía), y después el id, para que no cambie de un día a otro.
  2. **Qué lleva el envío.** Solo las tallas y colores que el destino VENDIÓ (antes «una de cada talla») y que están en el **almacén**: Traslados solo saca del almacén (`traslados/nuevo/page.tsx` descarta el resto en silencio), así que antes el botón abría un traslado con menos líneas que las anunciadas o vacío. El botón y la fila dicen cuántas se pueden mandar hoy («Puedes mandar 3 de 12: las otras están en el piso, sácalas primero»); con 0 movibles el botón no se ofrece y se dice por qué («Sácala del piso primero»). Sin cantidades (decisión 7).
  3. **Una tienda que no se pudo leer** (`PrendaEnOtraSede.sinLeer`, que sale de `sedesSinLeer` de A14 y el modelo hereda): sus 0 son «no se sabe», no «allá no se vende». No es destino; lo que iba a «Liquidar» por no haber a quién mandárselo queda en **«Aún no se sabe»** con su razón («No se pudo leer Arequipa: no se sabe si allá se vende»), y «Registrar ventas» solo se ofrece si alguna fila tiene de verdad una venta sin registrar. La ficha dice «No se pudo leer Arequipa» en vez de «no tiene este modelo». Si OTRA tienda ya es un buen destino, se manda a esa: lo que no se leyó no cambia lo que sí se sabe.
  4. **Texto.** «Cuánto rebajar lo eliges en Etiquetas» no era cierto (Etiquetas no tiene un selector de rebaja): «Liquidar» abre las etiquetas de esas prendas y el precio se fija en Catálogo ▸ Etiquetas; la ficha dice «el precio lo fijas en Etiquetas».
- **Qué no se tocó.** Traslados (se le abre con menos líneas), Compras, el verbo «pedir» contra «traer» (pendiente de Felipe). `sedeQueMasVende` se retiró: nadie más la usaba.
- **Cómo se verifica.** `analisis-enviar.test.ts` (cobertura, destino, empates, tienda sin leer, qué lleva el envío y cuántas se pueden mandar), `analisis-reglas.test.ts` (grupos con tienda sin leer), `analisis-acciones.test.ts`, `analisis-ficha.test.ts`, `analisis-hoy.test.ts`. Sin correr (no hay Postgres ni navegador en la nube): el pase visual del carril con el botón «Enviar» a 1440/1024 y `/chaos` sobre «Enviar» (abre un traslado en una pantalla que guarda).
