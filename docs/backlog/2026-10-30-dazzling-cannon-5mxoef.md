## ⚡ Finanzas: lecturas que escalan (2026-10-30, ADR-0583) — migración `20261030170000` PEGADA (versión `20261030203931`); rama `claude/dazzling-cannon-5mxoef`

- [x] Medido en producción (solo lectura): `fn_resumen_finanzas` 2.274 ms promedio / 7.055 máx; `fn_item_es_de_claure` 200 µs por línea en TRU y AQP.
- [x] `fn_item_es_de_claure` mira la sede antes que el dueño de la línea (TRU 335 → 57 ms; costo estimado 549 → 118 ms). Arregla 31 lecturas.
- [x] `fn_diario` no rearma el diario vivo de un mes cerrado entero (el Balance deja de crecer con la historia una vez cerrados los meses).
- [x] Web: Resumen pide sueldos estimados y la línea de ventas a la vez que el resumen; Gastos en dos rondas (quedó la versión de #1501, que hace lo mismo); Cuentas y dinero lee sedes y saldos a la vez.
- [x] `pnpm pruebas:finanzas-lecturas-que-escalan` (13 casos) y 34 suites de base en verde contra Postgres local con la migración.
- [x] Pegada en producción el 2026-10-30 (versión `20261030203931`), con el OK de Felipe: confianza ~629 → 162 ms, resumen 1.530 ms medido.
- [x] 16 pruebas de base dejaban de elegir la «Prenda sin registrar» como su prenda (fallaban al azar según la siembra; pasó en el CI de #1498 con `claure-perdidas-y-danadas`).
- [ ] En unos días, mirar `pg_stat_statements` de `fn_resumen_finanzas`, `fn_finanzas_confianza`, `fn_rendimiento_serie` y `fn_observatorio`.
- [ ] El diario del mes en curso se calcula 3–4 veces por carga del Resumen (`resultados_mes`, `fn_presupuesto_vs_real`, la página) y el flujo dos veces.
- [ ] Cerrar los meses de Finanzas (con la migración, un mes cerrado cuesta ~0 en el Balance).
- [ ] Decidir el diario persistido (asientos escritos al registrarse la operación): la solución de fondo para el volumen que viene.
- [ ] `fn_rendimiento_serie` ~550 ms por tienda: `fn_metas_por_dia` → `fn_reparto_meta`.
- [ ] La reserva de ADR-0583 y de la migración no se pudo empujar (403 a la etiqueta): correr `pnpm reservar` desde una sesión con permiso o confirmar que no choca.
