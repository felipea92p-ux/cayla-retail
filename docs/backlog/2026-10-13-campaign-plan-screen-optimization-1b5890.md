## 🗓️ Plan de campaña según el momento (2026-10-13, ADR-0349 act. 2026-10-13): solo web, sin migración; rama `claude/campaign-plan-screen-optimization-1b5890`

- [x] Empezada o terminada sin plan: aviso con «Ver cómo va» y «Planificar <la próxima>» (o «Nueva campaña» para el líder). Lógica en `lib/plan-compra-momento.ts`, 22 pruebas.
- [x] Columnas que no dicen nada fuera (las 4 formas de la tabla), píldoras que no filtran fuera, «Sin plan» repetido fuera, «N.º» en pizarra, lo vendido como cifra, las fechas una sola vez y el chip con «termina en N días».
- [x] Línea de stock sin cuadrar sobre la tabla, con «Ver qué falta» (abre el cajón).
- [x] Guía interactiva al día (2 pasos nuevos, huella aceptada), `guias:recorrer` con 24 pasos en verde y `tema:auditar` con 0 hallazgos en oscuro. Medido a 1440, 1024 y 375 px.
- [ ] **Sin PR** (Felipe lo ve antes). Rama al día con `main` tras #1006 y #1022 (2026-10-13). El choque real con #1022 era que «Campaña nueva» pasó a la hoja del calendario: el aviso «empezó sin plan» ahora también ofrece una campaña del calendario sin plan como «la próxima» (`proximaCampana` con `ranurasSinPlan`) y la abre en su hoja. Probado con pruebas; en el navegador local solo el camino «plan que ya existe» (la base local no tiene la migración `20261012234000`).
- [ ] **Decisión de Felipe — recordatorio previo:** avisar en Inicio del líder, N semanas antes de cada campaña sin plan, que hay que armarlo (toca otro módulo). El Aniversario 2026 llegó al día 13 con 0 de 45.
- [ ] **Decisión de Felipe — encargadas de sede:** el módulo `plan_compra` nació solo para el líder. Para que lo usen las encargadas, se les da en Colaboradores ▸ Roles y accesos (no desde el código). El tope, lo que sobra y el reparto siguen siendo del líder (`esLider`).
- [ ] La cabecera dice «Todas las tiendas» y el selector de arriba «Tienda Trujillo». Resultados e Historial siguen la sede; el Plan no. Hay que decidir si el Plan la sigue o si se dice en la cabecera.
- [ ] La prueba ciega confundió «cómo vamos con las compras» con Resultados, que solo habla de ventas. Hay que ver si Resultados muestra lo pedido en órdenes de la campaña.
- [ ] De la lista aparte de Formidable siguen abiertos: la curva plegada, la lupa del buscador (global) y el contraste del segmento «modo» (global).
- [ ] Velocidad (`scripts/rendimiento/ui.mjs`): `/compras/plan` monta 10 modales con import fijo (`modales-fijos`, `peso-cliente` de 2652 líneas). Candidato a `next/dynamic` para las hojas de líder (Tope, Recupero, Reparto, Editar, Archivadas).
- [ ] Segunda ciega (después): «Ver qué falta» abre el cajón general y esperaba solo la lista; volver de Historial a Plan pierde `?plan=` (es anterior a esta rama).
