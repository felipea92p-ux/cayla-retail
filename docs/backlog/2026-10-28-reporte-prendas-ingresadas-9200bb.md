## Movimientos ▸ pestaña «Ingresos» (2026-10-28, ADR-0565)

- [x] Función `fn_ingresos_por_modelo` (stock inicial + mercadería recibida, por modelo, hora de Lima) con su prueba de Postgres (33 casos).
- [x] Pestaña con rango (7/30/90 días o «desde que llegó el fardo hasta hoy»), foto, Nuevo/Reingreso con filtro, precio de la sede y costo solo con permiso de dinero.
- [x] Colores y tallas al tocar el modelo; buscar sin tildes, ordenar por columna y total al pie.
- [x] Descargar Excel (CSV) por modelo o con colores y tallas, de lo que se ve; imprimir con foto (A4 en claro).
- [x] Guía interactiva al día (recorrida en escritorio y a 375 px), modo oscuro medido (0 hallazgos), `/formidable` en modo medir.
- [ ] **Pegar la migración `20261029022000_ingresos_por_modelo.sql` en producción** (cambio de esquema: va con el OK de Felipe; sin ella la pestaña no carga allá). Después, `pnpm datos:generar:produccion` y `pnpm datos:comparar`. **Verificado solo leyendo producción (2026-10-28):** ya existen `fn_precio_en_sede`, `fn_puede_ver_dinero_de_compras`, `fn_ve_modulo`, `fn_puede_operar_ubicacion` y todas las columnas que usa; `fn_ingresos_por_modelo` todavía no.
- [ ] Abrir el PR con `/abrir-pr` (la rama lleva 7 commits de esta obra y no tiene PR).
- [ ] Probar con la colaboradora que lo pidió y con la persona de compras (ciega y real sin probar); decidir si el CSV alcanza o hace falta un .xlsx real con fotos.
- [ ] Los 3 cambios de `/formidable` (esperan OK): una sola altura de control, los tres botones en un «Más» en el celular, un solo total.
- [ ] Confirmar la hoja impresa por el diálogo real de impresión y en una compilación limpia (el `next dev` local no tomó `ingresos-impresion.css`).
- [ ] Posibles mejoras que no se pidieron: proveedor y guía del fardo (`lotes`) para lo recibido; comparar lo que entró contra la factura o la orden de compra («más adelante»).
