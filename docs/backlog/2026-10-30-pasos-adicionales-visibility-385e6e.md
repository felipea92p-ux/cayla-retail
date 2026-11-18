## 2026-10-30 — «Agregar un paso»: lo bloqueado se ve (rama `pasos-adicionales-visibility-385e6e`, sin PR)
- [x] La hoja lista los pasos bloqueados apagados y con su motivo + frase bajo el combo (ADR-0566, actualización 2026-10-30).
- [x] «Otro proceso…» respeta «un paso de después ya empezó» antes de dar de alta el proceso.
- [x] La fila «Quién lo hace» muestra el nombre del proceso nuevo, no `__otro__`.
- [ ] **Decisión de Felipe:** ¿se debe poder agregar Ojales y botones aunque Planchado ya esté hecho? Hoy no (la base lo rechaza); permitirlo es un cambio de `agregar_paso_orden` y de cómo se leen los conteos.
