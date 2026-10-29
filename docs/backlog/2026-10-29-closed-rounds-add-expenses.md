# Backlog · 2026-10-29 · Mis compras: reabrir la última ronda (ADR-0569)

**Estado:** construido en la rama `claude/closed-rounds-add-expenses-8fa984`. **La migración `20261029150000` no está en producción.** La web nueva llama a la función: pegar el SQL antes de fusionar.

## Felipe
- [ ] **Pegar `20261029150000_mis_compras_reabrir_la_ultima_ronda.sql` entera, en una sola pegada.** Una tabla nueva (sin políticas), dos funciones de disparador, una función y una fila de datos; sin `alter` de tablas en uso. Idempotente.
- [ ] **Marcar SOLO «SQL pegado en producción»** del PR y fusionar a mano con los checks en verde.
- [ ] **Probar el botón** con una cuenta de compradora: cerrar una ronda, tocar «Reabrir RC-…», anotar el gasto de S/ 4 y cerrar eligiendo «devuelvo».
- [ ] **Decidir (si pasa):** ¿qué hacer cuando Compras ya recibió el cierre y la compradora se olvidó de un gasto? Hoy no se reabre (movería plata real); el gasto va en la ronda siguiente.

## Pendiente de la sesión
- [ ] Ver el botón en el navegador a 375 px y a 1440 px, en claro y oscuro, y `/formidable` con una persona sin contexto.
- [ ] `/chaos`: doble toque en «Reabrir» y reabrir ‖ Compras recibiendo el cierre.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la migración esté en producción: tabla nueva `compra_cierres_reabiertos`.
