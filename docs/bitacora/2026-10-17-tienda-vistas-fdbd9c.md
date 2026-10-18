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

## 2026-10-17 (De una lista a otra, el esqueleto al instante; la espera de la precarga, medida)
Qué hice: de Lo nuevo a Más vendidos (o de «Ropa» a «Accesorios», en la cabecera o en el menú del celular) es la misma página con otra
dirección, y Next no mostraba ningún esqueleto: 1,3 s con la lista de antes quieta. Ahora la página de antes se cambia en el mismo toque
por la grilla con el título de la que viene, con su fundido, y la raya de la cabecera pasa a la lista tocada (`components/EnCamino.tsx`;
medido a los 30–53 ms, a 1280 y a 375 px). Un filtro sigue sin esqueleto (apaga la lista).
Por qué así: lo probé también de una ficha a otra y de un look a otro, y ahí Next sí pone el esqueleto de su carpeta (a los 50–90 ms):
el mío encima duplicaba el fundido y cortaba la foto que vuela, así que quedó solo para las listas, y corregí el ADR-0445, que decía lo
contrario. Medí la precarga: Next solo precarga lo que está a la vista (5 fichas de 24, de a 4) y un toque que se le adelanta espera; en
producción eso debería ser corto, así que quedó escrita la salida y no la apliqué sin medir en un celular de verdad.
Felipe se lleva: tocar otra lista en la cabecera ya responde al instante, como tocar una prenda.

