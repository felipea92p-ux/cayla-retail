# 2026-10-24 · Recibir mercadería (sync-local-production-ca52a8)

- **Qué se hizo:** «Sin Aviso» ahora es un botón que abre el formulario (antes ocupaba la pantalla); «Envíos por recibir» pasó a una tabla con buscador (número, guía, proveedor, orden, estado); en el cierre el costo salió de la tabla a la «Precio de compra» como última columna y «Precio de venta» en la fila desplegable (se confirman antes de cerrar) y se puede cambiar el precio de venta de las prendas identificadas (todas las sedes o solo esta).
- **Por qué así:** el costo y el precio son dinero y pasaban desapercibidos; el precio rige hacia adelante y no reescribe nada anterior (ADR-0503).
- **Cómo se verifica:** `pnpm pruebas:precio-desde-recepcion`, vitest completo (609 archivos), y a mano en `/recibir` y `/recibir/envio/<id>` (paso Cerrar). La migración `20261024225000` está solo en el Postgres local: producción espera el OK de Felipe.
