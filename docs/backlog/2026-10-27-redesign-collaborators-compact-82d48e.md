## 🧾 Colaboradores compacto (2026-10-27, ADR-0540) — solo web, sin migración; rama `claude/redesign-collaborators-compact-82d48e`

- [x] Maqueta aprobada (`docs/maquetas/colaboradores-compacto-2026-10/`).
- [x] Corte 1 Equipo compacto · 2 Ficha con foco y «Cambiar rol» · 3 Dar acceso en tres pasos · 4 Roles con píldoras y borrador en verde/rojo · 5 Actividad.
- [ ] Probar con cuentas reales (líder, integrante con el módulo, terminal) y a 375 px; correr `pnpm --filter web guias:recorrer` contra el ERP local.
- [ ] `/formidable` y `/chaos` de la ficha y de Dar acceso (guardan).
- [ ] **Varias sedes por persona (corte 6):** diagnóstico de qué lee «la sede» de la persona → diseño (tabla puente, `agregar_colaborador`, `cambiar_ubicacion`) → OK de Felipe → migración. Nada se aplica en producción sin su OK.
- [ ] Decidir si la guía interactiva explica el interruptor Lista/Mosaico (hoy no hay paso).
