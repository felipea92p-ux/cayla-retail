## 🏷️ Precio propio por sede (2026-10-09, ADR-0370) — rama `claude/aqp-sede-pricing-105ed0`

- [x] Base: `precios_sede`, `fn_precio_en_sede`, `poner_precio_sede`/`quitar_precio_sede`, lecturas (`20261010100000`); Actividad en palabras (`20261010100100`); `registrar_venta` (`20261010100200`); Apartados, Cambios, Proformas y Ventas sin registrar (`20261010100300`). Prueba `pnpm pruebas:precio-sede` (20 escenarios, en el CI).
- [x] Web: «Precio por tienda» en Editar producto (guía de foco, `/sugerir`), Vender con «Precio de …» y sondeo en vivo, Apartados/Cambios/Proformas/Ventas sin registrar, «2 precios» en Productos, Existencias, Etiquetas, aviso en Traslados, Historial de la prenda.
- [x] **En producción** (2026-10-09, MCP): versiones `20261010002553`, `20261010002608`, `20261010002617`, `20261010002633`; verificado (6/6 funciones con `fn_precio_en_sede`).
- [x] Volcado refrescado por diferencia (2026-10-10, foto 04:59 UTC: 173 relaciones, 931 funciones; 17 grupos, 1.212 huellas verificadas): `precios_sede` ya está en el diccionario. De paso entró `prendas_por_regularizar_correcciones` (ADR-0369), con su pájaro.
- [x] Módulo «Productos» en AQP: verificado en producción, ya lo ven las dos terminales (Almacén y Caja Arequipa) y las personas de la tienda. No hubo que tocar permisos.
- [x] Lo que podía quedar mostrado viejo (2026-10-10): la vista previa de «Imprimir lo que entró» (`lineasParaImprimir` con el precio de la tienda), la vista rápida de Productos (`armarMatriz` con el precio de la sede), la ficha se rehace al guardar un precio de sede, y poner o quitar uno **sube la versión del catálogo** (`20261010100500`): toda pantalla abierta se pone al día sola, como con el precio general.
- [x] ~~Vender: marca vieja en la línea del ticket~~ — no existía: el ticket no dibuja la marca; la tarjeta y la lista la toman del sondeo en vivo.
- [x] Eliminar producto: una prenda que tuvo precio propio frena el borrado (renglón 22 de `fn_producto_historia`, `20261010100400`); se desactiva.
- [x] CI: las pruebas que vigilan la huella vieja de `registrar_venta` (redondeo, club) la miden sobre su punto de partida (`scripts/pruebas/registrar-venta-antes-de-precio-sede.mjs`).
- [ ] `/formidable` del bloque «Precio por tienda» y de su hoja: pendiente de correr con Felipe (propone cambios y espera su OK).
