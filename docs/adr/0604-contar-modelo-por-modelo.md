# ADR-0604 · Contar modelo por modelo, con cada categoría una sola vez

- **Fecha:** 2026-11-02 · **Estado:** construido y probado en local (base local con datos inventados). Sin migración. Sin tocar ninguna RPC. Sin publicar.
- **Decide:** Felipe, 2026-11-02: «agrupar por categorías sin que se repitan; al desplegar, cada producto uno por uno para contar modelo por modelo; filtrar por
  proveedor o marca; achicar la placa del contador y poner a su derecha las prendas que se especificaron o se parecen; y a la mano derecha, los papeles de la compra».
  Ante la pregunta de qué cuenta el Dial, eligió **el modelo**. Después, mirando la pantalla: «quita los papeles: ocupan espacio y repiten lo de la izquierda; que solo haya un botón
  “Subir foto de facturas” que abra el modal», «haz las pruebas con más prendas y cantidades mucho más grandes» y «quita la barra de estado que está arriba del contador y mejoremos la
  de abajo: todo el contenido sube y se puede reubicar el botón de las fotos». Y al final: «mucho menos ancho el contador y más espacio a las categorías, para ver todo lo que indicó
  Compras; y que la placa y las categorías estén alineadas», seguido de «más equilibrado, no tan exagerado lo de las categorías; ordenar por cantidad con flechas; y que la categoría se
  pueda plegar al tocar su pestaña».
- **Toca:** ADR-0393 (contar primero, un número por categoría) y ADR-0575 (decisión 2, «el acordeón solo desglosa»): esta decisión las cambia en eso. Lo demás de ellas sigue.
- **Actualización (c), 2026-11-03:** el costo a la vista, el número que no se transforma, abrir una categoría sin mover lo que se cuenta, Cerrar más corto, lo decidido que sobrevive a recargar y «Nos debe» por prenda. Esta sí lleva una migración (`20261103144000`, solo funciones), sin aplicar en producción. Ver «Lo que se pidió al usarla», al final.
- **Actualización (b), misma fecha:** Contar pasó a tres columnas, a partir del boceto de Felipe. Ver «Tres columnas y el resumen», al final: **lo que diga esa sección manda sobre la tabla de abajo** (la mesa, la barra de abajo y la hoja de tallas ya no son como dice esa tabla).

## El problema primero

La persona tiene una prenda en la mano y sabe qué modelo es. La pantalla le pedía primero un número por categoría y después, en otra tarjeta más abajo, que dijera qué modelos
eran esas prendas: dos pasadas para lo mismo. Además una categoría salía repetida si el envío traía dos proveedores o marcas (el grupo es proveedor + categoría + marca), no se
podía mirar solo lo de un proveedor al abrir su fardo, y junto al Dial había un espacio vacío mientras lo que había que mirar quedaba bajo el pliegue.

## Qué se decidió

