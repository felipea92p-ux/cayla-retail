## 🧾 La caja no muestra el error crudo cuando rechaza una venta (2026-09-29, hallazgo C3 del carril profundo de la auditoría del 29-sep) — migración pegada; rama `claude/parche-sku-nulo-mensajes-caja`

- [x] Migración `20260929150000_registrar_venta_separar_prendas_sku_nulo.sql`: parche vivo (por ancla,
      con guarda de md5) sobre `registrar_venta` y `separar_prendas`. El único SELECT que llena la
      variable del código de la prenda pasa a `coalesce(v.codigo, v.sku, 'sin código')`, así que ninguno
      de los 17 mensajes de rechazo que la usan puede volver a salir vacío.
- [x] Probada en Postgres desechable (359 migraciones + seed): una variante `sku=NULL, codigo=NULL`
      hacía morir `venta_precio_cambiado` con `22004`; con el parche, el mensaje sale con
      `detail = "... (sin código)"`. Repetir la migración no duplica nada (marca de idempotencia).
- [x] **Pegada en producción** (sonda de huellas antes → ensayo que se revirtió solo → aplicada →
      huella verificada después): `registrar_venta` md5 `b75e79e3359212414fc9972663665bca`,
      `separar_prendas` md5 `cfa59ffeed79162b1d282c680087bb99`, las dos con
      `position('sin código' in pg_get_functiondef(...)) > 0`.
- [ ] No toca `entregar_separacion` (queda fuera de este parche: su `descripcion` la lee
      `itemsParaLucode` como línea manual y un texto con «(sin código)» ahí tomaría un precio con IGV
      como si fuera sin IGV — necesita su propio arreglo, no forma parte de esta tanda).
- [ ] El resto del hallazgo C3 (usar `hint = '<dominio>_<causa>'` como contrato entre la base y la
      pantalla, en vez de que la web decida por el texto del error) sigue pendiente para la semana 1 —
      ver `docs/backlog/2026-09-29-audit-sales-inventory-catalog-5ba247.md`.
