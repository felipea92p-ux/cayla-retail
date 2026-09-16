# ADR-0056 — Depósito bancario y ajuste de efectivo son `caja_movimientos`, y el ajuste exige líder

**Fecha:** 2026-09-15
**Estado:** Aplicado en la base local (`20260915202040_caja_deposito_y_ajuste.sql`). No
aplicado en producción — la pega Felipe (D-11); ya lleva `set search_path = retail,
public, extensions` embebido, mismo patrón que `20260914165703_movimientos_inmutables.sql`
(`supabase/unificacion/` está confirmada muerta como riel desde el corte V1→V2, ver
Contexto). Sin gemelo en esa carpeta.
**Afecta:** `retail.caja_movimientos` (2 columnas nuevas), `retail.registrar_movimiento_caja`
(firma de 4 a 6 parámetros), `apps/web/lib/caja.ts`, `apps/web/components/MovimientoCajaModal.tsx`,
`apps/web/components/CajaAbiertaPanel.tsx`.

## Contexto

Se investigó esto a partir del hueco 5 de `docs/datos/modulos/07-ventas-y-caja.md`
("`cerrar_caja` no descuenta gastos/depósitos/ajustes del cuadre"). Esa investigación
encontró que el documento describe **V1**, borrado por completo el 2026-09-12 a las 15:43
(commit `0af2f1b`) — 6 minutos después de que otra sesión, en paralelo y sin saberlo,
terminara de escribirlo. `gastos`, `depositos_bancarios` y `ajustes_efectivo` (y su doc,
`11-finanzas-operativas.md`) ya no existen; ninguna de las dos fichas fue actualizada desde
entonces.

V2 sí resolvió el cuadre de caja, con otro modelo (`0008_caja_y_pagos.sql`, ya en
producción): `cajas` + `caja_movimientos` (ingreso/egreso) + `venta_pagos`. `cerrar_caja`
calcula `apertura + ventas_efectivo + Σingresos − Σegresos`. Ese modelo es sólido, pero
depósito bancario y ajuste de efectivo no tenían ninguna representación — no estaban
rotos, simplemente no existían.

## Decisión

1. **`caja_movimientos` gana dos columnas, cero tablas nuevas:** `nota text` (detalle que
   un motivo humano no sostiene bien — voucher de un depósito) y
   `es_ajuste boolean not null default false`. Mismo criterio que el propio `0008` ya usó
   para "retiro de efectivo" (comentario línea 49-51: un tipo, no una tabla). Resucitar
   `depositos_bancarios`/`ajustes_efectivo` al estilo V1 habría repetido el antipatrón que
   `11-finanzas-operativas.md` documentaba: `ajustes_efectivo` se escribía con `insert`
   directo, sin RPC, sin `usuario_id`, con policy `FOR ALL` editable/borrable por API.
2. **`registrar_movimiento_caja` gana `p_nota` y `p_es_ajuste`, ambos con default** — los
   4 llamadores existentes (incluido `supabase/seed.sql:421-422`) siguen funcionando sin
   cambios.
3. **Permiso — decisión de Felipe (2026-09-15):** un ajuste de efectivo mueve plata sin una
   venta ni un gasto real detrás, así que exige `fn_es_lider()`; un depósito bancario no —
   se puede verificar después contra el estado de cuenta, igual que cualquier egreso hoy,
   abierto a cualquier colaborador de su sede. Un `motivo` de texto no puede sostener ese
   candado (cualquiera podría escribir otro texto para esquivarlo) — por eso `es_ajuste` es
   una columna, no una convención de nombre.
