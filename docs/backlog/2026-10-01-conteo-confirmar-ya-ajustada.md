## ✅ Confirmar sin ajustes fantasma y un solo «Había» (2026-10-01, ADR-0282) — solo web, sin migración; rama `claude/conteo-confirmar-ya-ajustada`

- [x] `yaAjustadaSinTocar` (conteo-reglas): Confirmar excluye de «Se actualizará» las líneas ya ajustadas y sin volver a contar; «Había N» único en marca y nota. Suite web y `tsc` en verde.
- [ ] **Sin ver en producción** hasta fusionar: con el Conteo 25, «Corregir conteo» → Revisar → Continuar debe decir «Ninguna variante cambia» y la nota «1 variante ya se ajustó en el cierre anterior…», y la fila «Había 3» en marca y nota.
