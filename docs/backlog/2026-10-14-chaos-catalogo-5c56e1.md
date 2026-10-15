## 🧨 /chaos de Catálogo (2026-10-14) — rama `claude/chaos-catalogo-5c56e1`, ADR-0405

- [x] ~~**Pegar en producción** `20261014182000`~~ — hecho el 2026-10-14 con el OK de Felipe: 11 candados validados.
- [ ] Refrescar el volcado de `docs/datos/generado/` (candados nuevos) junto con el de ADR-0404.
- [x] ~~**Decisión de Felipe:** ¿un tope para el precio y un aviso si el costo pasa al precio?~~ — recomendación aplicada (Felipe 2026-10-15, ADR-0415): tope de S/ 5 000 en la base y en la pantalla; costo sobre precio, un aviso que deja guardar.
- [x] ~~**Decisión de Felipe:** ¿el precio de catálogo es solo del líder?~~ — no se restringe (ADR-0415): integrantes y terminales lo cambian a diario y cada cambio queda en el Historial de la prenda.
- [ ] `revisar_producto_censo(aprobar)` sobre una prenda que no estaba por revisar responde ok sin decir nada (menor, solo API).
- [ ] Compras: correr `/chaos` cuando termine su reconstrucción (#1055, #1056, #1040, #1032). Lo abierto del 13 sigue: INV-14 (recibir y
  anular la misma factura a la vez), token de nueva factura, IGV 1000 %, fechas al revés, Proveedor y Por pagar con id o filtros basura.
