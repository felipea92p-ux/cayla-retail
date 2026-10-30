## 🏷️ Descuento a mano al apartar (2026-10-30, ADR-0584) — migración `20261030220000` (y `20261030221000`) SIN pegar; rama `claude/descuentos-prendas-separadas-183141`

- [x] La base acepta el descuento a mano al apartar con las reglas de la venta (`fn_exigir_descuento_manual`), guarda motivo, detalle y argumento en `separacion_items` y la entrega los lleva a `venta_items`. `pnpm pruebas:apartar-con-descuento` 19/19; `pruebas:separaciones` 101/101.
- [x] Hoja «Descuento» en Apartar, con guía de foco y su paso en la guía interactiva; probada en el navegador (APT-LIM-0001 en local: 8.00 con «Cerrar la venta», total 71.90), a 375 px y en oscuro.
- [x] El descuento del ticket de Vender viaja a Apartar (por la pestaña, no por la URL); probado en el navegador.
- [ ] Agregar prendas a un apartado ya hecho, con descuento (`editar_separacion`, migración `20261030221000`): en una sesión paralela, rama propia.
- [ ] El detalle, la entrega y la constancia muestran el descuento y su motivo (`buscar_separaciones`): en una sesión paralela, rama propia.
- [ ] **Producción:** pegar `20261030220000` (y luego `20261030221000` y la de la actividad 4) con el OK de Felipe, ANTES de publicar la web.
- [ ] **Deuda anotada:** que `registrar_venta` use `fn_exigir_descuento_manual` en vez de su copia (es lo que cobra la caja: con su propio OK).
