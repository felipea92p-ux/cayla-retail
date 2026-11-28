## 🔎 Auditoría de Taller, Inventario, Ventas y Compras y sus cinco primeros arreglos (2026-11-28, ADR-0719) — 5 migraciones sin pegar; rama `claude/audit-workshop-inventory-sales-purchases-c19a93`

Informe completo: `docs/AUDITORIA-2026-11-28-taller-inventario-ventas-compras.md` (103 hallazgos: 6 altos, 49 medios y 48 bajos).

### Hecho

- [x] **N.º 1, anular una venta con la prenda dañada** (`20261128161000`): entra a la cuarentena y a Dañadas como en una devolución; la
  pérdida se cuenta al resolverla; una dañada de CLAURE deja el Diario de CAYLA en 0. Prueba nueva
  `pruebas:anular-venta-danada-a-cuarentena` (16/16, sumada al CI). Probado a 375 px en /devoluciones: la pantalla dice «La prenda quedó
  en Dañadas» y la base guarda la entrada `anulacion_venta` y la fila de Dañadas.
- [x] **N.º 2 y 45, la prenda de un APT y el vencimiento diario** (`20261128162000`): `liberar_apartado` rechaza con
  `apartado_de_separacion`; Existencias muestra «Liberar en Apartados», que abre el APT; el barrido aísla cada apartado y manda a Sentry
  los que no pudo vencer. `separaciones` 108/108. Probado a 375 px.
- [x] **N.º 3, lo pagado a un servicio tapaba la deuda con el otro** (`20261128163000`): Por pagar cuenta solo los papeles del servicio
  actual; cambiar de servicio se frena (`servicio_con_papel_anulable`) solo si el papel de antes se puede anular. `produccion-pagar-servicio`
  23/23.
- [x] **N.º 4, «Ajustar lo que queda» con decimales** (solo web): `redondearCantidad` en `lib/insumos-reglas.ts`, comparado contra
  `numeric` de Postgres en 3 001 casos. `produccion-regularizar-lotes` 17/17 con el caso A7.
- [x] **N.º 9, 10 y 31, compras** (`20261128164000` y `20261128165000`): `anular_compra` rechaza con `compra_con_mercaderia`; nace
  `fn_numero_comprobante_clave` (la regla de SIRE); candado por comprobante en compra rápida; índices únicos por la clave, en una migración
  que aborta y lista los repetidos. INV-14 mira también lo recibido antes. Gastos y Activos muestran su frase si el índice los frena.

### Pendiente

- [ ] **Pegar en producción, con el OK de Felipe** (dinero y stock): 161000, 162000 y 163000 en cualquier orden; 164000 antes que 165000;
  165000 fuera de la hora de compras. Antes, la consulta de solo lectura de cada encabezado. Después, `pnpm datos:generar:produccion` y
  `pnpm datos:comparar` (entran `fn_anulacion_a_danadas`, `fn_apartados_de_separaciones`, `fn_vencer_separaciones_resumen`,
  `fn_servicio_exigir_sin_papel_anulable` y `fn_numero_comprobante_clave`).
- [ ] **Lo que ya pasó en producción no se arregla solo** (decide Felipe): anulaciones dañadas viejas sin movimiento (la prenda está en la
  tienda fuera del stock), APT ya trabados con su adelanto y comprobantes repetidos por ceros (si hay, la 165000 no se crea hasta
  resolverlos).
- [ ] **Saldo a favor con un servicio pagado sin trabajo** (N.º 3 con papel ya pagado, y N.º 13): hoy no se ve en ningún lado.
- [ ] **La prenda de un pedido entre tiendas** todavía se puede soltar desde Existencias (misma clase de puerta que el N.º 2, no pedida).
- [ ] Opcional: `ajustar_lote_usado` podría comparar `round(p_queda_que_vio, 3)` como defensa extra (migración reservada 20261128170000,
  sin usar).
- [ ] **Sin probar en el navegador:** el freno de «Cambiar quién» en una orden (N.º 3), «Ajustar lo que queda» (N.º 4) y Compras entera
  (el servidor de la auditoría se cayó a mitad). Sus pruebas de Postgres y Vitest sí están en verde.
- [ ] **Los otros 98 hallazgos del informe.** Los baratos que conviene sumar a la próxima tanda: N.º 19, 12, 43, 7 y 83.
