- **2026-10-30 · Estados financieros, actividad 1 (ADR-0585).** Quien tiene el módulo ve los estados de CAYLA entera. Para eso nace
  una regla de solo lectura, sin ampliar la de escribir gastos; una terminal sigue viendo solo su tienda. Probado en un Postgres local
  armado con las 1004 migraciones: 31 pruebas de Finanzas antes y después de la migración, que no está en producción.
- **2026-10-31 · Estados financieros, actividades 2 a 9 (ADR-0585).** Reportes pasó a «Estados financieros»: cuatro preguntas
  (¿Ganamos?, ¿Dónde está la plata?, ¿Cuánto vale CAYLA?, ¿Lo tuyo creció?), cada una con su respuesta, su cascada o balanza, «Qué te
  recomiendo» y lo formal plegado, sin cuentas en pantalla. Las cuentas van en «Descargar para el contador», que tiene seis archivos y
  baja uno por opción. Nacieron `fn_patrimonio_cambios` y `fn_saldos_por_cuenta`. Probado: tipos, 750 archivos de vitest, Knip, eslint y
  las pruebas de Postgres de Finanzas. Las migraciones no están en producción y las pantallas no se probaron en el navegador con sesión.
