## Finanzas: el Resumen que tarda 6 s (diagnóstico del 2026-11-09)

- [x] **Pegada en producción el 2026-11-09** (SQL Editor, con el SHA-256 de lo pegado igual al del archivo; devolvió «QUEDÓ BIEN»). Verificado ahí
      mismo: la función quedó con el mismo md5 que en local, las 133 comisiones y las 127 reversas de octubre y noviembre valen lo mismo que
      `fn_pos_comision_lote`, y `fn_asientos_dinero_y_caja` de esos dos meses bajó de 1.465 ms y 71.627 bloques a 167 ms y 27.672.
- [ ] **Volver a medir en una semana** `fn_resumen_finanzas` y `fn_estado_resultados` en `pg_stat_statements` (por la API, con sesión: no se
      pueden llamar como `postgres`).
- [ ] **Decide Felipe: cerrar octubre en Cierre de mes.** Ningún mes está cerrado, así que el diario se arma de cero en cada pantalla. Cerrar
      congela el de ese mes (`diario_cerrado`) y el «mes anterior» del Resumen deja de recalcularse.
- [ ] **Siguiente vuelta del diario:** el resto de `fn_asientos_dinero_y_caja` (~28.000 bloques en oct–nov), `fn_asientos_claure` (24.000) y
      `fn_costo_variante_al` (~7 bloques por llamada, una por prenda vendida y por movimiento).
- [ ] **Abrir por dentro** `fn_flujo_caja_proyeccion` y `fn_presupuesto_vs_real` (~2 s cada una), que el Resumen también llama.
- [ ] **Decide Felipe: encender `track_functions = 'pl'`** en producción para ver el tiempo de cada función por dentro. Hoy no se registra, y por
      eso las piezas se midieron a mano.
