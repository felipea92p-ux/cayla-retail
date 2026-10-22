## 🧾 El costo de planilla es el costo real (2026-10-22, ADR-0474, migración `20261022164000`) — rama `claude/provision-monthly-salary-f516ff`

- [x] `retail.planilla_por_sede.costo_total` y `fn_planilla_provision_calc` suman `total + AFP + renta de 4ª + EsSalud + provisiones`; la tasa por hora del estimado de hoy pasa a la base del bruto. `pnpm pruebas:planilla-provision` con casos CR1–CR5 y V1–V6.
- [ ] **POR PEGAR en producción:** `supabase/migrations/20261022164000_planilla_costo_real_con_cargas.sql` (un solo pegado; sondas de huella antes y después). Al pegarla cambia de inmediato la planilla de septiembre (+S/ 4 777): no hay ningún mes cerrado.
- [ ] **El contador** revisa si el costo va en la 62 junta (hoy) o separado en 621 (remuneraciones), 627 (EsSalud) y 629 (beneficios sociales).
- [ ] **Validar el estimado de hoy** contra el cierre del día (comparar el de las 18:00 con lo que Dynamic suma al cerrar las jornadas).
- [ ] `al_cierre` sigue sin contar lo de hoy; el Flujo de caja sigue repitiendo el último período pagado (y lee `pagado`, el neto: la AFP y SUNAT salen por sus propios movimientos).
