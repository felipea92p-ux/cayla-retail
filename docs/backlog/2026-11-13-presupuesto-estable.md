## 📈 El presupuesto de rendimiento, estable (2026-11-13, ADR-0656 act. b) — solo `scripts/`; rama `claude/presupuesto-estable`

- [x] `vacuum (analyze)` + `reindex schema concurrently retail` antes de medir. Probado en una copia hinchada a propósito: 18 cifras iguales (diferencia máxima de 0,03 %), con el control del script anterior en rojo.
- [x] `PRESUPUESTO_BASE` para medir contra una copia de la base sin tocar la compartida.
- [ ] Aceptar el presupuesto desde la primera corrida del CI de este PR (`pnpm rendimiento:aceptar -- --desde-ci <id>`) y comprobar que la corrida siguiente repite las cifras.
