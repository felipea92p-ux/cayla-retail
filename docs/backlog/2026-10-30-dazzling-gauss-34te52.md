## 📑 Estados financieros (2026-10-30, ADR-0585) — rama `claude/dazzling-gauss-34te52`

Implementación de la maqueta `docs/maquetas/finanzas-eeff-2026-10/`, actividad por actividad (`/construir`, 9 aprobadas por Felipe).

- [x] **1 · Quien tiene el módulo ve todo.** Migración `20261030235000` (tres reglas de solo lectura, reemplazos anclados en 18 lecturas)
  y las pantallas de Reportes con `veEstadosFinancierosDeTodoDe` / `veDiarioDeTodoDe`. Probado en un Postgres local con todas las
  migraciones: 31 pruebas de Finanzas antes y después (ADR-0585). **En producción desde el 2026-10-31.**
- [ ] **Sin probar en el navegador logueado:** el contenedor de la sesión no tenía Supabase (sin Docker). Falta abrir Estados financieros
  con una cuenta con el módulo que no sea líder y ver el flujo y el Balance entero.
- [ ] El diccionario (`docs/datos/generado/`) entra cuando la migración esté en producción y se refresque el volcado.
- [ ] **Decisión de Felipe:** ¿el Resumen de Finanzas también muestra CAYLA entera a quien tiene el módulo? Hoy sigue con su tienda.
- [x] **2 · El estado de cambios en el patrimonio en la base.** Migración `20261030235100` (`fn_patrimonio_cambios`), lee el mismo
  diario que el Balance; `pnpm pruebas:patrimonio-cambios` 19/19. **En producción desde el 2026-10-31.**
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
- [x] **7 · ¿Lo tuyo creció?** La respuesta con qué parte de lo ganado retiraste, el puente del mes (con «Sin explicar» si la base no
  cuadra), la línea de 6 meses, las recomendaciones y el cuadro formal plegado por columna. Probado: tipos, 749 archivos de vitest, Knip y
  eslint. **Sin probar en el navegador logueado.**
- [x] **8 · «Descargar para el contador».** Un botón en la cabecera con la lista de seis archivos (cada uno se baja solo); se quitaron los
  cuatro «Descargar Excel» sueltos. Nueva `fn_saldos_por_cuenta` (17 de 17 en `pruebas:saldos-por-cuenta`). Probado: tipos, 750 archivos de
  vitest, Knip y eslint. **Sin probar en el navegador logueado.** Migración `20261031120000` en producción desde el 2026-10-31.
- [x] **9 · Cierre.** Guía de foco: ¿Ganamos?, Flujo, Balance y Campañas pasan a `no-aplica` (solo miran), `PENDIENTES_HOY` 51 → 47.
  Formidable por lectura de código (`docs/formidable/finanzas-estados-financieros.md`). `docs/ARQUITECTURA.md` al día.
- [ ] **Formidable: los 3 cambios esperan OK de Felipe.** La línea de lo tuyo cerca del mes más bajo; «Qué te recomiendo» bajo la
  respuesta bajo 1280 px; las dos tarjetas de CAYLA entera apagadas para una terminal.
- [ ] **Modo oscuro y responsive sin medir:** `pnpm --filter web tema:auditar -- --ruta /finanzas/reportes,/finanzas/reportes/flujo,/finanzas/reportes/balance,/finanzas/reportes/patrimonio --escenarios`
  y `/multi-view-responsive finanzas`, en local con sesión.
- [x] **Producción (2026-10-31):** Felipe pegó `20261030235000`, `20261030235100` y `20261031120000`. Verificado con solo lectura: las
  5 funciones nuevas vivas, las lecturas ancladas a `fn_ve_diario_de_todo` (y `fn_diario` conserva la versión rápida de ADR-0583), el
  flujo con su candado nuevo, el módulo «Resumen y estados financieros», anon sin acceso.
- [ ] **Faltan los saldos de arranque en producción:** `fn_saldos_por_cuenta` responde «Faltan los saldos de arranque». Hasta que el líder
  los registre (¿Cuánto vale CAYLA? ▸ Saldos de arranque), el Balance, ¿Lo tuyo creció? y «Saldos por cuenta» lo dicen en vez de cifras.
- [ ] Refrescar el volcado y el diccionario (`docs/datos/generado/COMO-REFRESCAR.md`).
- [ ] **Decisión de Felipe:** ¿una terminal con el módulo ve todo? Hoy no (precedente ADR-0161 P6).
- [ ] **Cierre del año (enero 2027):** los saldos por cuenta acumulan ingresos y gastos desde el arranque hasta que exista el asiento
  de cierre.
