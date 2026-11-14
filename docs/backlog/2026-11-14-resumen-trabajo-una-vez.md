## 🧾 Finanzas ▸ Resumen: bajar el trabajo total (2026-11-14, ADR-0661 act.) — rama `claude/resumen-trabajo-una-vez`, migraciones `20261114005000` y `20261114010000` SIN pegar

Plan «Medir y bajar trabajo» aprobado por Felipe (relayado por la sesión de rendimiento). Producción, desde las 00:07 UTC del 2026-11-14 y con todo
publicado: `fn_resumen_finanzas` 3,8 s por carga, `fn_balance_por_tienda` 1,8 s y `fn_flujo_caja_real` 6 × 0,63 s ≈ 9–10 s de CPU por carga.

- [x] **(b) El estado de resultados del mes una vez por carga** (`20261114005000`): `fn_presupuesto_vs_real_de` y `fn_balance_por_tienda_de` lo aceptan
      ya armado y lo usan solo si calza; parte `balance` opt-in en `fn_resumen_finanzas_partes`; la web pone el presupuesto con el mes y toma el balance
      de esa lectura. Copia de un año: 1.068 → 607 ms y 350.991 → 148.600 bloques (presupuesto aislado 489 → 130 ms, balance 472 → ~235 ms).
- [x] **(a) Movimientos en una sola lectura** (`20261114010000`): `fn_flujo_caja_real_dias` lee los saldos una vez por fecha (7 en vez de 18); las líneas
      siguen día por día (dependen de su corte). Copia de un año: 2.630 → 1.476 ms y 309.678 → 172.366 bloques.
- [x] **Mismas cifras:** md5 antes y después en 170 casos (dos bases); la página dibuja las mismas cifras que el código de #1843 en cinco casos; en la
      misma lectura el presupuesto y el mes son los de la entera y el balance es `fn_balance_por_tienda(hoy)`. Pruebas: `pruebas:flujo-real-dias` (nueva,
      10/10), `pruebas:resumen-por-partes` (40/40 y 64/64), y en verde contra la copia con todo `main`: `flujo_caja` 108, `presupuesto` 78, `balance` 94,
      `resumen_finanzas` 68, `finanzas_arranque` 39, `fondo_sale_al_gastarse` 28, `mercaderia_pagada_balance` 18, `finanzas_alcance_coherente` 52,
      `cuadre_ventas_finanzas` 16, `reversa_de_cobro` 28, `finanzas_lecturas_que_escalan` 13, `claure_proyeccion`.
- [x] Página en la copia (Chromium sin pantalla): «Hoy te toca» ~5,1 → ~3,1 s, el mes ~5,2 → ~3,7 s, todo ~5,4 → ~4,4 s; CLS 0,002 / 0.
- [ ] **Pegar las dos en producción** (OK de Felipe en esta sesión; antes de fusionar; una parte cada una; el orden entre ellas no importa).
- [ ] **A las 24 h de publicar:** `finanzas_resumen_ms` (ahora con `balance`), `finanzas_resumen_bloque` y `pg_stat_statements` de `fn_resumen_finanzas_partes`,
      `fn_flujo_caja_real_dias` y `fn_balance_por_tienda`: cuánto CPU queda por carga.
- [ ] **La tercera propuesta (no hecha, la decide Felipe):** la foto del diario por día del mes en curso (cambia el punto 1 de ADR-0633). Estimado
      después de (a) y (b), a confirmar con la medición de 24 h: de ~9,4 s de CPU por carga a **~6 s** (−0,7 s el presupuesto, −0,9 s el balance,
      −1,7 s Movimientos, con las proporciones medidas en la copia: −73 %, −50 % y −44 %). Lo que quedaría en vivo: el estado de resultados del mes una
      vez (~2 s), el del mes anterior (~0,4 s), el balance sin su estado de resultados (~0,9 s), Movimientos (~2,1 s) y lo demás del Resumen (~0,9 s).
      La foto por día bajaría sobre todo los ~2 s del mes.
- [ ] Lo que la página todavía pide de a uno: `fn_rendimiento_serie` por tienda (~0,95 s c/u) y `fn_costo_estimado_resumen` por sede (~0,33 s c/u).
- [ ] Sin probar contra producción: las funciones de Finanzas piden sesión de líder y desde aquí no se puede simular; las huellas md5 de los cuerpos
      se verifican al pegar.
