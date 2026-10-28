## Plan del piso ▸ Propuesta: variantes de color en las perchas y nombre completo en la ficha — rama `claude/polos-tops-blusas-variants-feb8b4` (2026-10-11)

- [x] 1 · Cada percha de «Hoy» y de «Cómo quedaría» lleva el color de una variante real (`lib/plan-piso-colores.ts`, resto mayor, «Otros colores» para lo que no llega a media percha). Solo web, sin migración. ADR-0352, act. 2026-10-11 (c).
- [x] 2 · Íconos de las fichas y las tarjetas: hasta tres prendas superpuestas con los colores principales; la ficha de «Hoy» y el rótulo del riel dicen el nombre completo del grupo.
- [ ] 3 · **Verlo con su base real:** abrir `/inventario/plan-del-piso` en una sede con stock por color y correr `pnpm --filter web tema:auditar -- --ruta /inventario/plan-del-piso` (necesita sesión; no se corrió).
- [ ] 4 · Decidir mirando: ¿las filas de la tabla y la mancuerna también llevan los colores, o siguen del color del grupo (hoy: del grupo)? ¿Colores **y** tipos de prenda (silueta por categoría)? Se descartó por cargado, no se rechazó.
- [ ] 5 · Revisar con una colaboradora si «Otros colores» (gris) se entiende solo o necesita una clave a la vista; hoy la explica el `title` del tramo y la nota del pie.
