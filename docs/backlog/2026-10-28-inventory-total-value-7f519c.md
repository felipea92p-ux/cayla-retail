## 🧾 El valor del inventario a costo en Existencias (2026-10-28, ADR-0557) — migración por pegar; rama `claude/inventory-total-value-7f519c`

- [x] `fn_valor_inventario_existencias()` y `fn_tallas_sin_costo(sede)` (`20261028211000`): una fila por sede, puerta en la base, dañado y CLAURE aparte, sin costo contado. Probado en Postgres local: 25 casos con mutación de 7 reglas (`pnpm pruebas:valor-inventario-existencias`, ya en el CI).
- [x] «Ver el valor a costo» y «Ver cuáles» en Existencias, con su paso de guía y huella. Verificado en el navegador con la base local (escritorio, 375 px, modo oscuro) y con costos puestos en cero a mano, ya restaurados.
- [x] **PEGADO en producción (2026-10-28, Felipe; la consulta de verificación dio `quedo_bien = true`):** `supabase/migrations/20261028211000_valor_inventario_existencias.sql` (una sola parte, sin políticas), **después de `20261027222000` y `20261028153000`** (ADR-0542): lee `retail.stock_dueno`. Con el SQL pegado, el enlace aparece al fusionar el PR #1449.
- [ ] **Sin verificar en producción:** si la Terminal Almacén tiene Facturas de compra o Por pagar (entonces ve la cifra de su sede). Mirar Colaboradores ▸ Roles y accesos. La lectura de producción estaba denegada.
- [ ] **Sin probar con datos reales:** cuántas tallas sin costo hay hoy y cuánto del valor viene de una compra. En el volcado del 26-oct casi todo el costo era el del alta (24 filas en `costo_historial`).
- [ ] **Aparte:** el Balance cuenta las unidades de CLAURE como mercadería de CAYLA (sesión «Balance: sacar el stock de CLAURE de la Mercadería»). Decisión contable de Felipe antes del cierre de octubre.
- [ ] **Si se quiere:** «Sin costo» como filtro de la lista de Existencias (se descartó: tocaba ocho archivos y no servía en el Taller).
- [ ] **`pnpm datos:comparar`** marcará estas dos funciones hasta que estén en producción y se refresque el volcado.
