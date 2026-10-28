## 📦 Recibir: fecha de envío, orden por antigüedad y filtros en «Envíos por recibir» — rama `claude/shipments-date-filters-497b4b`, sin migraciones

- [x] Columna «Enviado» (día y hora de Lima) y orden del más antiguo al más nuevo dentro de cada grupo.
- [x] Filtros Estado (varios), Proveedor y Fechas con períodos de un toque y rango a mano; «Limpiar todo».
- [x] Paso nuevo en la guía de Recibir y huella aceptada.
- [x] Verificado en el navegador contra la base local (1024, 1440 y 375 px): la columna «Enviado» es la primera y aparece con la tarjeta de 768 px o más (`@3xl`); si no, la fecha va bajo el número del envío. La guía tiene su columna desde `@5xl`. Falta mirarlo en oscuro y con envíos de otros años.
- [ ] Si la tabla crece, pasar los filtros a la URL (hoy viven en el navegador y se pierden al salir).
