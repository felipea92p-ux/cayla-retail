## 🏷️ Una terminal cambia el precio solo en su tienda (2026-10-26, ADR-0531) — rama `claude/terminal-prices-by-location-7ce6ec`

- [x] Ficha ▸ «Precio por tienda»: en una terminal habla solo de su tienda, con la nota de que lo que cambie no toca a las otras.
- [x] Ficha ▸ matriz «Precios»: en una terminal, las tallas guardadas sin caja y sin «cambiar en bloque»; la bajada lleva a «Precio en Tienda X».
- [x] Recibir envío ▸ Cerrar: en una terminal, el precio de venta vale solo en su sede (sin «Todas las sedes»).
- [x] Base: `20261026224000_terminal_no_cambia_precio_de_la_prenda.sql` + `pnpm pruebas:precio-terminal` (en la lista del CI). Aplicada en local.
- [x] **Pegada en producción el 2026-10-26** (Felipe: «pega tú la migración»), antes de fusionar el PR #1374, por el MCP de Supabase
      (`apply_migration`), que la registró con la hora de aplicación: `20261026224000` → `20261026232834`. Comprobado: el disparador
      `variantes_terminal_no_cambia_precio` y el md5 de su función (`393f0c2b…`) son idénticos a los del local. Hasta que se publique la web
      nueva, una terminal que edite la matriz de precio recibe el rechazo con el mensaje genérico de la web de hoy.
- [x] Volcado refrescado el 2026-10-26 (foto de las 23:32 UTC, 287 relaciones y 1657 funciones): entra `fn_terminal_no_cambia_precio_de_la_prenda`.
- [ ] Ver en el navegador Recibir envío ▸ Cerrar con una terminal y un envío abierto (en local no había ninguno).
