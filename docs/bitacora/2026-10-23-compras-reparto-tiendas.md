## 2026-10-23 («Compré ropa»: una prenda repartida entre tiendas, y «proveedor nuevo» y «Algo nuevo» a la vista — ADR-0480)
Qué hice:
- **Repartir entre tiendas:** en la hoja de la prenda, «¿A qué tienda va?» acepta una o varias. Con dos o más aparece «¿Cuántas a cada una?», repartido parejo (lo que sobra va a las primeras) y con − y + por tienda. Abajo dice si cuadra con lo comprado; si no, apaga el botón.
- **Una línea por tienda:** la prenda entra a la compra con una línea por tienda (la base ya arma una orden por tienda). Al corregirla se juntan de vuelta y se quitan juntas.
- **Solo prendas del catálogo:** una prenda que todavía no está en el catálogo va a una sola tienda, porque repartida cada tienda la crearía al recibirla y quedaría duplicada.
- **Más visibles:** «Es un proveedor nuevo» pasa de un botón gris al pie a una tarjeta bajo el buscador; si no encuentra el nombre, ofrece «Registrar "…"». «Algo nuevo» pasa a ser la primera tarjeta de la grilla, con su «+» en tinta.
- **Nombres cortos:** las tiendas se nombran sin «Tienda» («Lima», «Trujillo»).
Por qué así: Felipe 2026-10-23: «si selecciono más de una, que aparezcan inputs para distribuir el total»; «no se nota que tiene esa opción»; «basta con decir Trujillo, Lima o Arequipa». Sin migración.
Estado:
- vitest en verde (597 archivos) y Knip limpio.
- Guías `compras.mi-plata` (22 pasos) y `compras.mi-plata.compra` (7) recorridas, para lo que se abrió una ronda a Felipe en el banco.
- Probado en el navegador a 375 px: reparto 4/3, aviso «sobran 1», corregir y guardar. La base armó dos órdenes, Lima 4 y Trujillo 3.
