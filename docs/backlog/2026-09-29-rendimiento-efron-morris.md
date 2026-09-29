## 🎯 Módulo Rendimiento — falta la segunda mitad (ADR-0219, rama `claude/rendimiento-efron-morris`)

Construida la primera mitad: módulo, `fn_rendimiento_ubicaciones`, `fn_rendimiento_equipo` (ventas, soles, horas) y
la pantalla `/rendimiento` con los dos rankings, «vende más por hora» ya corregido con contracción de Efron-Morris.
Migración `20260929160000`, sin pegar en producción. Detalle en `docs/bitacora/2026-09-29-rendimiento-efron-morris.md`
y la actualización del 2026-09-29 en `docs/adr/0219-rendimiento-ventas-de-cada-persona.md`.

- [ ] **Probar la migración en una base desechable** antes de pegarla (este worktree no tiene el stub de Dynamic
      para `supabase db reset`; ver `postgres-desechable-sin-docker.md`). Después, pegarla en producción con el ok
      puntual de Felipe, y crear en Colaboradores ▸ Roles y accesos el rol «Encargada de tienda» con el módulo
      encendido.
- [ ] **Las demás cifras de la tabla** (D-116 de ADR-0219): ticket promedio, % a precio completo, descuento dado,
      cuadre de caja del mes, bajada al piso a tiempo. Es una migración sobre `fn_rendimiento_equipo`, no un módulo
      nuevo.
- [ ] **La ficha de cada persona** (`/rendimiento/[persona]`, sección 6 del ADR): qué categorías y prendas vende, su
      evolución en 6 meses, sus ventas una por una.
- [ ] **La corrección de quién atendió** (`venta_reasignaciones` + `reasignar_asesora`, sección 4 del ADR) — trae la
      **objeción abierta sin resolver**: la encargada puede corregir cualquier venta de su tienda, incluida la suya
      propia, y también entra al ranking. La propuesta del ADR (la encargada corrige cualquier venta salvo la
      propia; esa la corrige el Admin) necesita el ok de Felipe antes de construirse.
- [ ] **El selector de mes** en la pantalla (hoy siempre el mes calendario de Lima en curso).
- [ ] Confirmar con el equipo de TRU que el cobro **siempre** usa el PIN personal y no un «usuario caja general» en
      hora punta — si no, `asesora_id` queda mal atribuido y el ranking contraído se calcula sobre datos
      contaminados (es el «se rompe si» de la ficha de `rendimiento-reglas.ts`).