| Pieza | Antes | Ahora | Archivo |
|---|---|---|---|
| Lista de la izquierda | Una fila por proveedor + categoría + marca | Cada categoría una vez; al abrirla, sus modelos uno por uno, y cada fila dice de qué proveedor y marca si hay más de uno | `CategoriasAcordeon.tsx` |
| Filtro | No había | Proveedor y Marca (`DesplegablePildora`), solo si el envío trae más de uno; cada filtro ofrece lo que queda con el otro puesto | `CategoriasAcordeon.tsx` |
| El Dial | Contaba la categoría | Cuenta el modelo elegido; la categoría suma sola | `ContarEnvio.tsx` |
| El reparto | Categorías en una columna de 300 px y la placa con el resto | **3/5 las categorías y 2/5 la placa**, con 400 px como mínimo (340 con la mesa bajo 940 px). Los modelos de la abierta van en columnas de 18 rem o más (2 a 1440, 3 a 1920), con el nombre hasta en 2 líneas y el proveedor y la marca en su propia línea. Primero se probó la placa fija en 400 px: a 1784 px las categorías quedaban en 1.340 px y Felipe lo vio exagerado | `recepcion-viva.css`, `CategoriasAcordeon.tsx` |
| La alineación | La placa empezaba a la altura del título «Categorías» y la primera categoría, 69 px más abajo | El título y los filtros van en su propia fila, encima de las dos columnas: **la primera categoría y la placa empiezan a la misma altura** | `FiltrosDelEnvio`, `ContarEnvio.tsx` |
| El orden | Solo el de la compra | Dos flechas junto a los filtros (`SegmentoDeslizante forma="modo"`, la pieza de «modo y ordenar»): ↑ de menos a más, ↓ de más a menos, para categorías y modelos; tocar la puesta vuelve al orden de la compra. «Listo, sigue» y «Falta: …» siguen el orden que se ve | `categoriasEnOrden`, `FiltrosDelEnvio` |
| Plegar | La categoría de lo que se cuenta no se podía cerrar: el clic no hacía nada, aunque su flecha lo invitaba | Tocar su pestaña la pliega y la abre, sin cambiar lo que está en el Dial. Al pasar a contar otra cosa (o al tocar un «Falta: …» de ella) se abre sola | `CategoriasAcordeon.tsx`, `ContarEnvio.tsx` |
| La placa | Dial con un espacio libre a la derecha y «¿Qué … son?» en otra tarjeta abajo | Dial de 192 px con sus atajos. Bajo 500 px de placa, los atajos van al lado del Dial y lo demás debajo; desde ahí, las tallas, las que se parecen y el buscador van a su derecha. **«En la compra» se fue de la placa:** era la misma lista que la izquierda, y su foto pasó a cada tarjeta de modelo | `PrendasDeLaPlaca.tsx`, `recepcion-viva.css` |
| Los papeles | Columna fija de 25 rem con «Lo que anotó» | **Un solo botón en la cabecera, «Subir foto de facturas»**, que abre una hoja con los papeles; «Lo que anotó» se fue porque repetía la izquierda. Con todas las fotos subidas, dice «Ver fotos de facturas» | `PapelesDeLaCompra.tsx` |
| Los pasos de arriba | «1 Contar — 2 Cerrar» en una fila propia, en Contar, Cerrar y Cerrado | **Se fueron.** En qué va el envío lo dice el Trayecto; a Cerrar se pasa desde la barra de abajo y se vuelve con la flecha de su pie. `PasosConteo` sigue en Conteo y en Cuadre del piso | `RecibirContando.tsx` |
| La cabecera | El botón de las fotos en una fila propia bajo el título | El botón y el Trayecto van en la fila del título; desde 1440 px dice la frase entera y antes «Facturas». El Trayecto toma lo que queda, de 20 a 26 rem. Así, a 1440 px la placa empieza a 212 px de arriba | `RecibirContando.tsx`, `PapelesDeLaCompra.tsx` |
| La barra de abajo | «Anterior» escrito, tres cifras sueltas (Dijeron, Contadas, Identificadas), chip y un hilo fino | La flecha redonda de `<Volver>` (la pieza de todo paso a paso), «Contadas 114,447 de 114,447», «Modelos 74 de 74», el chip de si cuadra y `<BarraApilada>` en vez de un hilo a mano: verde lo identificado, tinta lo contado que falta identificar. «N sin identificar» solo sale si falta algo: contando por modelo es lo mismo que lo contado | `ContarEnvio.tsx`, `recepcion-viva.css` |
| Con muchas prendas | — | La lista de la categoría abierta lleva su propio scroll; la placa no crece (544 px sin contar, 638 con lo contado) y se queda a la vista al bajar; el pie de la guía lista 4 y cuenta el resto | `recepcion-viva.css`, `FaltanDelPaso` |
| Con cifras grandes | El número se escribía hasta 4 cifras y se salía del aro | Hasta 5 cifras (lo que acepta la base); el número se achica para caber; miles separados; los atajos van a la escala (+5/+10 hasta +100/+500) | `leerContadas`, `atajosDelDial` |

## Por qué así (y por qué Dial = modelo)

