## 🏷️ Descuento a mano al apartar (2026-10-30, ADR-0584) — migraciones `20261030220000`, `20261030221000` y `20261030234000` EN PRODUCCIÓN (2026-10-30); rama `claude/descuentos-prendas-separadas-183141`

- [x] La base acepta el descuento a mano al apartar con las reglas de la venta (`fn_exigir_descuento_manual`), guarda motivo, detalle y argumento en `separacion_items` y la entrega los lleva a `venta_items`. `pnpm pruebas:apartar-con-descuento` 19/19; `pruebas:separaciones` 101/101.
- [x] Hoja «Descuento» en Apartar, con guía de foco y su paso en la guía interactiva; probada en el navegador (APT-LIM-0001 en local: 8.00 con «Cerrar la venta», total 71.90), a 375 px y en oscuro.
- [x] El descuento del ticket de Vender viaja a Apartar (por la pestaña, no por la URL); probado en el navegador.
- [x] Agregar prendas a un apartado ya hecho, con descuento (`editar_separacion`, migración `20261030221000`), hecho en una sesión paralela y unido a esta rama.
- [x] El detalle, la entrega y la constancia muestran el descuento y su motivo (`buscar_separaciones`, migración `20261030234000`), hecho en una sesión paralela y unido a esta rama.
- [x] **Producción:** Felipe pegó `20261030220000`, `20261030221000` y `20261030234000` en ese orden el 2026-10-30, antes de fusionar; la verificación dio 3, 3, true ×5 y 0 descuadrados.
- [ ] Refrescar el diccionario de datos con el próximo volcado de producción (`pnpm datos:generar:produccion`, `docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Deuda anotada:** que `registrar_venta` use `fn_exigir_descuento_manual` en vez de su copia (es lo que cobra la caja: con su propio OK).
