## 2026-10-21 (Pedidos web: cada prenda dice de qué empresa es — ADR-0463)
Qué hice: en Tienda web ▸ Pedidos, el detalle de un pedido muestra, encima del nombre de cada prenda, una insignia con su empresa (CAYLA o CLAURE), y solo cuando la sede tiene las dos (hoy Lima). En Trujillo y Arequipa el detalle queda como siempre.
Por qué así: la primera versión pedía una migración (la empresa dentro de `fn_pedido_web_prenda`); Felipe vio que en producción no salía. Se cambió: la página lee `productos.empresa_id` de las prendas y las nombra con `fn_empresas_de_sede` (ya en producción), igual que las etiquetas. Sin cambio de esquema. «Solo Lima» sale de `empresa_sedes`, no del nombre de la sede.
Qué se rompería sin esto: un pedido mezclado de prendas CAYLA y CLAURE se prepararía sin saber de quién es cada prenda.
Estado: tipos, lint, Knip y pruebas en verde (`pedidos-web-reglas.test.ts`, 4 nuevas). No se vio en el navegador: la base local no tiene pedidos web.
