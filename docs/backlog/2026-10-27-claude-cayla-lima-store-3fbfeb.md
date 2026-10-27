# Backlog · El stock de Lima se parte por dueño (2026-10-27, ADR-0542)

Obra de 9 actividades aprobada por Felipe el 2026-10-27, una por una con `/construir`. Todo **en local**; nada en producción sin su OK.

- [x] **1. El libro por dueño + Existencias** (migración `20261027222000`, `lib/stock-por-dueno*.ts`, `PanelTalla`): hecha, 29/29 en Postgres.
- [ ] 2. Ingresar y ajustar stock en Lima con el botón (dueño elegido; sin elegir no se guarda). En Trujillo no aparece.
- [ ] 3. Nuevo producto en Lima con el botón por stock inicial; se quita `empresaPorMarca` y «en Lima ya no pregunta» (ADR-0532). `crear_producto_con_empresa` pasa el dueño al crear (hoy libra el stock inicial como CAYLA y después cambia la ficha).
- [ ] 4. Recibir mercadería (llegada y por factura) y traslados con el dueño.
- [ ] 5. Vender, Apartados y pedidos web: la salida toma el dueño de la unidad; pregunta solo si hay de las dos. **Decisión pendiente de Felipe:** en un pedido web con una prenda que tiene unidades de las dos empresas, quien lo prepara elige de cuál sale (propuesta).
- [ ] 6. Devoluciones y Cambios: vuelve al dueño de la venta original.
- [ ] 7. Contar en Lima por dueño.
- [ ] 8. Caja, Historial y Movimientos leen el dueño real (`coalesce(m.empresa_id, productos.empresa_id)`); se rehace el historial del 23 al 27-oct (CLAURE bajaría de ~S/ 435 a ~S/ 118: recalcularlo con datos reales antes de decírselo a Felipe).
- [ ] 9. Cierre: `/chaos` sobre las pantallas que guardan; guías interactivas y de foco de lo que cambió; sumar `fn_stock_dueno_descuadres()` a `scripts/chaos/invariantes.mjs`; **cambiar `fn_dueno_de_entrada_sin_elegir` (transitoria) a un rechazo**; corregir ADR-0532 y la nota de ADR-0463/0505; refrescar el volcado.

## Para Felipe
- [ ] **Pegar la migración en producción** solo cuando cierre la actividad 8 y diga que sí: la `20261027222000` toma sus candados con `NOWAIT` (reintenta 15 s y no aplica nada si la base está muy ocupada). Luego `pnpm datos:generar:produccion` (tabla `stock_dueno`, columna `movimientos.empresa_id`).
- [ ] Revisar la lista de prendas con stock en Lima que se crearon en Trujillo (nunca tuvieron el botón) antes de la carga inicial en producción.
- [ ] Decidir qué hacer con las 5 prendas de CLAURE que repiten una de CAYLA (Broana y Triana, de Marisol / Ivanana): con unidades por dueño, la misma ficha puede cubrir las dos.

## Hallazgos fuera de la obra
- [ ] **La batería completa de Postgres tumba el Postgres 17.6 local** (aarch64): las 24 pruebas de la tienda web con `grant tienda_web to current_user with set true` dan *Segmentation fault* y reinician el servidor de todas las sesiones. Ver si pasa también en el CI y arreglar la instrucción (o la forma de dar el rol) en esas pruebas.
- [ ] `recalcular_stock()` no reconstruye `stock_dueno` (nadie la llama hoy): si se vuelve a usar, que también reconstruya el reparto.
