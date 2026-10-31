## 📑 Estados financieros (2026-10-30, ADR-0585) — rama `claude/dazzling-gauss-34te52`

Implementación de la maqueta `docs/maquetas/finanzas-eeff-2026-10/`, actividad por actividad (`/construir`, 9 aprobadas por Felipe).

- [x] **1 · Quien tiene el módulo ve todo.** Migración `20261030235000` (tres reglas de solo lectura, reemplazos anclados en 18 lecturas)
  y las pantallas de Reportes con `veEstadosFinancierosDeTodoDe` / `veDiarioDeTodoDe`. Probado en un Postgres local con todas las
  migraciones: 31 pruebas de Finanzas antes y después (ADR-0585). **No está en producción:** se pega entera, de una vez.
- [ ] **Sin probar en el navegador logueado:** el contenedor de la sesión no tenía Supabase (sin Docker). Falta abrir Estados financieros
  con una cuenta con el módulo que no sea líder y ver el flujo y el Balance entero.
- [ ] El diccionario (`docs/datos/generado/`) entra cuando la migración esté en producción y se refresque el volcado.
- [ ] **Decisión de Felipe:** ¿el Resumen de Finanzas también muestra CAYLA entera a quien tiene el módulo? Hoy sigue con su tienda.
- [x] **2 · El estado de cambios en el patrimonio en la base.** Migración `20261030235100` (`fn_patrimonio_cambios`), lee el mismo
  diario que el Balance; `pnpm pruebas:patrimonio-cambios` 19/19. **No está en producción:** se pega después de la `20261030235000`.
- [ ] 3 · El nombre y las cuatro respuestas.
- [ ] 4 · ¿Ganamos? · 5 · ¿Dónde está la plata? · 6 · ¿Cuánto vale CAYLA? · 7 · ¿Lo tuyo creció?
- [ ] 8 · «Descargar para el contador» con opciones.
- [ ] 9 · Cierre: oscuro, `/focus`, `/formidable`, `docs/ARQUITECTURA.md`.
