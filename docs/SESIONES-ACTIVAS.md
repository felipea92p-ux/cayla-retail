# Sesiones activas — CAYLA Retail

Tablero simple para que nadie lance una sesión de IA (o empiece una tarea grande) sin ver qué está tocando otra persona ahora mismo. Antes de lanzar una sesión nueva o empezar algo de más de 30 minutos: revisa esta lista. Al terminar o pausar: muévete a "Cerradas hoy".

Nace del incidente del 2026-09-17: 6 colisiones de numeración de ADR, 2 migraciones con el mismo timestamp, y una función (rechazar propuesta de color) construida dos veces en paralelo — todo por no tener este tablero. Ver el documento completo en [El Método CAYLA](../docs/BITACORA.md) y la entrada de hoy en BITACORA.md.

## Cómo usarlo

1. Antes de lanzar una sesión de IA o empezar una tarea de más de 30 minutos: agrégate abajo con una fila.
2. Si ves que alguien ya está tocando lo mismo que ibas a tocar (misma tabla, mismo módulo, mismo rango de ADR/migración): para y coordina antes de seguir, no asumas que "no va a chocar".
3. Al terminar: mueve tu fila a "Cerradas hoy" (no la borres — así queda el historial del día a la vista de todos).
4. Al día siguiente, "Cerradas hoy" se limpia. El historial real y permanente vive en `BITACORA.md`, este archivo es solo el estado de "ahora mismo".

## Activas ahora

| Quién | Rama / worktree | Qué está tocando | Desde |
|---|---|---|---|

## Cerradas hoy

| Quién | Rama / worktree | Qué tocó | Cerrada |
|---|---|---|---|
| Felipe | `claude/buscar-entry-point-7aa994` | Punto de entrada a `/buscar`: tarjeta en Acciones de Inicio + campo propio (`buscar/page.tsx`, `page.tsx`, BACKLOG, BITACORA) | 2026-09-17 |
| Felipe (sesión Claude) | `claude/supabase-unificacion-audit-0887f5` | ADR-0063 (venta sin red): intenté cerrar el hueco de verificación del camino feliz. **Bloqueado, no de esta sesión ni de ADR-0063**: mi Postgres local compartido tiene `retail.variantes.talla_id` (FK a una tabla `retail.tallas` con flujo proponer/aprobar, `created_at` de HOY 19:48 UTC) que **no existe en ningún migration file de `main`** — rompe `getCatalogo()` (`talla` ya no existe como columna) y por lo tanto toda la pantalla `/vender`. No toqué el esquema: parece un cambio de otra sesión en curso sobre el mismo Postgres compartido, aplicado directo sin migración todavía. Ver aviso a Felipe. | 2026-09-17 |
| Claude (sesión Danytristee) | `claude/compras-rls-location-lock-7a8b0c` (worktree `cuervo-colibri-modulos-170de6`) | RLS de `retail.compras`/`compra_items`/`compra_pagos`/`compra_adjuntos` + `resumen_compras()` acotados a `fn_puede_operar_ubicacion` (ADR-0075, decidido con Felipe vía `/decide`). Aplicado y verificado en local; pendiente producción con ok de Felipe. No tocó `compras_multipago.sql`/`anular_compra`/`movimientos` RLS/`ventas-v2.ts`/`movimientos-reglas.ts`/`fn_prioridad_conteo`. | 2026-09-17 |
| Claude (worktree `mejorar-modulo-por-pagar-48008c`) | `claude/mejorar-modulo-por-pagar-48008c` | UX de `/compras/por-pagar` en celular (tarjetas de resumen + `FiltrosCompras.tsx` compartido) — ver worktree `payable-module-review-db60ea`, sin commits/cambios | 2026-09-17 |
| Claude (worktree `productos-fuera-factura-f85f65`) | `claude/productos-fuera-factura-f85f65` | `recibir_compras` acepta productos fuera de factura (ADR-0076 — corregido acá, la fila decía 0075 por la colisión que la propia sesión resolvió) — ya en producción; PR #78 abierto, esperando que Felipe le dé merge desde GitHub (el entorno bloquea el merge desde el chat). Reconciliado con `main` 3 veces por sesiones concurrentes, sin perder contenido de nadie. | 2026-09-17 |
| Claude (worktree `redesign-venta-module-801c9b`) | `claude/catalog-clothing-nomenclature-design-2efcd0` | Vista de grilla de Productos con swatches de color, filtros rediseñados, orden por precio y fotos por color (ADR-0077 — renumerado de 0075 por colisión con `0075-compras-lectura-acotada-por-sede.md`, ya en `main`). PR #81 mergeado a `main`. De paso, detecté 2 pares de migraciones con timestamp duplicado ya mergeados (`20260917100000` y `20260917140000`, de otras 2 sesiones) — rompen `migration up --local` para cualquier worktree; aplicadas acá con workaround local, falta que alguien renombre un archivo de cada par. | 2026-09-17 |
