## 🧩 Unificar, ronda 5: vacíos, avisos y buscadores (2026-10-07/08, ADR-0358) — solo web, sin migración; rama `claude/unificar-next-round-bdaaa0`

- [x] Censo nuevo (`vacio,aviso,buscador`) con Admin (242 vistas) y `terminal-ventas`; depurado contra el código.
- [x] Propuestas en `docs/unificar/propuestas/{vacio,aviso,buscador}.html`; lámina rehecha con ellas.
- [x] Página de elegir con demos vivas, fotos reales antes/después (claro, oscuro, 375 px) y «Ver en oscuro»; `elegir.mjs` con `estilos`, `guion`, `fotosAlFinal` y el arreglo de `.op > input`.
- [x] Felipe elige (8 preguntas) mirando y tocando (2026-10-08).
- [x] Registrar las tres decisiones, construir `<Vacio>`, `<Aviso>` y `<Buscador>` en `components/ui/` con su movimiento, firmas y deuda en `familias.mjs`.
- [x] Migrar módulo por módulo (Felipe: mostrador primero; Finanzas y Análisis se suman; todo vacío de búsqueda se deshace ahí). Deuda 0.
- [ ] Pendiente chico: el vacío de Recepciones de compra no tiene «Limpiar filtros» (el filtro llega como prop); en Proveedores del Taller, con todo archivado, el «Limpiar» no cambia nada.
- [ ] Cambios y Devoluciones siguen buscando con su botón (la consulta va a la base por DNI o boleta): ¿pasar también a buscar mientras se escribe? Es de Felipe.
- [ ] Censo de la ronda 6 (`combo`, `tabla`, `titulo-seccion`) hecho; falta depurar, la pasada del mostrador y la página de elegir.