**La base no cambia, porque ya guardaba esto.** `despacho_conteos` tiene una fila por línea de la compra, y lo separado ya lleva la cantidad exacta por prenda. Contar un modelo es
escribir esa cantidad en su línea: contar es identificar. Por eso Cerrar, el Podio, los reclamos y «Hacer ahora» no se enteran.

**«Categoría» es solo una vista.** `agruparLineas` sigue juntando por proveedor + categoría + marca, y `categoriasDelEnvio` (`lib/recepcion-modelos-reglas.ts`) arma encima la
categoría sin repetir. Cada modelo sigue siendo de un grupo. Si el Dial contara la categoría, juntar dos proveedores obligaría a repartir un total entre ellos en el orden de la
compra, y un faltante podría quedar en el proveedor equivocado; contando el modelo no hay nada que repartir.

**Solo se escribe la línea del modelo que se tocó.** Las demás líneas sin contar siguen sin fila: la guía de foco puede pedir cada modelo y «por contar» no se confunde con «no
llegó». Por eso «No llegó nada» guarda la línea en 0, y eso sí queda dicho.

**Lo contado sigue a los modelos** (`repartirCambio`): si un modelo baja, baja el total; si sube, primero usa lo que estaba contado sin saber qué era y recién después sube el total.

**El orden va por lo que anotó Compras, no por lo contado.** Lo anotado no cambia mientras se cuenta; ordenar por lo contado movería la fila bajo el dedo de quien está contando. Lo que Compras no anotó (sin aviso, fuera de la guía) va por lo contado.

**La misma prenda en dos líneas se reparte entre ellas** (`partirEntreSusLineas`): en el orden de la compra hasta lo que dijo cada una, y lo que sobra a la última. Lo destapó la prueba de
volumen: una línea quedaba con todo y la otra en 0, y «Cerrar» pedía explicar un faltante y un sobrante que no existían, aunque el modelo cuadrara.

## Lo que sigue funcionando como un total

Lo que no tiene modelo anotado (un envío sin aviso, lo de fuera de la guía, una compra que no dijo qué prendas eran, o que anotó solo una parte) se cuenta como antes: el Dial con
«Total de Vestidos» y después se identifica. `necesitaTotal` lo decide. La regla de ADR-0393 no se movió: **sin identificar toda prenda contada no se pasa a «Cerrar»**.

## Lo que queda dicho (límites)

1. **Envíos a medias con un número de antes.** El flujo anterior guardaba una fila en todas las líneas del grupo al primer toque, y un 0 ahí no significa «no llegó». Mientras quede
   algo contado sin identificar, el modelo dice «Por contar». Pero al identificar lo último, un modelo que quedó en 0 dice «No llegó» aunque nadie lo haya dicho. No hay cómo
   distinguirlo sin una marca nueva en la base y no vale una migración: al cerrar sale como faltante y pide su causa, que es la red de seguridad.
2. **Cerrar sigue por proveedor + categoría + marca.** Solo Contar junta las categorías. Si Felipe quiere lo mismo en Cerrar, es otra decisión (ahí cada causa y cada costo son por línea).
   Aguanta el volumen sin errores. Con 75 líneas son 54 filas: medía casi 16.000 px hasta que lo que cuadra quedó plegado (actualización (c)); ahora, unos 2.200.
3. **A 1024 px la placa mide 340 px** y los atajos bajan bajo el Dial; las categorías quedan en una columna. A 1280 px la placa sigue en 400 y los modelos van en una sola columna, para que se lea el nombre entero.
4. **Una prenda en dos líneas con tallas puestas** vuelve a quedar entera en la primera línea (`repartirOtroCambio`): las tallas no se reparten. Es raro y la red es la misma: al cerrar lo pregunta.
5. **«Se parecen» compara palabras** del nombre contra hasta 30 prendas de esa categoría y marca (`fn_prendas_para_recibir`). Es una ayuda, no un dato: si la lectura falla, la
   placa sigue sin esa fila. Las fotos de las tarjetas salen de la misma lectura: un modelo fuera de esas 30 dibuja su prenda sin foto.

