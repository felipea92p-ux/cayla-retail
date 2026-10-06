## 2026-10-05 (Ventas sin registrar: el buscador de «Regularizar prenda» mira la tienda de la venta, y la regla de «tu propia venta» convive con el lote del líder)
Qué hice: Felipe mostró, con captura, que al regularizar una venta de TRU («Pantalones · Chocolate · 28») el buscador ofrecía todo el
catálogo de todas las tiendas. Ahora, por defecto, solo muestra las prendas con stock libre en la tienda de la venta que calzan con lo que
anotó caja, en tramos con título: «Igual a lo que anotó caja», «Color parecido» y, si caja escribió otra categoría, esa primero. La sugerida
siempre está ahí. «Buscar en todo el catálogo» queda a la vista para la prenda que esa tienda nunca cargó, y si la tienda no tiene ninguna, lo
dice y ofrece el catálogo en el mismo lugar. Lo «igual» lo define ahora la misma función que usa el lote «Identificar con sugerencias» del
líder (ADR-0334), y la regla «nadie regulariza su propia venta, salvo el líder» se probó encima de ese lote, en el camino exacto de producción.
Por qué así: si el modal y el lote del líder decían «igual» de dos formas, una tienda podía ver una prenda en una pantalla y no en la otra.
Mirar la tienda de la venta (no la de la cabecera) es lo único que sirve a un líder que revisa todas sus tiendas. Y la parte 2 no cambió de
cuerpo: el lote ya mandaba su propia clave, así que sacar «regularizar» de la lista no lo rompía (8 casos nuevos y 8 mutantes muertos lo prueban).
Felipe se lleva: pegar UNA migración (`20261004204000`, la parte 1 ya está en producción) con la sonda previa, y fusionar el PR #788; las 14
capturas de la verificación con la carga real de la pantalla; y las tres preguntas del PR (líder en la terminal, nombre por fila en Almacén,
vocabulario de sinónimos).

## 2026-10-05 (revisión adversarial del PR #788: la salida al catálogo a la vista y las tildes que llegaron dañadas a producción)
Qué hice: la lista del buscador se abre sola y tapaba «Buscar en todo el catálogo»: con «Nada coincide» la persona quedaba sin salida. Ahora
la línea con la tienda y la salida va arriba del buscador, la última fila de la lista es la salida (lleva lo escrito al catálogo) y el
subtítulo dice en qué tienda se cobró. Al buscar, los tramos ya no se mezclan ni repiten su título. La parte 1 se pegó en producción con las
tildes dañadas (el texto pasó por algo que lo leyó como Mac Roman): la lógica está bien, los comentarios no. La parte 2 ahora aborta, sin
tocar nada, si le pasa lo mismo, y lo dice; antes decía que la función «cambió», que era falso.
Por qué así: lo que la persona necesita cuando no encuentra la prenda tiene que estar donde mira en ese momento (la lista), no debajo de ella.
Y un mensaje de error que apunta a la causa equivocada hace que alguien «arregle» lo que no estaba roto.
Felipe se lleva: pegar la parte 2 copiándola del archivo crudo de GitHub (no desde la terminal), y opcionalmente volver a pegar la parte 1 por
el mismo medio para limpiar sus comentarios antes del próximo volcado del diccionario.
