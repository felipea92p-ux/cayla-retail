# Backlog · Recibir mercadería (2026-10-24)

- **Pegar en producción** `20261024225000_precio_de_venta_desde_la_recepcion.sql` (una parte, re-ejecutable; verificación en su encabezado). Pendiente del OK de Felipe (cambia un guardián de precio y suma una función con permisos).
- **Lista con fichas por producto y cantidades recibidas con observaciones** (el primer pedido de Felipe de esta sesión): sin construir. Hoy el conteo es por categoría+marca y el detalle por producto solo existe en lo separado/detallado; Compras no registra producto por producto. Falta definir con Felipe el nivel de detalle.
- **Origen «Recepción ENV-…» en el historial del precio general:** `historial_producto_cambios` no tiene columna de origen (ADR-0503, límites).
- **Revisar a 375 px y en modo oscuro** la tabla de envíos por recibir y la tarjeta «Costos y precios» (solo se vieron en escritorio).
