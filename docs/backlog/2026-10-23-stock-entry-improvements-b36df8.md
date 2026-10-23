## 📦 El stock se carga en Existencias (2026-10-23) — maqueta para elegir, sin código del ERP; rama `claude/stock-entry-improvements-b36df8`

- [x] Análisis de los dos caminos (Editar producto vs. Existencias) y maqueta tocable con tres formas: `docs/maquetas/existencias-ajustar-stock-2026-10/` (README con el porqué y las reglas). Revisada en el navegador a 1440, 1024 y 375 px, en claro y oscuro.
- [x] Decidido por Felipe: Nuevo producto conserva sus unidades del día; Editar producto queda con números y «Ajustar en Existencias»; la tabla arranca en «Conté y hay otro número» (hoy son sobre todo correcciones).
- [x] Felipe eligió la forma A sobre el modal actual, con más peso para «Ajustar stock» y una vista «sofisticada, elegante y full animaciones».
- [x] Ronda 2: `ronda-2.html` (tres pesos, planilla o riel, coreografía completa), revisada a 1024 y 375 px, claro y oscuro.
- [ ] **Felipe elige el peso (1, 2 o 3) y la vista (planilla o riel).**
- [ ] Al construir: sumar la excepción de movimiento de esta vista a ADR-0136 y a la lista de CLAUDE.md, con su prueba de movimiento como las de Insignias y Campañas.
- [ ] Actividad 1: la tabla en Existencias con la forma elegida, «Ajustar stock» en la cabecera y «Etiquetas de lo que entró». Reemplaza el recorrido de 4 pasos por talla (`FlujoTalla` «ajustar»). Sin migración (`ajustar_inventario`).
- [ ] Actividad 2: Existencias encuentra las prendas que la tienda nunca tuvo (búsqueda y escáner); hoy `getExistencias` solo lista lo que tiene fila de `stock` o viene en camino.
- [ ] Actividad 3, al final: Editar producto de solo lectura en stock (sin − / + en la matriz ni en el panel del taller) con «Ajustar en Existencias».
- [ ] Sin medir: cuántos ajustes se hicieron desde la ficha y con qué motivo (la lectura de producción estaba bloqueada en esta sesión).
- [ ] Sin confirmar en producción: que todo rol que hoy carga stock desde Productos tenga Existencias (ADR-0306 dice que Integrante y los terminales sí).
