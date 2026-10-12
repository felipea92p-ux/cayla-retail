## 🔁 No se cambia por una prenda sin precio (2026-10-12, ADR-0385) — migración `20261012201000` **EN PRODUCCIÓN (2026-10-12)**; PR #988; rama `claude/cambio-sin-precio`

- [x] `registrar_cambio` rechaza un precio de cambio ≤ 0 con `cambio_sin_precio` (reemplazo anclado, sin escribir nada; sin excepción de Empaque).
- [x] Web: `validarCambio` pide el `precio` de la prenda nueva y frena «X no tiene precio»; frases de tienda para `cambio_sin_precio` y para el
      candado de precio de Apartados.
- [x] `pnpm pruebas:cambio-sin-precio` (nueva, en el CI) — la regresión fallaba antes del arreglo; vitest y `tsc` en verde.
- [x] Verificado en el navegador local a 1440 y 375 px, con la base fotografiada antes y restaurada idéntica después.
- [x] **`20261012201000_cambio_sin_precio.sql` pegada en producción** (2026-10-12, OK puntual de Felipe): ensayo revertido, huella `8fed9514…` igual a la local.
- [ ] Revisar Proformas (`crear_proforma`) con una prenda en S/ 0.
