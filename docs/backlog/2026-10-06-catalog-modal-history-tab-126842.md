# Historial de la prenda (ADR-0354) — pendientes

- [ ] **Pegar `20261006180100_editar_producto_pide_responsable.sql` en producción DESPUÉS de publicar la web** (antes, la web vieja quedaría
      rechazada al guardar la ficha en cada terminal). Una línea: `delete from retail.acciones_sin_responsable where clave = 'producto_confirmar_cambios';`.
- [ ] Refrescar el diccionario de datos (`docs/datos/generado/`): columna `historial_producto_cambios.ubicacion_id` y las funciones `fn_historial_*`.
      El volcado de producción del 2026-10-06 también difiere por cambios de otras sesiones (tablas `compra_item_reparto_resumen`,
      `compra_parte_por_tienda`, `planilla_por_sede`…): conviene hacerlo de una vez para todas (`pnpm datos:refrescar`, memoria «refrescar el volcado por MCP»).
- [ ] Borrar `retail.fn_historial_producto_cambios` (quedó sin uso) en una migración propia.
- [ ] Quien fusione `agregar_foto_producto` (ADR-0283, Fotos que faltan): su fila `foto` = 'agregada' la descarta el filtro `historial_foto_sin_duplicar`;
      puede quitar ese insert de la función cuando quiera, no es obligatorio.
- [ ] Correr `/formidable` sobre el historial (obligatoria con tablero, `docs/formidable/README.md`).
- [ ] Movimientos: el enlace del historial usa `?q=<código>`; si Movimientos gana un filtro por prenda exacta, usarlo.
