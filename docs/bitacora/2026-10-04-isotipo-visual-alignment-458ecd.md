## 2026-10-04 (la prenda sin foto deja de ser el isotipo repetido)
Qué hice: en Existencias, cada prenda sin foto mostraba el colibrí de la marca al 30 %; ahora muestra el ícono de su categoría
(pantalón, camisa, casaca…) sobre el color de la prenda, igual que ya hacía Vender. Lo cambié en la pieza compartida, así que el
mismo dibujo llega a las tarjetas, la lista, el cajón de la prenda, Ajustar, Reponer, Subir, Bajar al piso y las cinco pantallas de
Conteo. Existencias ahora trae la categoría de cada prenda; Conteo ya la tenía en el catálogo.
Por qué así: el isotipo repetido en cada prenda sin foto no distinguía una de otra y le quitaba fuerza a la marca (que es el loader y
los tickets). Una sola pieza, y un candado (`lib/sin-foto.test.ts`) que falla si alguien vuelve a poner el
isotipo como relleno. Verificado en Chrome sin ventana a 1440 y 375 px, incluido el cambio de color de una tarjeta (beige → negro).
Felipe se lleva: falta decidir si Catálogo ▸ Productos, Apartados e Inicio de Almacén (que dibujan su propio «sin foto») también se
unifican; y Movimientos, Traslados, Cambios, Devoluciones, Compras, Resumen y Análisis muestran por ahora una percha sobre tono
neutro (ya sin isotipo) porque sus cargadores aún no traen el prefijo de la categoría. ADR-0333.

## 2026-10-04 (la misma prenda sin foto en Productos, Apartados e Inicio de Almacén)
Qué hice: Felipe pidió unificar también las tres pantallas que dibujaban su propio «sin foto». Catálogo ▸ Productos (tarjeta, vista
rápida y tabla), Apartados e Inicio de Almacén ahora dibujan el ícono de la categoría sobre el color de la prenda, igual que
Existencias, Conteo y Vender. Se borraron la blusa punteada, el tinte con percha y sus estilos. Apartados no recibía el color de la
prenda (Vender sí) y el negro salía pálido: ya llega.
Por qué así: cinco dibujos distintos para lo mismo hacían que la misma prenda cambiara de cara según la pantalla. En «Nuevo en el
catálogo» (una lista de productos, no de colores) solo se pinta un color cuando el producto tiene uno solo; con varios se usa el tono de
su familia, para no afirmar un color que no tiene. Verificado en Chrome sin ventana a 1440 y 375 px contra una base local al día con main.
Felipe se lleva: Movimientos, Traslados, Cambios, Devoluciones, Compras, Resumen y Análisis siguen con la percha sobre tono neutro
hasta que sus cargadores traigan la categoría (cable por pantalla, sin decisión pendiente).
