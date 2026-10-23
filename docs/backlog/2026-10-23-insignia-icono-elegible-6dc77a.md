## 🎨 El dibujo de una insignia, elegible (2026-10-23, ADR-0490) — migración `20261023203000` SIN pegar en producción; rama `claude/insignia-icono-elegible-6dc77a`

- [x] Columna `retail.etiquetas.icono` (vacía = según el nombre; solo exige su forma), `fijar_icono_etiqueta` con la llave de cada etiqueta (ADR-0476) y
      `fn_tienda_insignias` con `{id, nombre, icono, descuento}`. `pnpm pruebas:insignia-icono` 24/24; `pruebas:tienda-insignias` 20/20 ajustada.
- [x] Retail: campo «Dibujo» en la hoja de nueva insignia / campaña, botón «Dibujo» en cada pase (`CambiarDibujoModal`, con el combo «Responsable»), el sello de tinta,
      Nuevo producto y Editar producto usan el elegido; ruta `/api/productos/etiquetas` (POST y PATCH `icono`). Guía de foco del modal nuevo, paso «Su dibujo» de la
      guía de Insignias y sus dos huellas aceptadas.
- [x] Tienda: la ficha lee `icono` y `descuento`; el chip del descuento toma el dibujo de su campaña. En el navegador, de punta a punta, a 1440 y a 375 px, claro y oscuro.
- [ ] **Pegar `supabase/migrations/20261023203000_insignia_con_dibujo_elegido.sql` en producción ANTES de publicar la web** (una parte, idempotente) y verificar con
      `retail.fn_tienda_insignias(<modelo con Halloween>, null)`. Después refrescar el volcado de `docs/datos/generado/` si se pide (la columna nueva).
- [ ] **Sin probar:** `guias:recorrer` (esta Mac no tiene el navegador de Playwright), `/chaos` sobre las dos hojas que guardan, un teléfono real.
- [ ] **No cubierto a propósito:** el papel de la etiqueta de precio (sigue por el nombre) y la insignia que se propone al vuelo dentro de Nuevo producto (nace por el nombre).
