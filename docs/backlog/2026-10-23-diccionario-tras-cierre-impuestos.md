## 📚 Diccionario de datos al día tras el cierre, Impuestos y las mermas (2026-10-23) — rama `claude/diccionario-tras-cierre-impuestos`

- [x] Volcado de producción refrescado por diferencia (foto del 2026-10-23 18:30 UTC: 274 relaciones, 1572 funciones, 1793 grupos). Huella global igual a la de producción (`51b9d1e49d676dc39e99c23a45a464df`).
- [x] `DICCIONARIO-RETAIL.md`, `DRIFT.md`, `AVIARIO.md` e `inventario-produccion.json` regenerados; `datos:comparar` sin llamadas huérfanas ni sobrecargas; `datos:aviario` en verde; prueba `diccionario-datos` (50) en verde.
- [x] Pájaro para seis tablas nuevas: `campana_sedes` (Loro) y `compra_papeles`, `compra_gastos`, `compra_cierres`, `compra_item_recibido_antes`, `fondo_plata_anotada` (Pelícano, «Compras simple», ADR-0480). Decisión de Claude por la pantalla que las maneja; Felipe puede cambiarla.
- [ ] Un refresco más corto para la próxima vez: `pnpm datos:refrescar` pide pegar 79 KB de huellas en el SQL Editor; una versión que solo envíe las 10 primeras letras de cada huella (20 KB) y devuelva una huella global (en vez de las 1793) lo haría mucho más cómodo. No se construyó aquí: se usó como guion de una sola vez.
