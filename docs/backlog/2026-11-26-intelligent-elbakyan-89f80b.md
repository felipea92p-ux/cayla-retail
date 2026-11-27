## 💵 El líder se lleva efectivo de la caja fuerte (2026-11-26, ADR-0710) — aprobada por Felipe; migración `20261127010000` **PEGADA en producción** (2026-11-26); PR #2044 sin fusionar; rama `claude/intelligent-elbakyan-89f80b`

- [x] Base: el candado de `movimientos_dinero` acepta un «entre cuentas» de una caja fuerte a «Efectivo entregado al líder», solo con sesión de líder. `pnpm pruebas:lider-se-lleva` (13 casos) en la lista `PRUEBAS`; control sin la migración: 9 de 13 fallan.
- [x] Web: opción «El líder se lleva efectivo» en «Registrar movimiento» y botón «Se lo llevó el líder» en la caja fuerte (detalle y campana). Probado en local a 1440 y 375 px: rechazo por monto de más, guardado y doble clic.
- [x] Guía interactiva de `finanzas.dinero` al día (huella aceptada).
- [x] **Pegada (2026-11-26):** Felipe aprobó la regla y pegó `supabase/migrations/20261127010000_lider_se_lleva_de_la_caja_fuerte.sql`. Leída después en producción: la huella md5 de `retail.fn_movimientos_dinero_validar()` es `d9e7c5f8c3e049123746c8bb19fdc674`, la esperada.
- [ ] **Falta fusionar y publicar** el PR #2044: hasta entonces el botón no existe en la web de producción.
- [ ] **Sin hacer:** `/milimetro auditar`, `/chaos`, `tema:auditar` (oscuro) y `guias:recorrer` sobre la hoja. El cambio visual es un botón de enlace y una opción de combo con piezas que ya existían.
- [ ] **Decide Felipe:** (1) abrir el camino de vuelta, de lo que tiene el líder a la caja fuerte; (2) candado para que «Efectivo entregado al líder» no quede bajo cero; (3) nombre propio del movimiento en las listas (hoy «Entre cuentas»).
