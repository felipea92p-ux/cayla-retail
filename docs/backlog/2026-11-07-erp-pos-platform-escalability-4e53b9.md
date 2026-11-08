## 🧾 El día de tienda en el CI, con las invariantes de /chaos (2026-11-07) — sin migración; rama `claude/erp-pos-platform-escalability-4e53b9`

- [x] `pnpm pruebas:dia-de-tienda`: abrir caja → venta efectivo con boleta → venta mixta → anular → cambio → devolución → cerrar caja, con las 28 invariantes después de cada paso. ROLLBACK. Verificado: 7/7 en una base aislada con todas las migraciones de `main`.
- [x] Prueba de control: dos mutantes (pago de más, stock adelantado al anular) se cazan en el paso donde nacen (INV-02 + INV-09, INV-01).
- [x] En la tanda de Postgres del CI (`scripts/ci/pruebas-postgres.mjs`), junto a `registrar-venta`.
- [ ] **Sin medir en el CI:** su duración entra como «sin medir» (vale la mediana) hasta el próximo `--medir`.
- [ ] **Siguiente vuelta, si Felipe la pide:** traslado entre sedes (INV-08) y ajuste de inventario; y un día con dos cajeras a la vez (concurrencia), que hoy cubre `/chaos` a mano.
- [ ] **Nota de entorno:** la base local compartida (`supabase_db_cayla-retail`) va ~520 migraciones atrás de `main` y la suite falla ahí por `pedido_web_lineas`; en local se corre con `RETAIL_CONTENEDOR_PG=<pila aislada>`.