4. **`cerrar_caja` y `getResumenCaja` no cambian *por esto*.** Los dos suman
   `caja_movimientos` agrupando por `tipo`, nunca por `motivo` (`0008_caja_y_pagos.sql:258-261`,
   `apps/web/lib/caja.ts:93-94`) — un depósito o un ajuste ya se cuadran correctamente en
   cuanto existen como fila. (Nota al fusionar con `main`: `cerrar_caja` y `getResumenCaja`
   sí crecieron mientras tanto, por trabajo ajeno y en paralelo — ADR-0052 les sumó
   reembolsos de devoluciones y ADR-0053 la diferencia de cambios. Ninguno de los dos toca
   `caja_movimientos` ni su agrupación por `tipo`, así que el argumento de este punto sigue
   valiendo igual; simplemente la fórmula completa hoy tiene más términos que los que este
   ADR prueba.)

Se descartó: "gasto categorizado" (IGV, proveedor, cuenta contable) — `registrar_movimiento_caja`
(egreso + motivo) ya alcanza para que el cuadre cierre; categorizar es un problema de
reporting de Garza, no de esta costura. Una tabla `cuentas_bancarias` — no existe ninguna
en el esquema (solo `proveedores.banco`/`cuenta_bancaria`, texto libre), y con 3 tiendas +
1 taller no hay volumen que la justifique. Aprobación de doble persona para un ajuste —
ningún módulo de V2 tiene ese mecanismo hoy; `usuario_id` + `motivo` + hora + candado de
líder ya resuelve la falta de auditoría que V1 documentaba como su hueco real.

## Consecuencias

- **Producción sigue con la RPC de 4 parámetros hasta que Felipe pegue esta migración** —
  el navegador ya manda `p_nota`/`p_es_ajuste`, que la RPC vieja no acepta. Mismo riesgo
  que señaló ADR-0048: pegar antes de desplegar este front, o registrar un ingreso/egreso
  en producción empezaría a fallar con «function … does not exist».
- El bug histórico de `docs/datos/07-GOBIERNO.md` §8 (`RegistrarGastoModal.tsx:57` vs.
  `registrar_gasto` de 6 parámetros) queda confirmado **moot**: ni la pantalla ni la
  función siguen existiendo, ambas borradas en el corte V1→V2.
- `docs/datos/modulos/11-finanzas-operativas.md` sigue describiendo V1 en todo lo demás
  (huecos 1-16 sobre tablas que ya no existen). Se actualizó solo la sección de
  depósito/ajuste para este ADR; auditar el resto del archivo queda pendiente, sin dueño.
- De paso, este worktree tenía dos huecos de entorno típicos de worktree nuevo (gitignored,
  no relacionados con esta decisión pero bloqueaban verificarla): `.claude/launch.json`
  invocaba `npx pnpm` (no resolvía en este entorno) y faltaba `apps/web/.env.local`.
  Corregidos — el primero editado, el segundo copiado del checkout principal.

## Verificación

- `pnpm typecheck`: limpio en `@cayla-retail/database`, `@cayla-retail/shared` y `web` tras
  regenerar `packages/database/src/types.ts`.
- psql contra el Postgres local (contenedor `supabase_db_cayla-retail`), todo en una
  transacción con `rollback` (nada quedó escrito): Micaela (colaboradora, Trujillo)
  registra un depósito bancario con referencia → ok · Micaela intenta un ajuste → rechaza
  con «Solo un líder de equipo puede registrar un ajuste de efectivo» · Felipe (líder) el
  mismo ajuste → ok · `cerrar_caja` sobre esa caja: `sistema = -135.00` = `50` (apertura) +
  `15` (ajuste, ingreso) − `200` (depósito, egreso) — aritmética correcta sin haber tocado
  `cerrar_caja`.
- Navegador, sesión real de Felipe (líder) ya activa en el panel: abrir caja en Tienda
  Lima, registrar «Ajuste de caja (faltante)» S/5.01 con referencia → toast de éxito, el
  resumen sube a Egresos S/5.01, y la referencia aparece bajo el motivo en la lista de
  movimientos.
- Pendiente de ver en navegador con sesión de Colaboradora (no hay una a mano — mismo hueco
  que señaló ADR-0048, y el mismo motivo que ya tenía el BACKLOG sin dueño): el rechazo del
  ajuste solo se confirmó en SQL, no en la pantalla.
