# Backlog · 2026-10-29 · Mis compras: reabrir la última ronda (ADR-0569)

**Estado:** construido en la rama `claude/closed-rounds-add-expenses-8fa984`. **La migración `20261029150000` YA está en producción** (pegada y verificada el 2026-10-29): la web nueva ya puede fusionarse.

## Felipe
- [x] ~~Pegar `20261029150000_mis_compras_reabrir_la_ultima_ronda.sql`~~ — hecho el 2026-10-29; la casilla «SQL pegado en producción» del PR está marcada.
- [ ] **Fusionar el PR #1474 a mano** con los checks en verde.
- [ ] **Probar el botón** con una cuenta de compradora: cerrar una ronda, tocar «Reabrir RC-…», anotar el gasto de S/ 4 y cerrar eligiendo «devuelvo».
- [ ] **Decidir (si pasa):** ¿qué hacer cuando Compras ya recibió el cierre y la compradora se olvidó de un gasto? Hoy no se reabre (movería plata real); el gasto va en la ronda siguiente.

## Pendiente de la sesión
- [ ] Ver el botón en el navegador a 375 px y a 1440 px, en claro y oscuro, y `/formidable` con una persona sin contexto.
- [ ] `/chaos`: doble toque en «Reabrir» y reabrir ‖ Compras recibiendo el cierre.
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`): tabla nueva `compra_cierres_reabiertos` ya en producción.
