## 🏷️ Una terminal cambia el precio solo en su tienda (2026-10-26, ADR-0531) — rama `claude/terminal-prices-by-location-7ce6ec`

- [x] Ficha ▸ «Precio por tienda»: en una terminal habla solo de su tienda, con la nota de que lo que cambie no toca a las otras.
- [x] Ficha ▸ matriz «Precios»: en una terminal, las tallas guardadas sin caja y sin «cambiar en bloque»; la bajada lleva a «Precio en Tienda X».
- [x] Recibir envío ▸ Cerrar: en una terminal, el precio de venta vale solo en su sede (sin «Todas las sedes»).
- [x] Base: `20261026224000_terminal_no_cambia_precio_de_la_prenda.sql` + `pnpm pruebas:precio-terminal` (en la lista del CI). Aplicada en local.
- [ ] **No está en producción:** pegar `20261026224000` en el SQL Editor (una sola parte, sin políticas, idempotente) con el OK de Felipe y
      refrescar el volcado (`docs/datos/generado/COMO-REFRESCAR.md`). Hasta entonces la pantalla ya no le ofrece a la terminal cambiar el
      precio de la prenda, pero la base todavía lo aceptaría.
- [ ] Ver en el navegador Recibir envío ▸ Cerrar con una terminal y un envío abierto (en local no había ninguno).