## Lo que se rompería sin esto / al tocarlo

- `lib/recepcion-modelos-reglas.ts` es la única definición de categoría, modelo, parada, filtro y guía; su prueba incluye una secuencia de toques que exige que **ninguna línea quede
  con lo separado por encima de lo contado** (el CHECK `separado_cabe` de la base) y que todo siga identificado.
- Reemplaza a `lib/recepcion-acordeon-reglas.ts`, `camposDelConteoPorGrupo`, `anotadasPorSepararDelGrupo` y `avisoDePrendasAgregadas`, que se borraron.
- `SepararPrendas` queda solo para «Hacer ahora» (lo cerrado), que sigue identificando con filas y cantidades.

## Cómo se verificó

Con un navegador sin ventana contra el ERP local: tocar modelos, «Llegaron las N», «Listo, sigue», doble clic y toques seguidos, escribir el número, Escape, recargar, sumar una parecida,
anotar una nueva, las sin nombre, tallas y pasar a Cerrar; filtro por marca con dos marcas (con datos temporales que se devolvieron); dos pestañas sobre el mismo modelo, corte de red y
recargar a mitad de un guardado. Sin errores en la página y sin filas inválidas. 375, 1024, 1280, 1440 y 1920 px sin desborde; claro y oscuro. Guía interactiva recorrida (15 pasos, sin
escribir nada), `/focus` y `/sugerir` conformes. Sin los pasos de arriba y con la barra nueva: las mismas medidas, más Cerrar y Cerrado a 1280 y 1440 px, y la guía recorrida de nuevo (13 pasos).
Con el reparto de 3/5 y 2/5: 375, 1024, 1280, 1440, 1784, 1920 y 2560 px sin desborde; la primera categoría y la placa miden la misma altura desde 1024 px; plegar, abrir y ordenar con mouse y teclado, y «Listo, sigue» en el orden elegido, sin una sola escritura en la red; la fila activa no queda detrás de la barra; guía recorrida.

**Volumen (a pedido de Felipe):** un envío de prueba de 75 líneas, 114.447 prendas, 11 categorías, 3 proveedores, 3 marcas y hasta 12.000 de un modelo. Se contó entero con «Listo, sigue» (74 paradas);
las 75 filas quedaron en la base con la suma exacta; cada toque responde en unos 19 ms; se escribió 12.000 y el tope de 99.999; la base aceptó el cierre sin mover stock. Antes de corregirlo, ese mismo envío
daba un pie de guía de 74 chips, una placa de 1.184 px, el Dial fuera de la vista al bajar y números que no cabían en el aro. **Falta:** el recorrido formal de `/chaos` y `/formidable`, y probarlo con quien recibe de verdad.

## Tres columnas y el resumen (actualización (b), Felipe 2026-11-02)

Felipe pasó un boceto y pidió una maqueta para decidir (`docs/maquetas/recibir-boceto-2026-11/`). Mirándola pidió: las categorías con otro color, barras que cambien de color al llenarse, mejores botones en el contador, quitar y agregar tallas empezando por las de siempre, y «Anterior» y «Listo, siguiente» sin el nombre de la prenda. Y después: «termina, pásalo a local». Sin migración ni RPC nueva.

