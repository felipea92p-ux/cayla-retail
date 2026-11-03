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
   Aguanta el volumen sin errores, pero se hace muy largo: con 75 líneas son 54 filas y casi 16.000 px de alto.
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
