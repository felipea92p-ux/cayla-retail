## Comparar con SUNAT: la propuesta del SIRE (ADR-0601, 2026-11-02) — construido en local, sin pegar en producción
Rama `claude/sire-erp-api-integration-e6c07d`.
- [x] Actividad 1: subir la propuesta de compras (txt o .zip) y cruzarla con `fn_impuestos_registro_compras` (migración `20261102202000`).
- [x] Actividad 2: resolver y deshacer cada diferencia por la llave del comprobante (migración `20261102203000`).
- [x] Actividad 3: la pestaña Ventas (RVIE contra `fn_impuestos_registro_ventas`; la baja que no llegó).
- [x] Actividad 4: «Antes de declarar» y el aviso del Cierre de mes, del mismo cruce (sin bloquear).
- [x] Actividad 5: el cron `/api/sire/propuesta` trae la propuesta por la API, solo para leer (migración `20261102204000`).
- [ ] **No está en producción.** Pegar las tres migraciones en orden, cada una sola (`set lock_timeout = '3s'`, sin políticas). Después, refrescar el diccionario (`pnpm datos:generar:produccion`) y `pnpm datos:comparar`.
- [ ] **Credenciales del SIRE (de Felipe):** usuario secundario de SOL solo para el SIRE → Credenciales de API SUNAT (URI «MIGE RCE y RVIE - SIRE») → `SIRE_CLIENT_ID`, `SIRE_CLIENT_SECRET`, `SIRE_USUARIO_SOL`, `SIRE_CLAVE_SOL` en Vercel (Production). Cómo verificas: el día 2 a las 8:30 la pantalla dice «Propuesta traída de SUNAT»; si no, el log del cron dice el paso que falló.
- [ ] **Un archivo real:** subir la propuesta de compras de octubre bajada del portal. Si dice «falta la columna …», el lector se ajusta a los títulos reales (`lib/sire-propuesta-reglas.ts`, `ubicarColumnas`). La API real tampoco se probó: solo con un SUNAT falso (`lib/sire-api.test.ts`), y el formato exacto de `SIRE_USUARIO_SOL` (RUC + usuario) se confirma con la primera corrida.
- [ ] **Preguntas al contador** (siguen abiertas, ver la página «SIRE en el ERP»): quién acepta la propuesta y qué día, cómo trata lo de CLAURE (hoy se marca «Es de CLAURE») y las facturas tardías.
- [ ] «Registrarla en Gastos» abre la hoja vacía: llevar tipo, serie, número, RUC y montos ya escritos (toca Gastos, `GastosPanel.tsx` `?registrar=1`).
- [ ] Sin correr todavía: `/chaos` (la pantalla guarda), `/formidable` y `guias:recorrer` de la guía nueva en escritorio y a 375 px.
- [ ] `compras` no guarda la moneda: una factura en dólares se compara con el tipo de cambio de SUNAT y, si no viene, se pide revisarla a mano.
