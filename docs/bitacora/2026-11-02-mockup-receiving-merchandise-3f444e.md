## 2026-11-02 (Maqueta editable de Recibir mercadería: cada pieza se mueve y se redimensiona)
Qué hice: `docs/maquetas/recibir-editable-2026-11/`: las 6 pantallas del flujo de recibir (portada, hoja «Sin aviso», Contar con y sin diferencia, Cerrar, Cerrado) capturadas del DOM real del ERP local, con su CSS y fuentes reales, más un editor (`editor.js`) que deja mover y redimensionar cada pieza con manijas, imán, deshacer, números exactos y «Copiar disposición». Sin tocar `apps/web`, ninguna migración ni RPC.
Por qué así: «exacta» no se logra redibujando; se capturó el DOM de lo que corre hoy (`main` del 2026-11-02, `ec15ad51d`). Una pieza se suelta de la página dejando un hueco invisible, así lo demás no se corre, y lo de adentro sigue reaccionando al ancho de su tarjeta (`@container`) como en la app. Lo editado se guarda en el navegador, nunca en el ERP.
Felipe se lleva: una maqueta tocable para empezar el trabajo del flujo de recibir; arma el texto con lo que movió para pegarlo en el chat y llevarlo al código. Falta: ponerla al día con `herramientas/` cuando Recibir cambie, y decidir si se versiona el `app.css` de 1,6 MB (hoy sí, para que se abra con doble clic).

## 2026-11-02 (Contar modelo por modelo: cada categoría una vez, el Dial cuenta el modelo y la placa queda compacta)
Qué hice: en Contar, cada categoría sale una sola vez aunque venga de varios proveedores o marcas, con filtro por ellos; al abrirla, sus modelos uno por uno, y tocar uno lo pone en el Dial. La placa quedó compacta, con las prendas de la compra y las que se parecen a la derecha del Dial, y los papeles en una tercera columna. Sin migración ni RPC (ADR-0604).
Por qué así: la base ya guardaba cuántas hay de cada prenda en su línea; contar un modelo es escribir eso. «Categoría» es solo una vista, así que juntar dos proveedores no mezcla lo que le toca a cada uno, y Cerrar y los reclamos no cambian.
Felipe se lleva: una pantalla donde se cuenta lo que se tiene en la mano, sin una segunda pasada para identificar. Está solo en local, en esta rama. Falta `/chaos` y `/formidable` formales y probarlo con quien recibe.

## 2026-11-02 (Los papeles pasan a un botón, y Contar aguanta envíos enormes)
Qué hice: la columna de papeles se fue: queda el botón «Subir foto de facturas» con su hoja. Probé con 75 líneas y 114.447 prendas y corregí lo que se rompió: listas con su scroll, placa que no crece y se queda a la vista, pie de guía corto, 5 cifras en el número que caben en el aro, miles separados y atajos a la escala.
Por qué así: Felipe vio que la columna repetía lo de la izquierda, y pidió probar con volumen real. La prueba destapó además un error de verdad: una prenda comprada en dos líneas hacía que «Cerrar» pidiera explicar un faltante y un sobrante inexistentes; ahora el conteo se reparte entre sus líneas.
Felipe se lleva: ENV-003056 intacto en la base local para probarlo a mano, y un dato para decidir: Cerrar no falla con este volumen, pero son casi 16.000 px de alto.

## 2026-11-02 (Contar sube: sin los pasos de arriba, con una barra de abajo que dice cómo va el envío)
Qué hice: quité la fila «1 Contar — 2 Cerrar»; el botón de las fotos y el Trayecto pasaron a la fila del título; y la barra de abajo ahora lleva la flecha de volver, «Contadas N de M», «Modelos N de M», si cuadra, un tubo que se llena y lo que sigue. A 1440 px la placa empieza a 212 px de arriba.
Por qué así: esa fila repetía lo que ya dicen el Trayecto (en qué va) y la barra (qué sigue). «Identificadas» se fue como cifra porque contando por modelo es lo mismo que «Contadas»: solo se nombra si falta algo.
Felipe se lleva: más de la placa a la vista sin bajar. El Trayecto se quedó porque dice la etapa del envío, no los pasos de la pantalla. Falta decidir si Cerrar se acorta; nada de esto tocó la base ni está publicado.

## 2026-11-02 (Contar al revés: las categorías toman el ancho y la placa queda angosta y alineada)
Qué hice: la placa del Dial quedó fija en 400 px y las categorías toman el resto, con sus modelos en columnas y con foto. El título y los filtros pasaron a su propia fila, así la primera categoría y la placa empiezan a la misma altura. Los atajos van al lado del Dial.
Por qué así: Felipe quiere ver de un vistazo todo lo que anotó Compras. Con eso, la lista «En la compra» de la placa era la misma que la de la izquierda, así que se fue y su foto pasó a cada tarjeta.
Felipe se lleva: un envío sin contar cabe entero sobre la barra a 1440 px (la placa mide 544 px). Sigue sin commit y sin publicar; «Quién cuenta» sigue debajo de las categorías.