| Pieza | Antes | Ahora | Archivo |
|---|---|---|---|
| La mesa | Dos columnas y la barra de abajo | **Tres columnas alineadas arriba y abajo, cada una con su scroll, hasta el borde de la ventana:** la lista, lo que se cuenta y el resumen. Bajo 1.040 px de pantalla, dos columnas con el resumen en una tira arriba; bajo 680, una columna con el resumen al final | `ContarEnvio.tsx`, `vidrio/recibir-mesa.css` |
| Re stock y Producto nuevo | No había | **Dos tarjetas arriba.** No se le pregunta a nadie: lo dice lo que anotó Compras (`tipoDeParada`). Siempre marcan el tipo de lo que se cuenta; al tocar una, la lista deja solo esas, con su filtro que se quita. En un envío sin aviso no salen: todavía no se sabe | `TiposDelEnvio.tsx` |
| El resumen | La barra de abajo | Dijeron, Contaste, la diferencia de lo ya contado, el avance, cuatro filas de estado que filtran la lista, «Falta: …», quién cuenta, las fotos y «Pasar a cerrar». Es siempre de todo el envío (`cifrasDelResumen`). Sin aviso se va lo que depende de lo que dijeron | `ResumenDelEnvio.tsx` |
| La lista | Título y filtros encima de las dos columnas | Título, **buscador** (modelo, código, proveedor o marca, sin tildes), Proveedor, Marca y las flechas. Las categorías, en una banda pizarra para no confundirse con sus modelos; la abierta se queda pegada arriba. Buscando o filtrando por estado, todas abiertas | `CategoriasAcordeon.tsx` |
| Lo que se cuenta | Dial con sus atajos y las prendas al lado | Foto, nombre, chips, y a la derecha quién contó, «¿Llegó otra cosa?» y «Anotar observación». Debajo el Dial, Dijeron / Contaste / Diferencia y los atajos: sumar en su bandeja, «Llegaron las N» en verde (se apaga en su lugar) y «No llegó nada» callado | `PlacaDelModelo.tsx` |
| Pasar al siguiente | La barra de abajo, con el nombre de la prenda | «Anterior» y «Listo, siguiente», iguales y con su flecha; el nombre va en su `title`. Con el último de la lista, «Pasar a cerrar». **Enter en el número guarda y pasa al siguiente con su número abierto**: se cuenta sin soltar el teclado | `PlacaDelModelo.tsx`, `Dial.tsx` |
| Tallas y colores | Una hoja | **En la misma pantalla**, con «¿Qué deseas hacer?» (solo cuadrar, o tallas ahora). Una nueva primero se crea con la hoja de siempre y vuelve aquí | `TallasDeLaPlaca.tsx`, `lib/recepcion-tallas-reglas.ts` |
| «¿Llegó otra cosa?» | A la vista | Plegado. Lo que falta decir (sin nombre, contado sin identificar) se ve igual. Una parecida que ya está en la lista con otro proveedor lleva a ese modelo, en vez de sumar otro | `PrendasDeLaPlaca.tsx` |
| El color del avance | Tinta, y verde al final | **De rojo a ámbar y a verde, de a poco** (`colorDeAvance`, en barras y en el Trayecto). Token nuevo `--color-avance-medio`: el ámbar del sistema es un marrón hecho para texto y en un relleno no se distingue del verde. Una categoría toda contada que no cuadra se queda en ámbar. El aro del Dial no cambia | `lib/avance-color.ts`, `BarraAvance.tsx` |
| La cabecera | Fotos y Trayecto | Al contar, solo el Trayecto, con el nombre de sus cinco paradas si caben, y el número del envío en la línea de arriba. Las fotos pasan al resumen; al cerrar y ya cerrado siguen arriba | `RecibirContando.tsx` |

**Qué se guarda de la tabla, y cuándo.** En la base, las tallas de una prenda siempre suman su cantidad. Por eso lo escrito se guarda **solo cuando reparte justo lo contado**, y mientras tanto espera en la pantalla diciendo «Faltan N por repartir»; «Dejar N como lo contado» lo resuelve para el otro lado. Si lo guardado deja de ser lo que se ve (se corrigió una celda, se cambió el número), **se suelta**: la pantalla nunca contradice a la base. Lo peor que pasa es que ese modelo entra al almacén sin tallas y se termina después, que es el lado seguro. Lo escrito y sin cuadrar se pierde al recargar. **Soltarlas no cierra la tabla (corregido el 2026-11-03):** un modelo que venía con tallas guardadas estaba en «ahora» solo porque las tenía, así que al soltarlas pasaba a «después» y la tabla se cerraba en la primera tecla. Ahora el cambio deja dicho el modo (`modosAlCambiar`), y cambiar el número parte de lo guardado (`tablaParaElNumero`).

