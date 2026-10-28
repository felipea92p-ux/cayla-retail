# 2026-10-02 — Pestañas que siguen la cuenta del navegador (ADR-0309)

- Si otra pestaña cierra sesión o entra con otra cuenta, esta se va sola a `/login` o al inicio (`components/ui/SesionEntrePestanas.tsx`, montado en `app/layout.tsx`).
- Regla pura con prueba: `lib/sesion-entre-pestanas-reglas.ts`. Decisión: `docs/adr/0309-pestanas-siguen-la-cuenta-del-navegador.md`.
- Verificado: prueba unitaria y `tsc`. Falta probar con dos pestañas y dos cuentas reales (salir en una, mirar la otra).