## 2026-11-02 (Contar equilibrado: 3/5 y 2/5, flechas para ordenar y categorías que se pliegan)
Qué hice: las categorías pasaron a 3/5 del ancho y la placa a 2/5 (400 px como mínimo). Junto a Proveedor y Marca hay dos flechas que ordenan categorías y modelos por cantidad, y la categoría abierta se pliega al tocar su pestaña sin mover el Dial.
Por qué así: la placa fija en 400 px dejaba las categorías exageradas en una pantalla grande. El orden va por lo que anotó Compras, porque ordenar por lo contado movería la fila mientras se cuenta; «Listo, sigue» y «Falta: …» siguen el orden que se ve.
Felipe se lleva: lo pedido, probado sin escribir en la base, y una lista de recomendaciones en el backlog de esta rama. Nada de lo hecho desde el commit `4f64414bf` está guardado en un commit.

## 2026-11-02 (Maqueta de Recibir a partir del boceto de Felipe, para decidir si se pasa a local)
Qué hice: `docs/maquetas/recibir-boceto-2026-11/`, tocable y sin guardar nada: Re stock y Producto nuevo arriba, tres columnas alineadas, el contador, los filtros, las flechas y las categorías de siempre, un resumen a la derecha en vez de la barra de abajo, y las tallas en la misma pantalla. El marco y el CSS son los reales del ERP. No toqué `apps/web`.
Por qué así: del boceto se tomó la organización; Re stock y Nuevo no son una elección del envío, porque un envío puede traer los dos y el sistema ya lo sabe por lo que anotó Compras: marcan lo que se está contando y filtran. Los cinco pasos del boceto no se tomaron porque no son el camino real.
Felipe se lleva: una maqueta para evaluar y, en su README, lo que costaría pasarla a local (sin migración; lo más grande es llevar las tallas de la hoja a la placa). Falta su decisión.

## 2026-11-02 (La maqueta del boceto: categorías con color propio, barras que cambian de color y mejores botones del contador)
Qué hice: en `docs/maquetas/recibir-boceto-2026-11/`, las categorías llevan una banda de color (pizarra, arena o tinta, para comparar desde la chapa), todas las barras y el Trayecto van de rojo a ámbar y a verde mientras se llenan, y los botones del contador se ordenaron en sumar, «Llegaron las N» y «No llegó nada». Sigue sin tocar `apps/web`.
Por qué así: el ámbar del sistema es un marrón oscuro hecho para texto y en una barra no se distingue del verde; por eso esta maqueta trae un color nuevo, que sería un token si se pasa a local. «Llegaron las N» resalta por tocar y se apaga ya hecho, porque lo que sigue es «Listo, sigue».
Felipe se lleva: elegir el color de las categorías mirando, y confirmar que «barra de estado» era esto. El aro del contador no cambió de color: sigue en tinta hasta cuadrar.

## 2026-11-02 (La maqueta del boceto: tallas que se quitan y se agregan, empezando por las de siempre)
Qué hice: en `docs/maquetas/recibir-boceto-2026-11/`, la tabla de tallas arranca con las habituales de la categoría, cada talla se quita con su × y «Agregar talla» ofrece las demás de la más a la menos común, cayendo en su lugar. Sigue sin tocar `apps/web`.
Por qué así: «las más convencionales» ya existen en el catálogo como `categoria_tallas.habitual` (S, M, L; en jeans 28, 30, 32): no hay que inventar nada ni migrar. Quitar no pregunta: si había cantidades, el aviso ofrece «Deshacer».
Felipe se lleva: una decisión si esto pasa a local: quién puede sumar una talla que la categoría no ofrece, porque la base la rechaza si no se ofrece antes.

## 2026-11-02 (Contar en tres columnas, en el ERP)
Qué hice: llevé la maqueta del boceto a `/recibir/envio/[id]`: Re stock y Producto nuevo arriba, tres columnas alineadas que llenan la ventana, el resumen en lugar de la barra de abajo, el buscador, el filtro por tipo y por estado, Enter que pasa al siguiente, tallas y colores en la misma pantalla y las barras que van de rojo a verde. Sin migración ni RPC nueva (ADR-0604, «Tres columnas y el resumen»).
Por qué así: lo escrito en la tabla se guarda solo cuando cuadra con lo contado, porque en la base las tallas de una prenda siempre suman su cantidad; si lo guardado deja de ser lo que se ve, se suelta, y lo peor que pasa es que ese modelo se termina después. Quitar una talla solo esconde: nunca se borra una variante.
Felipe se lleva: probar en local con quien recibe de verdad; `/formidable` y `/chaos` corrieron sobre esta rama (ver sus tableros).

