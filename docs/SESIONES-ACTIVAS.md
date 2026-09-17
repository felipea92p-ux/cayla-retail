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
| Felipe (Claude) | `claude/validar-tareas-sistema-89d271` | Tarea 1: cola offline en `CerrarCajaModalV2.tsx`/`CajaAbiertaPanel.tsx`/`PuntoDeVenta.tsx` (ADR-0076) | 2026-09-17 |
| Felipe (Claude) | `claude/validar-tareas-sistema-89d271` | Tarea 2: inventario de insumos del Taller — migración local + RPCs (ADR-0074, bloqueada para producción, ver addendum) | 2026-09-17 |
| Felipe (Claude) | `claude/validar-tareas-sistema-89d271` | Tarea 3: liberar comprobante SUNAT pendiente (ADR-0077) | 2026-09-17 |
| Felipe (Claude) | `claude/validar-tareas-sistema-89d271` | Tarea 4: exportar CSV en `InventarioPanel.tsx` | 2026-09-17 |
| Felipe (Claude) | `claude/validar-tareas-sistema-89d271` | Tarea 5: prueba `scripts/pruebas/fn_aplicar_movimiento.mjs` | 2026-09-17 |
| Felipe (Claude) | `claude/validar-tareas-sistema-89d271` | Tarea 6: ADR de la unificación retail↔dynamic (ADR-0075) | 2026-09-17 |
