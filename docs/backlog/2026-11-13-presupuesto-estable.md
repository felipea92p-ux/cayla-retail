## 📈 El presupuesto de rendimiento, estable (2026-11-13, ADR-0656 act. b) — solo `scripts/`; rama `claude/presupuesto-estable`

- [x] `vacuum (analyze)` + `reindex schema concurrently retail` antes de medir. Probado en una copia hinchada a propósito: 18 cifras iguales (diferencia máxima de 0,03 %), con el control del script anterior en rojo.
- [x] `PRESUPUESTO_BASE` para medir contra una copia de la base sin tocar la compartida.
- [x] Presupuesto aceptado desde la corrida 43517420718 del CI de este PR: las 20 medidas, con `fn_mi_sesion` de #1823. Las 14 del marco coinciden bloque a bloque con las de una copia local con las migraciones de #1823.
- [ ] Comprobar que la corrida siguiente del CI repite las cifras.
