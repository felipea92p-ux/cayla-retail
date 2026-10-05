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
