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
| _(ninguna registrada ahora mismo)_ | | | |

## Cerradas hoy

| Quién | Rama / worktree | Qué tocó | Cerrada |
|---|---|---|---|
| Claude (Danytristee) | `claude/stock-fantasma-archivados-239a85` | Stock fantasma de productos de prueba — ya estaba resuelto en producción sin script (2026-09-16 21:44 UTC); agregó filtro defensivo en `inventario-v2.ts` | 2026-09-17 |
| Claude (worktree `mejorar-modulo-por-pagar-48008c`) | `claude/mejorar-modulo-por-pagar-48008c` | UX de `/compras/por-pagar` en celular (tarjetas de resumen + `FiltrosCompras.tsx` compartido) — ver worktree `payable-module-review-db60ea`, sin commits/cambios | 2026-09-17 |