**Quitar solo esconde.** Una talla o un color quitado limpia lo escrito en esa fila o columna y ofrece «Deshacer», sin preguntar; nunca borra una variante del catálogo. Agregar lo que la prenda ya tiene lo vuelve a mostrar; lo que no tiene abre la hoja de siempre (`preparar_prenda_al_recibir`) con esa talla o color ya marcados. **No se ofrecen tallas que la categoría no ofrece:** no hay un permiso nuevo. Cuál es «de siempre» ya existe: `categoria_tallas.habitual`.

**Lo que se está contando no se va de la lista.** Con «Por contar» puesto, sumarle una lo sacaría del filtro y el contador saltaría bajo el dedo: se queda hasta pasar al siguiente (`categoriasDelFiltro`, `retener`).

**«Anterior» con palabra es una excepción a `accion.anterior`,** por decisión de Felipe y solo en esta pantalla: «volver solo es una flecha» sigue valiendo en el resto del ERP (`docs/unificar/accion.anterior.md`).

**Reabrir (lo destapó la revisión de `/formidable`).** Lo que entra al stock al cerrar sale de lo separado, así que al reabrir el modelo decía «0 de 48 · Por contar» y «Llegaron las 48» lo contaba otra vez: al volver a cerrar habría entrado dos veces. Ahora lo que ya entró es del modelo de su línea (`ModeloDelConteo.enStock`): cuenta en lo contado, es su piso, no vuelve a lo separado (`cantidadDeModelo`) y la tabla reparte solo lo que queda. Se probó cerrando, reabriendo, sumando 5 y cerrando otra vez: entra lo contado, sin doble cuenta.

**De quién es lo que entra (ADR-0542).** Cerrar con tallas en una sede con dos empresas no se podía: la base pide el dueño y Cerrar no lo preguntaba. Ahora lo pregunta si algo entra al stock. Lo que queda para después lo sigue preguntando «Hacer ahora».

**Quién cuenta se recuerda por envío** (`recordarEn`, como el Conteo): en una terminal se vaciaba tras cada guardado, y contar modelo por modelo lo habría pedido a cada toque. Si falta, se elige en la misma placa, antes de contar.

### Límites que quedan

6. **Una celda llega hasta 9.999** (`leerCantidad`, la misma regla de la hoja de tallas). Un modelo con más de 9.999 de una sola talla y un solo color no se puede repartir aquí ni en la hoja: queda con la cantidad y sin tallas.
7. **Lo escrito en la tabla es de esta pestaña.** Si otra persona guarda otras tallas del mismo modelo, esta pantalla no se entera hasta recargar; al cuadrar, gana el último, como en todo el conteo.

## Lo que se pidió al usarla (actualización (c), Felipe 2026-11-03)

Felipe contestó si quien recibe ve el costo («sí, debe poder ver el costo de la prenda en el detalle superior») y eligió de la lista de pendientes. La migración se pegó en producción el 2026-11-03, con su OK.

