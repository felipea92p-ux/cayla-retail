## 2026-10-09 (Caja ▸ Registrar gasto en dos toques: mosaico por frecuencia, ADR-0368)
Qué hice: «Registrar gasto» en Caja abre `GastoRapidoModal`: 10 conceptos de tienda + «Otro», ordenados por lo que más se gasta en esa sede (90 días), con ★ y sus veces en los 4 primeros; el monto con «Lo de siempre» de ese concepto; sale del cajón abierto; la factura o boleta en un desplegable; el formulario completo a un enlace. Movimiento rico pedido por Felipe (ADR-0136 act. 2026-10-09). Sin migración: el concepto se reconoce por la descripción y la categoría.
Por qué así: el formulario de Finanzas pedía unos diez pasos para S/ 0.80 y nadie registraba lo chico. Una columna `gastos.concepto` habría cambiado la firma de `registrar_gasto` en producción para ordenar botones; la regla pura con su prueba basta hoy.
Felipe se lleva: probar en local con Baño S/ 0.80 (2 toques + monto). Quedaron 11 gastos de prueba en la caja LOCAL de Tienda Lima (S/ 85.80 en total, uno de ellos un Refrigerio).

## 2026-10-09 (Refrigerio del equipo en el gasto rápido)
Qué hice: botón «Refrigerio» (ícono de taza) que va a la categoría nueva «Atención al personal», cuenta 62 (migración `20261009235900`, una fila en `categorias_gasto`, aplicada en local).
Por qué así: Felipe decidió que es solo del equipo en el turno; en Suministros o Servicios básicos inflaba otra línea del estado de resultados. La 62 ya estaba en el plan y nadie la usaba.
Felipe se lleva: la migración ya está en producción (la apliqué por el MCP a su pedido, verificada); el PR #913 se puede fusionar.
