## 🗂️ Editar producto: responsive, sin «Pendiente de revisar» y la tabla de «Unidades de hoy» (2026-10-02) — rama `claude/product-edit-local-ad1952`, **sin migración**

Detalle y decisiones: `docs/adr/0313-editar-producto-gana-el-panel-del-taller.md` («Actualización 2026-10-02 (noche)») y
`docs/bitacora/2026-10-02-product-edit-local-ad1952.md`.

- [x] La ficha no se sale de su tarjeta en ningún ancho (375, 776, 1024, 1280, 1440 px): columnas por `@container`, no por ventana.
- [x] Sin el aviso «Pendiente de revisar»; Existencias deja de esconder las prendas creadas en un conteo.
- [x] «Variantes y precios» con la tabla de «Unidades de hoy»; el stock espera a «Revisar y guardar»; al guardar se ofrece imprimir
  una etiqueta por unidad que entró (`/etiquetas-de-precio?unidades=id:n`).
- [ ] Probar con un producto real de muchos colores (Body Leonor, BOD-0012: 10 colores × 3 tallas) en producción.
- [ ] Probar con una cuenta de terminal (el responsable se elige en el combo): «Revisar y guardar» debe pedirlo antes de abrir la hoja.
- [ ] La base sigue marcando `estado_alta = 'pendiente'` en las altas al vuelo y `revisar_producto_censo` ya no lo usa ninguna
  pantalla. Decidir si se apaga en la base (migración) o se deja así.
