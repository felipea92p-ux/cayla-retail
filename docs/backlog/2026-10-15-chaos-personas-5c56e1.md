## 🧨 /chaos de Clientes, Colaboradores y Configuración (2026-10-15) — rama `claude/chaos-personas-5c56e1`, ADR-0416

- [x] ~~**Pegar en producción**~~ — hecho el 2026-10-15 con el OK de Felipe (22 candados validados, `anonimizar_solo_lider`, disparador). Era, en este orden: `20261015154000` (solo `alter table`; `ubicaciones` y `colaboradores`
  las lee todo el ERP: fuera de horario) y después `20261015155000` (un reemplazo anclado en `archivar_clienta` y un disparador).
- [ ] Compras: correr `/chaos` y cerrar su `NaN` (compras, compra_items, notas de crédito, despachos, órdenes de compra, planes) cuando
  termine su reconstrucción (#1040, #1088).
- [ ] No cubierto: una cuenta «líder no admin» (en el seed, Felipe y Sandra son admin), así que «solo alcanzas a quien está por debajo de
  ti» entre líderes no se pudo probar.
