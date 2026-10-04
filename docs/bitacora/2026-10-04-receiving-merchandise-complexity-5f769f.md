## 2026-10-04 (Recibir mercadería: una sola puerta «Llegó mercadería», la factura se une después — ADR-0330)
Qué hice: Felipe dijo que Recibir era «tan complejo e inútil que ni yo lo entiendo». Producción (solo lectura) lo confirmó: 0 compras, 0 lotes,
0 envíos; las 789 prendas del sistema entraron por la carga inicial, y había cinco formas de meter stock a una tienda. Con su decisión
(«una puerta, factura después» y «Por regularizar a Existencias»), `/recibir` abre ahora en «Llegó mercadería»: ¿de quién? y ¿qué llegó?
(pistola o nombre, las prendas del proveedor primero), entra al almacén de la sede de la cabecera con `recibir_lote` sin cambios, y después
ofrece etiquetas y Bajar al piso. Si el proveedor tiene una factura pendiente en la sede, pregunta «¿Viene con su factura?» y lleva al conteo
de siempre; si ese proveedor ya entró hoy, lo avisa antes de recibir. Las ventas sin registrar viven en `/inventario/por-regularizar`, con
su botón y su número en Existencias. `/inventario/recibir` se fundió en la puerta (620 líneas menos) y `/recibir` ya no tiene pestañas ni
«Recibiendo en». Solo web: nada que pegar en producción. Cinco commits, uno por actividad, cada uno probado en el navegador con la base local.
Por qué así: la pantalla empezaba por el papel (la factura registrada antes) y en la tienda la pregunta es por la caja; R-07 ya decía que la
factura «se pega después si llega». Lo que estaba bien construido (una transacción, token, no recibir más de lo facturado) no se tocó: cambió
la puerta, no el motor. El aviso de la misma caja existe porque el token frena el doble clic de una persona, no a dos tablets.
Felipe se lleva: la fase 2 (unir una factura a una llegada ya recibida y recalcular el costo) es un contrato nuevo y se propone aparte; mientras
no exista, lo que entra sin factura queda «Sin costo» (lo ve quien ve el dinero, en la lista y en el historial). Lo que más pesa no es Recibir:
AQP tiene 14 prendas cargadas y 170 ventas sin registrar.

## 2026-10-04, tarde (fase 2 decidida, aviso «Llegadas sin factura» construido)
Qué hice: propuse cómo unir una factura a una llegada ya recibida y Felipe decidió «aviso ahora, unión después» y que una unión se pueda
deshacer. Producción (solo lectura) mostró que «lo recibido» de una factura lo leen 36 funciones, 4 vistas y 1 disparador sumando
`movimientos.compra_item_id`, y que las 11 que leen cierres no distinguen el motivo: por eso el diseño es un movimiento `union_factura`
sin efecto en stock (ni tabla puente, que era mi esbozo de la mañana, ni un cierre, que pediría notas de crédito por mercadería que sí
llegó). Quedó escrito en ADR-0330 con la fórmula del costo. Construí el aviso: Inicio y Observatorio, llegadas sin factura de 7 a 60 días.
Por qué así: hay 0 facturas registradas en producción; construir la unión hoy repetía el error de Recibir. Sin el aviso, la unión sería un
botón que nadie aprieta. La ventana de 60 días existe porque más del 30 % de las compras no trae factura nunca (R-07).
Felipe se lleva: la unión se construye con la primera factura que llegue tarde; el aviso del Observatorio no se vio en pantalla en local.

