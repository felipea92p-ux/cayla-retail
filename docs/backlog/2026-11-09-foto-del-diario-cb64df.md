## Finanzas: la foto del diario por mes (ADR-0633, 2026-11-09)

- [x] **Pegadas en producción el 2026-11-09:** `20261109180000`, `20261109182000`, PARTES 1 y 2 de `20261109183000` y `20261109184000` (SQL Editor,
      SHA-256 de cada pegado igual al del archivo; cada una devolvió «QUEDÓ BIEN»). Verificado: las cinco funciones nuevas con el mismo md5 que en
      local, 43 disparadores `diario_vence`, INV-29 activa en el vigía (29 invariantes) y `usar_foto_diario = false`.
- [ ] **PARTE 3 de `20261109183000`, de noche** (después de las 22:00 de Lima): los disparadores de `ventas`, `venta_items`, `venta_pagos`,
      `venta_anulacion_items`, `movimientos` y `cajas`. Hasta pegarla, una venta del mes pasado corregida no vence la foto: por eso el interruptor
      no se enciende antes.
- [ ] **Publicar** (fusionar el PR): las dos rutas de Vercel Cron (`/api/finanzas/foto-diario`, cada 5 min; `/api/finanzas/foto-diario/todas`,
      4:00 de Lima). Antes de publicar, la PARTE 3 y `184000` en producción (sin `184000`, la ruta respondería 500 cada 5 minutos).
- [ ] **Encender el interruptor** (`update retail.parametros_finanzas set usar_foto_diario = true`) solo después de: la primera reconstrucción
      (`vercel logs --query finanzas_foto_diario`, `rehechas > 0`) y una corrida del vigía con INV-29 limpia. Medir antes y después con
      `finanzas_resumen_ms` y el gráfico de memoria. **Volver atrás = apagarlo**, sin migración.
- [ ] **La rama `claude/finanzas-36-tanda-7`** crea `retail.gasto_papeles_tardios` y la suma al diario: al fusionarse con esto en `main`, el candado
      de `pruebas:foto-diario` le pedirá su disparador `diario_vence` (y pegarlo en producción junto con su tabla).
