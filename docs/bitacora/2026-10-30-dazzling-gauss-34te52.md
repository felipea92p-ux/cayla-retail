- **2026-10-30 · Estados financieros, actividad 1 (ADR-0585).** Quien tiene el módulo ve los estados de CAYLA entera. Para eso nace
  una regla de solo lectura, sin ampliar la de escribir gastos; una terminal sigue viendo solo su tienda. Probado en un Postgres local
  armado con las 1004 migraciones: 31 pruebas de Finanzas antes y después de la migración, que no está en producción.
- **2026-10-31 · Estados financieros, actividades 2 a 9 (ADR-0585).** Reportes pasó a «Estados financieros»: cuatro preguntas
  (¿Ganamos?, ¿Dónde está la plata?, ¿Cuánto vale CAYLA?, ¿Lo tuyo creció?), cada una con su respuesta, su cascada o balanza, «Qué te
  recomiendo» y lo formal plegado, sin cuentas en pantalla. Las cuentas van en «Descargar para el contador», que tiene seis archivos y
  baja uno por opción. Nacieron `fn_patrimonio_cambios` y `fn_saldos_por_cuenta`. Probado: tipos, 750 archivos de vitest, Knip, eslint y
  las pruebas de Postgres de Finanzas. Las tres migraciones se pegaron en producción el 2026-10-31 y se verificaron; las pantallas no se probaron en el navegador con sesión.
- **2026-10-31 · Estados financieros igual a la maqueta (ADR-0585, actualización).** Felipe vio que ¿Ganamos? no se parecía a la maqueta:
  se había reusado la cascada del Resumen. Ahora los cuatro estados usan la cascada de la maqueta y su respuesta, y el formato formal es una
  opción arriba («Respuesta | Formato formal») en vez de ir plegado al final. Comparado en capturas con la maqueta antes de subir.