| Qué | Antes | Ahora | Dónde |
|---|---|---|---|
| El costo | No se veía al contar | **Un chip en la cabecera de lo que se cuenta: «Costo S/ 30.00»**, para todo el que recibe. Es el costo propio de la prenda o el de su línea, lo mismo con lo que abre Cerrar; con dos líneas a distinto costo, «S/ 30.00 a S/ 35.00». Lo que no tiene costo no dice nada. También volvió a la hoja de crear prenda | `costoDeLaParada` |
| El número | «1.5» guardaba 15, «-5» guardaba 5, «1e3» guardaba 13 y «99999999» se cortaba en 99,999, sin avisar | **Lo que no es una cantidad no se guarda ni se transforma:** se queda en la caja, Enter no pasa al siguiente y bajo el número dice «Solo números enteros» o «Hasta 99,999 por modelo». Al salir de la caja vuelve a lo que había, y lo dice. «12,000» sigue siendo doce mil | `leerContadas` |
| Abrir una categoría | Abrirla ponía a contar su primer modelo: a la prueba ciega la sorprendió | **Abrir o plegar no cambia lo que se cuenta;** cambia al tocar un modelo. Al pasar a contar otra cosa, la de antes vuelve a plegarse si no se abrió a mano | `categoriaAbierta` |
| «¿Era otra prenda?» | La prueba ciega no lo entendió | **«Cambiar de prenda»** | `TallasDeLaPlaca` |
| Las cifras | La misma cifra salía hasta cuatro veces | **Se fueron las tres cifras junto al aro** (el aro ya dice cuánto se contó y de cuánto; el estado de arriba, cuánto falta) **y «N de M» bajo el Trayecto al contar** (lo dice el resumen). Se quedan la barra del resumen y las de las tarjetas: las pidió Felipe para ver el color | `PlacaDelModelo` |
| Cerrar | 54 filas, casi 16.000 px | **Primero lo que pide una decisión.** Con más de 6 filas, lo que cuadra queda plegado («Ver las 46 que cuadran»; si algo adentro cambió, lo dice) y sus precios nacen cerrados. Con pocas, todo como siempre. Contestar no mueve la fila. Un costo atípico o un precio rechazado abren lo que haga falta | `filasDelCierre` |
| Lo decidido en Cerrar | Un F5 lo borraba | **Se guarda en ese navegador hasta cerrar:** causas, costos, precios, nota, guía, proveedor y dueño. Al recargar se vuelve a Cerrar y dice «Lo que habías decidido sigue aquí», con «Empezar de cero» (que se puede deshacer) | `lib/recepcion-cierre-borrador.ts` |
| «Nos debe» | Hablaba por categoría y marca | **Dice qué prenda se debe** («2 Vestido Lima · CAYLA») en la ficha, en el aviso de la orden nueva y al cerrar; y **la reposición salda primero esa prenda**, después de la más antigua a la más nueva | migración `20261103144000` |

**Quién ve el costo (decisión de Felipe).** Quien recibe lo ve, aunque no vea el dinero de Compras: es con lo que revisa si lo que llegó es lo que se pagó. Ya se lo daba Cerrar. Sigue igual lo de un envío sin aviso: lo de fuera de la guía no trae costo de ninguna orden y solo lo escribe quien ve ese dinero.

**El borrador contradice a ADR-0129, a propósito.** Ahí Felipe quitó un borrador en el navegador del formulario viejo de Recibir, el mismo día que se construyó. Este es de otra pantalla y de otra cosa: lo contado sigue yendo a la base, solo; lo que se guarda aquí es lo que todavía no vale hasta cerrar. Lo pidió mirando lo que costaba. Guarda solo lo que la persona cambió (si la base trae otro costo mañana, manda la base), no guarda la confirmación de un costo atípico, y no sobrevive a un cierre ni a una reapertura. Se dice a la vista que se recuperó, porque en una terminal puede haberlo decidido otra persona.

**Por qué «Nos debe» no lleva columna nueva.** La prenda ya estaba: la de la línea de la compra, o la devuelta en su cuarentena. Una columna sería otra fuente de verdad y pediría `alter` de una tabla en uso. Lo que faltaba era leerla y usarla al saldar. El tope sigue por proveedor, categoría y marca (`fn_nos_debe_pendiente`): un proveedor puede reponer con otro modelo, y quien tiene la prenda en la mano es quien dice que es la reposición. Las deudas ya saldadas no se tocan: lo resuelto no se cambia.

### Límites que quedan

8. **Lo guardado en el navegador no viaja:** otra persona en otro aparato abre Cerrar sin lo decidido. Dos pestañas del mismo envío comparten lo último que se guardó.
9. **Una reposición de una prenda que no se debe** salda igual la deuda más antigua de esa categoría y marca, como hasta hoy.

## Actualización 2026-11-03: sin fila «Total», todo se cuenta por modelo (Felipe, 20 preguntas)

**El problema.** Dos blusas distintas sin marca no se podían contar aparte: el sistema mandaba a «Total de Blusas», que parecía un modelo más y confundía. Esa fila venía de `necesitaTotal`, que solo miraba lo que anotó Compras y nunca se iba.

