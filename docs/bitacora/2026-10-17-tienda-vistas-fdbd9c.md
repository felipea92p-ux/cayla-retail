## 2026-10-17 (La tienda: cada esqueleto es su página y de una vista a otra la pantalla se funde — ADR-0445)
Qué hice: medí con red lenta (1,2 y 4 s por respuesta), a 1280 y a 375 px, qué hacía brusco cada cambio de vista: la cabecera del
esqueleto llegaba vacía (sin «Ropa», «Accesorios», el nombre ni los globos), la franja de las tiendas eran píldoras grises, el esqueleto
del Inicio era una grilla crema y llegaba un héroe rojo, y todo cambiaba en un cuadro. Ahora la cabecera, la franja de anuncios y la de
las tiendas que esperan son las últimas que se vieron; cada página tiene su esqueleto con sus mismas clases y con lo que ya se sabe
escrito (el héroe con la campaña, el título de la lista, los textos fijos; la ficha, con la foto, el nombre y el precio de la tarjeta
tocada); hay esqueleto donde no había (un look, «Arma el tuyo», los pedidos); la pantalla se funde de una vista a otra con la cabecera
quieta y la foto de la tarjeta vuela a la ficha; y las tallas del «Agregar» rápido van por `GET /api/tallas`. Medido: títulos, fotos y
botones a 0 px de la página; el esqueleto sale a los 10 ms y cada fundido termina bien en una página a la vista.
Por qué así: el fundido es el de React 19.3 (lo trae Next 16.4 sin configurar) y la marca que lo pide va antes de todo elemento de la
vista: dentro de `<main>`, React no la veía (costó dar con eso, está en el ADR). La foto que viaja lleva su nombre en el estilo y solo al
tocarla, porque el Inicio repite prendas y dos nombres iguales a la vista abortan la transición. Descarté llamar a `startViewTransition` a
mano (el esqueleto ya estaría dibujado al tomar la foto de antes) y deslizar de lado (mueve toda la pantalla en cada toque).
Felipe se lleva: una tienda donde tocar algo ya muestra lo que viene, en su lugar y con lo que se sabe; el paso de una vista a otra es un
fundido corto y la foto de la prenda vuela a su ficha. Si un fundido le parece lento o la foto que vuela, demasiado, son dos números de
`app/estilos/vistas.css`.
