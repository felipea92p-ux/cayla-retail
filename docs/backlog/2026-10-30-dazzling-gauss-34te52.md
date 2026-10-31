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
- [x] **3 · El nombre y las cuatro respuestas.** Menú «Estados financieros»; módulo «Resumen y estados financieros» en Roles y accesos
  (el `update` va en la `20261030235000`); `CabeceraEstados` con las cuatro `TarjetaCifra` como pestañas; página de «¿Lo tuyo creció?»;
  Presupuesto, Campañas y Escenarios como páginas internas con su vuelta; guías y huellas al día. Probado: tipos, 745 archivos de vitest,
  Knip y eslint. **Sin probar en el navegador logueado.**
- [x] **4 · ¿Ganamos?** La cascada con la raya de lo planeado y sus partes, lo que dejó cada sede, las campañas, «Qué te recomiendo» y el
  formato formal plegado (sin cuentas). Presupuesto retirado: redirige a ¿Ganamos?. Probado: tipos, 746 archivos de vitest, Knip y
  eslint. **Sin probar en el navegador logueado.**
- [x] **5 · ¿Dónde está la plata?** El puente del mes en el método directo, la frase de por qué la plata no siguió a la ganancia, lo que
  viene, «¿Y si…?» (Escenarios entero, dentro; su ruta redirige), las recomendaciones y el formato formal plegado. Probado: tipos, 747
  archivos de vitest, Knip y eslint. **Sin probar en el navegador logueado.**
- [x] **6 · ¿Cuánto vale CAYLA?** La balanza (dos `BarraApilada` del mismo largo, sus tramos se tocan), los dos medidores, lo de cada
  sede, las recomendaciones y lo formal plegado, sin cuentas. Probado: tipos, 748 archivos de vitest, Knip y eslint. **Sin probar en el
  navegador logueado.**
- [ ] 7 · ¿Lo tuyo creció?
- [ ] 8 · «Descargar para el contador» con opciones.
- [ ] 9 · Cierre: oscuro, `/focus`, `/formidable`, `docs/ARQUITECTURA.md`.