**Lo que Felipe decidió:**
- **La fila «Total» se va.** `hayQueIdentificar` reemplaza a `necesitaTotal`: solo un número suelto de un envío ya abierto sale como «Sin identificar», no deja cerrar y contar el modelo lo va descontando. Con guía «Vestidos: 20» sin modelos, la categoría cuadra: «Dijeron 20 · Contaste 12 · Faltan 8» (`cuadraEnLaCategoria`; estado `contado`, que no dice «No estaba anotada»).
- **Un «+» junto al check de cada categoría** y «¿Qué llegó?» son la misma hoja (`NuevoModelo`): nombre, marca por modelo (vacía = sin marca; se sugiere la de la categoría si es una sola; con dos o más se elige o se agrega aparte), descripción, y proveedor solo si hay dos o más. Las parecidas salen mientras se escribe, sin bloquear. Se van «¿Llegó otra cosa?» y «Llegaron otras y aún no sé».
- **El modelo nace en 0, guardado en la base** (`20261103182000`): `separado.nuevas` acepta cantidad 0 con nombre, `nota` y `por_defecto`; una prenda del catálogo también puede ir en 0; hasta 500 modelos por línea.
- **Sin nombre: «Blusa 1», «Blusa 2»** (`prendaDeLaCategoria`, `nombrePorDefecto`). Contado no deja cerrar: la pantalla lo dice y la base lo rechaza (`recepcion_modelo_sin_nombre`). En 0 no frena. El lápiz le pone su nombre y descripción (`EditarModelo`).
- **Tacho en lo agregado:** en 0 borra directo, con conteo pide confirmar, y el aviso deshace ese modelo solo (`devolverModelo`: una foto de todo revivía lo que se quitó después). Lo anotado por Compras no lleva tacho: en 0 dice que no llegó.
- **Al cerrar:** lo agregado en 0 se avisa y se descarta (`lineasSinModelosEnCero`, `fn_envio_sin_ceros`). Lo que no cuadró va por modelo si Compras lo anotó (`agruparLineasDelCierre`), por categoría si no.

**DESCARTÉ:** guardar el modelo en 0 solo en el navegador (se perdía al recargar y otra persona no lo veía); una tabla de modelos del conteo (partir `separado` tocaría cierre, pendientes y reabrir para lo mismo); detectar «Blusa 1» por su texto (una blusa puede llamarse así: lo dice `por_defecto`).

**SE ROMPE SI:** una función nueva lee `separado` sin pasar por `fn_envio_sin_ceros` y da por hecho que toda cantidad es 1 o más (`despacho_pendientes.cantidad` lo rechazaría). Y queda abierto, para que Felipe decida: **dos personas agregando a la vez en la misma línea, la última pisa a la otra** (como ya pasaba con lo separado). Con versión distinta se avisa con `textoPisaste`, que habla de cantidades y no de modelos.

**En producción desde el 2026-11-03,** con `apply_migration`: quedó registrada con la versión `20261103190810` (la hora de aplicarla), no la del archivo (`20261103182000`). Se verificó leyendo las funciones y llamando a `fn_envio_leer_separado` y `fn_envio_sin_ceros` sin escribir nada.

**Cruce con #1616 / ADR-0605 (Felipe, 2026-11-03): manda esta actualización.** Quitar lo agregado es el tacho, que confirma si ya se contó, y no hay fila «Total» ni la fila de la categoría hace de total. #1616 se queda con cancelar la recepción de un envío sin aviso.

**Quitar una categoría entera (2026-11-03).** De lo que proponía #1616 se conserva, con el criterio del tacho: una categoría que nada de ella venía en la guía y de la que nada entró al stock (`sePuedeQuitarCategoria`) lleva su tacho; en 0 se quita directo, con conteo confirma, y el aviso la devuelve con lo que tenía.

**«Deshacer» escribe sobre la línea de ahora.** Quitar lo único de una línea en 0 la oculta y la saca de los grupos; comparada contra su foto vieja parecía igual y no se guardaba nada, y el modelo se perdía. `lineasVivas` guarda todas las líneas, también las que no se ven.

