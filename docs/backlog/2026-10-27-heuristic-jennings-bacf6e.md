## 🧵 El Taller como mayorista (enmienda a D-31, ADR-0547) — rama `claude/heuristic-jennings-bacf6e`, solo documentos, sin migraciones

- [x] ADR-0547 escrito (propuesto): cambios por pieza, tres formas de fijar el precio, ejemplo numérico, DECIDÍ / DESCARTÉ / SE ROMPE SI, preguntas al contador.
- [ ] **Felipe responde las 5 preguntas del ADR** (¿mayorista o maquilador?, ¿opción B?, ¿al vender o al entregar?, ¿quién ve la utilidad del Taller?, ¿producirá para CLAURE?). Sin eso no se construye nada.
- [ ] **Contador:** las 6 preguntas del ADR (traslado del mismo RUC sin comprobante ni IGV, precios de transferencia, costo de ventas con mano de obra directa, establecimiento anexo, plan de cuentas 7012/711, rotulado).
- [ ] Al aprobar: agregar la tercera enmienda a D-31 en `docs/datos/DECISIONES-2026-09-12.md` (el texto está al final del ADR) y corregir el párrafo de la cuenta `702` en `docs/datos/modulos/12-contabilidad.md` (en producción es `7012`).
- [ ] Al conectar la referencia: corregir el comentario de `apps/web/lib/eficiencia-reglas.ts`, que todavía dice que la cotización se descartó el 2026-09-22 (la segunda enmienda de D-31 la revivió).
- [ ] Aparte y no es de este ADR: el Taller no tiene dirección en `ubicacion_datos_fiscales`; sin ella no hay punto de partida válido para la guía de remisión de un traslado Taller → tienda (D-83).
