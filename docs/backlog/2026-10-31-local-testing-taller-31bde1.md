## 🕖 Producción · «+ Talla» y «+ Color» en Nueva orden (2026-10-31) — migración `20261031172000`; rama `claude/local-testing-taller-31bde1`

- [x] `agregar_variantes_a_modelo(taller, modelo, tallas[], colores[])`: crea tallas o colores de un modelo que ya existe, todo o nada, con el precio y el costo de la hermana y sin stock; opera el Taller y edita el catálogo; sube la versión del producto. Prueba `pnpm pruebas:produccion-agregar-variantes` (17 casos) en una tanda del CI. ADR-0591.
- [x] «+ Talla» y «+ Color» sobre la matriz de Nueva orden (hojas `AgregarTallaModal` y `AgregarColorAlModeloModal`, gancho `useAgregarVariantes`); probado a 375 px, en oscuro y en el navegador contra la base local.
- [ ] **Pegar `20261031172000` en producción** (con el OK de Felipe; sola, sin partes) y refrescar el volcado del diccionario. Mientras no esté, «+ Talla» y «+ Color» fallan en producción con «function … does not exist».
- [ ] Las dos hojas son `no-aplica` en la guía de foco. Si se quiere el halo del campo que sigue, es un cambio de las hojas.
- [ ] Reactivar una variante **desactivada** desde la orden: hoy avisa y manda a Editar producto (decisión de catálogo).
