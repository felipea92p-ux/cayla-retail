## 🧾 «Provisionado» y lo de hoy por horario (2026-10-22, ADR-0453 act., migración `20261022081000`) — rama `claude/provision-monthly-salary-f516ff`

- [x] `fn_planilla_hoy_por_sede` (interna) + columna `hoy_estimado` en `fn_planilla_provision_calc` y `fn_planilla_provision`; sin feriado, sin jornada rara, se reemplaza al cerrar. `pnpm pruebas:planilla-provision`: 61 verificaciones, con control negativo (quitar un candado hace fallar 4 y 2 casos).
- [x] Web: `leerProvision` suma `hoy_estimado` al devengado; «estimado» pasa a «provisionado» en la tarjeta de confianza, Resultados y su nota. +7 pruebas.
- [ ] **POR PEGAR en producción:** `supabase/migrations/20261022081000_planilla_provision_hoy_por_horario.sql` (un solo pegado; con sondas de huella antes y después). La web es segura en cualquier orden.
- [ ] **Validar en horario de trabajo (solo lectura):** el estimado de hoy contra jornadas ABIERTAS reales, sobre todo la pausa de almuerzo; comparar el estimado de las 18:00 con lo que Dynamic suma al cerrar el día. De noche no hay jornadas abiertas.
- [ ] **EsSalud del empleador** (~S/ 1 993 al mes) no está en `total + provision_total` en Dynamic: el costo de planilla de retail la omite. Confirmar con Dynamic.
- [ ] `al_cierre` sigue sin contar lo de hoy (su ritmo usa días corridos con hoy y horas hasta ayer: subestima ≈ 1/23). Decidir si se corrige.
- [ ] El Flujo de caja sigue repitiendo el último período pagado (paso siguiente del ADR-0453).
- [ ] `/chaos` no aplica (solo lectura); la guía de foco y las guías interactivas no cambian (no hay controles nuevos).
