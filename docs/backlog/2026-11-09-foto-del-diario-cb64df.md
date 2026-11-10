## Finanzas: la foto del diario por mes (ADR-0633, 2026-11-09)

- [x] **Pegadas en producción el 2026-11-09:** `20261109180000`, `20261109182000`, PARTES 1 y 2 de `20261109183000` y `20261109184000` (SQL Editor,
      SHA-256 de cada pegado igual al del archivo; cada una devolvió «QUEDÓ BIEN»). Verificado: las cinco funciones nuevas con el mismo md5 que en
      local, 43 disparadores `diario_vence`, INV-29 activa en el vigía (29 invariantes) y `usar_foto_diario = false`.
- [x] **PARTE 3 de `20261109183000` pegada el 2026-11-09 por la tarde** (Felipe: «Pégala ahora»), con el SHA-256 igual al del archivo: quedan
      49 disparadores `diario_vence`, los 6 del mostrador incluidos (`ventas`, `venta_items`, `venta_pagos`, `venta_anulacion_items`,
      `movimientos`, `cajas`). Entró a la primera, sin `lock timeout`.
- [ ] **Publicar** (fusionar el PR): las dos rutas de Vercel Cron (`/api/finanzas/foto-diario`, cada 5 min; `/api/finanzas/foto-diario/todas`,
      4:00 de Lima). Todo el SQL ya está en producción, así que las rutas encuentran su función al publicar.
- [ ] **Encender el interruptor** (`update retail.parametros_finanzas set usar_foto_diario = true`) solo después de: la primera reconstrucción
      (`vercel logs --query finanzas_foto_diario`, `rehechas > 0`) y una corrida del vigía con INV-29 limpia. Medir antes y después con
      `finanzas_resumen_ms` y el gráfico de memoria. **Volver atrás = apagarlo**, sin migración.
- [ ] **La rama `claude/finanzas-36-tanda-7`** crea `retail.gasto_papeles_tardios` y la suma al diario: al fusionarse con esto en `main`, el candado
      de `pruebas:foto-diario` le pedirá su disparador `diario_vence` (y pegarlo en producción junto con su tabla).
