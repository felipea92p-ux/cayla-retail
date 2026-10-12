## Apartados ▸ Historial: abre en «Todos» y por período (2026-10-10) — rama `claude/historial-apartados-orden-c46c85`

- [x] «Todos» primero y marcado al entrar.
- [x] Período de lo cerrado (Hoy · 7 · 30 · 90 días · Personalizado · Todo el historial), 30 días al entrar; lo abierto o por devolver sale siempre. `buscar_separaciones(p_desde, p_hasta)`, migración `20261010180000`; prueba en `pruebas:separaciones`; lógica en `lib/historial-apartados-reglas.ts` con su prueba.
- [x] `20261010180000_historial_apartados_por_fecha.sql` **en producción** (Felipe la pegó el 2026-10-10; verificada: una sola firma con `date, date`, `authenticated` sí, `anon` no).
- [ ] `pnpm datos:generar:produccion` cuando se refresque el volcado.
- [ ] Probarlo con una cuenta real en `/vender/apartados` (la página de prueba local no tenía sesión: el cambio de período se verificó hasta la llamada a la base, y la base con `pruebas:separaciones`).
