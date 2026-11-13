## ⚡ CLAURE de una pasada en los motores (2026-11-13, ADR-0658, `cambiar-de-modulo#13`) — migración PEGADA en producción el 2026-11-13; rama `claude/claure-de-una-pasada`

- [x] Medir #13 antes de construirla (copia de un año con una sede de CLAURE): la tabla le ganaba como mucho ~40 ms al piso; lo caro era `fn_item_es_de_claure` por línea.
- [x] `fn_lineas_de_claure` + 7 reemplazos anclados (`fn_piso_plan_lectura` ×1, `fn_plan_compra` ×6), con candado md5 del cuerpo vivo y chequeo final.
- [x] Salida idéntica por md5 (7 sedes del piso, 3 llamadas del plan de compra) y las mismas líneas en 5 ventanas.
- [x] `pnpm pruebas:lineas-de-claure` en el CI; `claure-analisis-y-motores` deshace esta migración antes de reaplicar la de CLAURE.
- [x] **Pegada en producción el 2026-11-13** (`20261113201000`, con el OK de Felipe en la sesión): md5 de main antes, SHA-256 del archivo comprobado, «QUEDÓ BIEN» y la verificación de solo lectura dio `true | true | true | 0`.
- [ ] Un día después de pegarla: comparar en `pg_stat_statements` las medias de `fn_plan_compra` y `fn_piso_plan_lectura` contra 2,3 s y 908 ms (2026-11-13).
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando esté pegada: entra `fn_lineas_de_claure`.
- [ ] Cuando el informe `docs/innovacion/2026-11-13-cambiar-de-modulo.md` llegue a `main`, su fila `cambiar-de-modulo#13` en `docs/innovacion/README.md` pasa a «hecha con otro camino (ADR-0658)».
- [ ] Lo que sigue lento en el piso (~380 ms armando las tallas de la sede) es de la pantalla: Existencias con el plan del piso en `<Suspense>` (derivado en el informe a `skill-optimizacion-ui-ux-perf`).
- [ ] Inventario ▸ Resumen (`fn_resumen_variantes_json`, 1,3 s) no se arregla con esto: su costo es recorrer `movimientos` para los días con stock (ADR-0194 #8).
