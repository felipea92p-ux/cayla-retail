## 2026-10-29 (Mis compras: reabrir la última ronda — ADR-0569)
Qué hice:
- **Una ronda cerrada no dejaba anotar un gasto olvidado (S/ 4 de bebidas) ni cambiar «me quedo la plata» por «la devuelvo».** Felipe propuso lo más simple: reabrir la última ronda.
- **Base** (`20261029150000`, **pegada en producción el 2026-10-29** y verificada por objeto): `reabrir_ronda_compras()`. La ronda vuelve con el mismo número; su cierre se archiva en `compra_cierres_reabiertos` (no se borra). Solo la última, solo la propia, sin otra abierta y mientras Compras no recibió su cierre. Los dos disparadores que protegían rondas y cierres ganan una excepción que solo la función puede usar.
- **Web:** «Reabrir RC-…» bajo «Abrir mi ronda» (solo si se puede), con su paso en la guía interactiva. Con la ronda abierta todo sigue igual: se anota el gasto y al cerrar se elige de nuevo.
Por qué así: una función en vez de dos (agregar gasto a ronda cerrada + cambiar cierre) reutiliza todas las reglas existentes y cubre también corregir una compra; con el cierre ya recibido por Compras NO se reabre porque ya movió plata real.
Felipe se lleva: fusionar el PR #1474 y probar el botón con una cuenta de compradora.
Estado: **probado en la base local** (`pnpm pruebas:compras-simple-reabrir` 9/9), `tsc`, `knip` y las pruebas de reglas, firmas y guías en verde. **No se vio la pantalla en el navegador ni se corrió `/formidable`.**
