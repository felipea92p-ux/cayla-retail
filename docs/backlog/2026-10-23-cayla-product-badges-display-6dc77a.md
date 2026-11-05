## 🏷️ Las insignias en la ficha de la tienda (2026-10-23, ADR-0489) — migración `20261023182000` SIN pegar en producción; rama `claude/cayla-product-badges-display-6dc77a`

- [x] `retail.fn_tienda_insignias(modelo, tienda)` (interna) y `tienda_ficha` con `prenda.insignias = [{id, nombre}]` (reemplazo anclado de una línea).
- [x] Reglas: aprobada, activa, vigente hoy (Lima), a mano en una variante que se ofrece o de toda su categoría, de esa tienda; sin descuento (el descuento
      es el chip rojo, y es el mayor %); por grupo y nombre. `pnpm pruebas:tienda-insignias` 20/20; `pruebas:tienda-puerta` 36/36; el candado de
      claves de `pruebas:tienda-ficha` ahora incluye `insignias`.
- [x] Tienda: `lib/ficha.ts` (lee las insignias, tolera que falten; `chipsDelCatalogo` las pone entre «Nuevo» y «N.º … en más vendidos» sin repetir lo que la
      tienda ya dice), `FichaPrenda.tsx`, `.t-chip.insignia` (la cara de «Nuevo»). 840 pruebas, `eslint`, `knip`.
- [x] En el navegador local (1024 y 375 px): 4 insignias en una prenda; con dos campañas de 10 y 30 % solo «−30 %» y su precio.
- [x] Cada chip lleva el dibujo de su insignia (la calabaza de Halloween…): vocabulario y dibujos movidos a `packages/shared/src/insignias-visual.ts` (datos, como
      el logo); el ERP los pinta igual que antes (63 dibujos comparados carácter por carácter) y la tienda con `components/IconoInsignia.tsx`. Suite del ERP (592
      archivos), tipos de ERP, tienda y `shared`, `eslint` y `knip` en verde; mirado en claro, oscuro, 1024 y 375 px.
- [ ] **Decisión de Felipe:** ¿poder elegir el dibujo de una insignia al crearla? Hoy sale del nombre (20 familias + etiqueta genérica); «Día del Padre» necesita que
      alguien agregue su familia en `insignias-visual.ts`. Elegirlo sería una columna en `retail.etiquetas` y un selector en «Nueva insignia».
- [ ] **Pegar `supabase/migrations/20261023182000_tienda_ficha_trae_las_insignias.sql` en producción** (una parte, idempotente) y comprobar con
      `retail.tienda_ficha(<modelo con Halloween>, null) -> 'prenda' -> 'insignias'`. Después refrescar el volcado de `docs/datos/generado/` si se pide.
- [ ] **Decisión de Felipe:** la insignia «Sorteo» (100 %, sin fechas, en «Blusa con Lazo», sin publicar) ganaría siempre como «mejor descuento» si
      ese modelo se publica: fijarle fecha o sacarla de lo publicado.
- [ ] **Decisión de Felipe:** ¿«Últimas unidades» debe seguir la talla elegida (insignias por variante)? Hoy es por modelo.
- [ ] Sin probar en un teléfono real; el CI completo de Postgres no se corrió (la base local compartida tiene 12 fallos previos en `pruebas:tienda-ficha`).
