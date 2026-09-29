## 2026-09-29 (Productos: cabecera con «!», 20 por página, orden nuevo, tamaño de la grilla, stock desde Editar y marca en la etiqueta)
Qué hice: la cabecera de Productos dice una frase y guarda el resto en un «!»; la lista trae 20 por página y se ordena también
por más recientes, más antiguos, más vendidos y menos vendidos (30 días); la Grilla se ve grande, mediana o pequeña y se acuerda;
en Editar cada color y cada talla tiene «Ajustar stock» (la misma ventana de Existencias); la etiqueta de precio imprime la
marca al pie, junto al QR. Antes analicé las cuatro pantallas de Catálogo (`docs/pantallas/`) y armé el plan por olas.
Por qué así: el orden se decide en la base antes de cortar la página (ordenar en el navegador ordenaría solo las 20 que llegaron);
las columnas salen del ancho disponible, no de la ventana (a 1024 px con el menú abierto las tarjetas quedaban de 100 px); el
stock se ajusta con el movimiento de siempre y no como un campo, para no abrir una segunda vía de escritura (revisa la decisión 9
de ADR-0270); y la marca va donde sobra espacio con y sin campaña (con campaña solo quedan 1,4 mm sobre el pie).
Felipe se lleva: `20260929180000_productos_orden_recientes_y_vendidos.sql` ya pegada en producción (verificada, md5 `3534a61a…`),
decidir si «Más comprados» era «más vendidos», y ver una etiqueta impresa en la
Brother con la marca (medida en pantalla, no en papel).
