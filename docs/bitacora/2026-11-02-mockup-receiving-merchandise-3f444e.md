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
