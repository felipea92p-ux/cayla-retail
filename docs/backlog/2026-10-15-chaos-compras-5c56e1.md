## 🧨 /chaos de Compras (2026-10-15) — rama `claude/chaos-compras-5c56e1`, ADR-0421

- [ ] **Pegar en producción**, con el OK de Felipe y en este orden: `20261015170000` (solo `alter table`) y después `20261015171000` (cinco
  reemplazos anclados; verificados contra producción el 2026-10-15).
- [ ] «Revisar si se guardó» en Nueva factura y en los pagos: `fn_resolver_intento` con esas operaciones y `useIntento` en sus pantallas (hoy ya
  no mienten: tras un corte dicen que no saben, y si se corrige y reintenta la base responde `token_reusado`).
- [ ] No cubierto: adjuntos de una factura (storage) y el envío de compras a SUNAT.
