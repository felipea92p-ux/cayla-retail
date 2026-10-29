## Movimientos ▸ pestaña «Ingresos» (2026-10-28, ADR-0565)

- [x] Función `fn_ingresos_por_modelo` (stock inicial + mercadería recibida, por modelo, hora de Lima) con su prueba de Postgres (33 casos).
- [x] Pestaña con rango (7/30/90 días o «desde que llegó el fardo hasta hoy»), foto, Nuevo/Reingreso con filtro, precio de la sede y costo solo con permiso de dinero.
- [x] Colores y tallas al tocar el modelo; buscar sin tildes, ordenar por columna y total al pie.
- [x] Descargar Excel (CSV) por modelo o con colores y tallas, de lo que se ve; imprimir con foto (A4 en claro).
- [x] Guía interactiva al día (recorrida en escritorio y a 375 px), modo oscuro medido (0 hallazgos), `/formidable` en modo medir.
- [x] **Migración `20261029022000_ingresos_por_modelo.sql` pegada en producción (2026-10-29)** con `apply_migration` (registrada como `20261029135109`); función verificada contra el libro (1.146 = 1.146 = 1.146). Falta correr `pnpm datos:generar:produccion` y `pnpm datos:comparar` (no agrega tablas) cuando se refresque el volcado.
- [ ] Abrir el PR con `/abrir-pr` (la rama lleva 7 commits de esta obra y no tiene PR).
- [ ] Probar con la colaboradora que lo pidió y con la persona de compras (ciega y real sin probar); decidir si el CSV alcanza o hace falta un .xlsx real con fotos.
- [x] Los 3 cambios de `/formidable` (OK de Felipe, 2026-10-29): botones de fila a 32 px, los tres botones en un «Más» en el celular y un solo total. Queda la caja de búsqueda a 38 px (pieza del sistema).
- [ ] Confirmar la hoja impresa por el diálogo real de impresión y en una compilación limpia (el `next dev` local no tomó `ingresos-impresion.css`).
- [ ] Posibles mejoras que no se pidieron: proveedor y guía del fardo (`lotes`) para lo recibido; comparar lo que entró contra la factura o la orden de compra («más adelante»).
- [ ] Opcional: el filtro por empresa (CAYLA / CLAURE en Lima, ADR-0532) de Movimientos, también en Ingresos.
- [ ] La rama está 747 commits detrás de `main`: `/abrir-pr` la pone al día antes de abrir el PR (la web de Ingresos solo funciona en producción cuando el PR se publica).
