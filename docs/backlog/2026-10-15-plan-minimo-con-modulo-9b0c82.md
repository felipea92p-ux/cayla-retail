## Compras ▸ Plan de campaña: «Fijar un mínimo» con el módulo (2026-10-15) — rama `claude/plan-minimo-con-modulo-9b0c82`

ADR-0362, decisión 64.

- [x] `guardar_plan_compra_minimo` ya no pide ser líder y bloquea el plan antes de sumar los mínimos (`20261015141000`, en producción con el
  OK de Felipe: `20261015141027`).
- [x] La web: «Fijar un mínimo» / «Cambiar los mínimos» para quien ve el Plan; los textos y la guía dicen quién lo fija.
- [x] `pruebas:plan-compra-minimo` en la lista del CI.
- [x] El documento de traspaso de Compras (`docs/compras/ordenes-de-compra-2026-10/README.md`) con el estado del 2026-10-15.
- [x] En el navegador del banco: Micaela (no es líder) con el Plan de campaña ve «Fijar un mínimo» y abre la hoja; guardar le pide a alguien
  de turno (el candado de asistencia de siempre, ADR-0162; el banco no tiene la asistencia de Dynamic), así que el guardado desde la hoja
  se probó como admin (Lima 20 %, firmado) y el de ella, en la base (`pruebas:plan-compra-minimo`, N1).
- [ ] Probarlo en producción con una cuenta que no sea líder, tenga el Plan de campaña y esté de turno.
