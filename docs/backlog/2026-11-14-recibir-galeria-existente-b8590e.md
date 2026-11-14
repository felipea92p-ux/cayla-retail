## 2026-11-14 · Recibir: galería de la prenda que ya existe (tarea 9)

- [x] **Pegada en producción** (2026-11-14, OK de Felipe): `20261114165000_recibidas_del_proveedor_al_recibir.sql`. Huella `md5(pg_get_functiondef)` = `0276c641…`, igual que la local.

- [ ] **Decisión de Felipe:** las fichas repetidas de CLAURE en Trujillo y Arequipa siguen saliendo dobles en la galería. Corrección (2026-11-14, /innovar): no hace falta migración: «Fusionar productos repetidos» (Catálogo ▸ Productos, ADR-0650) las junta y suma su stock por sede. Mueve stock: lo decide Felipe.
- [ ] Probar con la prenda en la mano: encontrar su ficha entre 30 de la misma categoría sin abrir ninguna (la verificación que pide el tablero).
- [ ] `fn_prendas_para_recibir` (una sola marca, la de «¿Esta prenda ya existe?») no trae el `color_hex`: sus puntos de color salen en hueso con filo. Sumarlo es una migración de lectura, si se quiere.