## 2026-11-02 (Contar: lo que encontraron /formidable y /chaos)
Qué hice: corrí una prueba ciega, un revisor de las 9 leyes y `/chaos` sobre la pantalla nueva, apliqué lo que sugirieron y repetí la ciega: pasó de 20 toques, 2 errores y sin terminar a primer intento, 9 toques y 0 errores. Lo grave: reabrir contaba dos veces lo que ya estaba en el stock (de esta rama), y cerrar con tallas en una sede con dos empresas no se podía porque la pantalla no preguntaba de quién es (de antes). Los dos, arreglados y probados cerrando de verdad; 0 violaciones nuevas en la base.
Por qué así: nada se resolvió en la base; toda la corrección vive en las reglas de la pantalla, con su prueba (`lib/recepcion-modelos-reglas.test.ts`, `lib/recepcion-tallas-reglas.test.ts`). Lo que Felipe pidió mirando la maqueta se respetó aunque la ley 8 lo marque: el informe lo dice.
Felipe se lleva: probarlo con quien recibe de verdad. Lo que quedó sin hacer está en el backlog de esta rama.

## 2026-11-03 (Recibir: el costo a la vista y lo que Felipe eligió de los pendientes)
Qué hice: el costo de la prenda en la cabecera de lo que se cuenta, para todo el que recibe; el número del Dial ya no transforma lo que no es una cantidad; abrir una categoría no cambia lo que se cuenta; «Cambiar de prenda»; fuera las cifras repetidas; Cerrar primero con lo que pide una decisión y lo que cuadra plegado (con 75 líneas, de casi 16.000 a unos 2.200 px); lo decidido en Cerrar sobrevive a recargar; y «Nos debe» dice qué prenda se debe y la reposición salda primero esa (migración `20261103144000`, solo en local).
Por qué así: «Nos debe» no lleva columna nueva porque la prenda ya estaba en la línea de la compra; lo que faltaba era leerla y usarla al saldar. El borrador de Cerrar va en el navegador porque nada de eso vale hasta cerrar, guarda solo lo que la persona cambió y lo dice a la vista. Contradice a propósito ADR-0129, que era de otra pantalla (ADR-0604, act. c).
Felipe se lleva: mirarlo en local; decidir si se sube y pegar la migración en producción con su confirmación aparte.

## 2026-11-03 (Cantidades: lo que no es un entero ya no se vuelve otro número)
Qué hice: «2,5», «1.5» y «-5» tecleados en una celda de cantidad ya no dejan 25, 15 ni 5. La celda muestra lo escrito en rojo con el porqué, a la pantalla solo le llega una cantidad de verdad y, al salir, vuelve su número y dice que no se guardó. Vale en Nuevo producto, Editar producto y sus hojas de Agregar color y talla, Nueva orden y las hojas de la orden. «Llenar todas con» devuelve las celdas a como estaban. Las dos matrices de Recibir ya tenían dónde decirlo: ahí el texto se queda, se marca y no deja guardar.
Por qué así: cada tecla se limpiaba y la caja se volvía a dibujar, así que la coma se borraba y el 5 caía junto al 2. Dejar el texto en la pantalla no alcanzaba: Producción lee como 0 lo que no entiende y esa talla se habría ido de la orden sin avisar. Por eso `useCantidadEscrita`, con su lógica pura en `lib/cantidad-escrita-reglas.ts` y su prueba.
Felipe se lleva: mirarlo en local, y que pegar varias celdas de una hoja de cálculo ya no deja el primer número: lo rechaza y lo dice. Probando encontré otro error que ya está en `main` y no lo arreglé: la tabla de tallas de Recibir se cierra al teclear (ver el backlog).

## 2026-11-03 (Recibir: la tabla de tallas ya no se cierra al teclear)
Qué hice: en un modelo con tallas guardadas, teclear un número que deja de cuadrar o cambiar el número con el Dial ya no cierra la tabla. El cursor se queda en su celda, lo repartido no se pierde y dice cuánto falta. «Deshacer» vuelve a lo guardado sin dejar la falsa pregunta de «sin guardar» al salir.
Por qué así: el modo «ahora» se deducía de que el modelo tuviera tallas, y soltarlas lo mandaba a «después». Ahora el modelo que se toca deja dicho su modo, y lo elegido por la persona no se pisa. Lógica pura en `lib/recepcion-tallas-reglas.ts`, con su prueba; sin migración. No cambié la decisión de ADR-0604: lo guardado se suelta mientras no cuadre.
Felipe se lleva: el error está en `main` y esta corrección sigue sin subir. Probé con Vestido Sofía en ENV-003062 (base local), que quedó en 48 con 5 + 43.
