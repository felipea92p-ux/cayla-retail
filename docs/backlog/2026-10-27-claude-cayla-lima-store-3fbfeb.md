# Backlog · El stock de Lima se parte por dueño (2026-10-27/28, ADR-0542)

Obra de 9 actividades aprobada por Felipe el 2026-10-27, hecha por `/construir` (un commit por actividad). Felipe pidió: al terminar todo, aplicar las migraciones a producción y abrir el PR con autofix y fusión automática.

- [x] 1. Libro por dueño + Existencias · [x] 2. Ajustar stock con el botón · [x] 3. Nuevo producto con el botón · [x] 4. Recibir mercadería y traslados · [x] 5. Vender, Apartados (y pedidos web: toma primero la casa) · [x] 6. Devoluciones y Cambios · [x] 7. Contar por dueño · [x] 8. Caja, Historial y Movimientos leen el dueño real · [x] 9. Cierre.

## POR PEGAR en producción (2026-10-28) — después de fusionar el PR #1441
Pegarlas antes rompería la web de hoy: con la migración 1 y la web vieja, un ingreso a Lima sin dueño (Ajustar stock, Nuevo producto, Recibir) se rechaza con «elige de cuál es». La web nueva sí funciona sin ellas (sin reparto no pregunta, y el resto queda como antes). Orden: 1) `20261027222000_stock_dueno_en_sedes_con_dos_empresas.sql` (candados con NOWAIT; si dice que la base está ocupada, se vuelve a pegar; termina en «QUEDÓ BIEN»); 2) `20261028153000_dueno_real_en_caja_historial_y_movimientos.sql` (necesita las de ADR-0532 y las huellas `4aac753e…` / `99ac6aac…`; si no coinciden, aborta sin tocar nada). Después: `pnpm datos:generar:produccion`.

## Pendiente para después de la obra
- [ ] **Decisión de Felipe:** un pedido web con una prenda que tiene unidades de las dos empresas hoy sale de la casa (CAYLA) si lo toma quien no es del personal; si lo confirma el personal y hay duda, la base pide elegir. Definir si quien confirma el pedido elige de cuál sale.
- [ ] Ver con una prenda real, dentro del ticket de Vender y de Apartados, la fila «¿De quién sale?» (la prenda de prueba local solo tiene stock en el almacén) y el formulario de Recibir con una recepción real.
- [ ] Una venta con la misma prenda de dos dueños viaja con un dueño por prenda: para vender una de cada una, dos ventas. Si hace falta, partir la línea.
- [ ] Revisar con Felipe las prendas con stock en Lima que se crearon en Trujillo (nunca tuvieron el botón): la carga inicial las dejó con el dueño de su ficha.
- [ ] Decidir qué hacer con las 5 prendas de CLAURE que repiten una de CAYLA (Broana y Triana, de Marisol / Ivanana): con unidades por dueño, una misma ficha puede cubrir las dos.
- [ ] Refrescar el volcado de producción cuando se peguen las migraciones: `pnpm datos:generar:produccion` (tabla `stock_dueno`, columna `movimientos.empresa_id`).

## Hallazgos fuera de la obra
- [ ] **La batería completa de Postgres tumba el Postgres 17.6 local** (aarch64): las 24 pruebas de la tienda web con `grant tienda_web to current_user with set true` dan *Segmentation fault* y reinician el servidor de todas las sesiones. Ver si pasa también en el CI y arreglar la instrucción en esas pruebas.
- [ ] `recalcular_stock()` no reconstruye `stock_dueno` (nadie la llama hoy).
