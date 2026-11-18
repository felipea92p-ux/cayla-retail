## 🧾 Cuadre de las puentes «Por depositar» y reinicio desde cero (2026-10-27, ADR-0552) — propuesto, sin construir; rama `claude/sales-account-reconciliation-6b2908`

- [x] Medido y decidido con Felipe: reglas de depósito de Izipay y Vendemás, reinicio de saldos desde cero sin migración, botón «Cuadrar depósitos» con tope de 2 días, estimador por operación con factor aprendido (ADR-0552).
- [ ] **Felipe, en pantalla:** reiniciar las puentes (saldo 0 desde el corte) y el saldo de Interbank Empresas (apertura antes de los abonos del día), y recién después conciliar. Falta el saldo real del BCP Empresa (y, mejor, su extracto de octubre).
- [ ] Decisiones de Felipe: gasto único de comisiones de las máquinas anteriores al corte (con su contador); quién registra las transferencias entre cuentas propias; quién aprieta el botón y a qué hora; cómo evitar que el QR se registre como Yape.
- [ ] Construir las 5 actividades del ADR-0552 con `/construir`, después del congelamiento del cierre (lunes 2-nov 12:00), salvo que Felipe lo exima. Reservado: ADR-0552. Migración: reservar con `pnpm reservar migracion` al empezar.
