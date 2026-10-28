## 2026-10-02 (Catálogo ▸ Atributos ▸ Temporadas ▸ «Por completar»: la lista dice de qué marca es cada prenda y quién la trae)
Qué hice: la lista de prendas sin temporada traía solo nombre, código y colores, sin títulos de columna. Ahora cada grupo
lleva una fila de títulos (Prenda · Marca · Proveedor · Colores) y la marca y el proveedor tienen cada uno su columna
cuando la tarjeta mide 768 px o más; con menos (celular, ventana angosta) bajan a una línea rotulada bajo el código
(«Marca: … · Proveedor: …»). Lo que falta sale como chip ámbar «Sin marca» / «Sin proveedor», igual que en Productos
(ADR-0283). El buscador también encuentra por marca y proveedor. La página lee `marcas` y `proveedores` aparte
(`app/(app)/productos/atributos/page.tsx`) y la lógica pura vive en `lib/temporadas-pantalla.ts` (con pruebas).
Por qué así: la clave única de un producto es marca + nombre (`productos_marca_referencia_clave_unica`), así que dos
prendas pueden llamarse igual y solo la marca las distingue; el proveedor no identifica la prenda pero es lo que la
persona ya conoce del pedido. Dos columnas con título en vez de dos líneas apiladas sin rótulo (como en la tabla de
Productos) porque aquí hay sitio y apilar es justo lo que confunde cuál es cuál. El corte es por ancho de la TARJETA
(`@3xl`), no de la ventana, porque con el menú lateral abierto una ventana de 1.000 px deja ~800 a la lista.
Felipe se lleva: sin SQL ni migraciones (solo lee). Verificado en el navegador con la base local a 1280, 1024 y 375 px,
sin desborde horizontal; el chip «Sin marca» no se vio con datos reales (la base local no tiene prendas sin marca).
Pendiente a decidir: la tabla de Productos sigue mostrando marca y proveedor apilados en una sola columna.
