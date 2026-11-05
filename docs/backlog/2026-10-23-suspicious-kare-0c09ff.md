## 🏷️ Las insignias en las tarjetas del catálogo (2026-10-23, ADR-0489 act. c) — migración `20261023205000` YA EN PRODUCCIÓN (2026-10-23); rama `claude/suspicious-kare-0c09ff`

- [x] Base: `fn_tienda_insignias_de` (la regla por lote, solo para el catálogo; la ficha, `fn_tienda_insignias`, no se toca por #1300), y `tienda_catalogo` trae `prenda.insignias` (tres reemplazos
      anclados). `pnpm pruebas:tienda-insignias` 35/35 (con ORÁCULO contra la regla de antes); `tienda-inicio`, `tienda-rapida` y su candado de claves
      actualizados; `tienda-puerta`, `tienda-club`, `tienda-empresas`, `tienda-bolsa` y `una-sola-firma` en verde.
- [x] Tienda: `lib/insignias.ts` (lo común con la ficha: lectura tolerante, dibujo por nombre, «lo que la tienda ya dice» y el tope), `insigniasAsignadasDeTarjeta`,
      `TarjetaPrenda.tsx`, `FilaDeInsignias.tsx` (UNA fila: mide cuántas caben enteras) y su CSS; la empresa baja sola debajo. 868 pruebas, `tsc`, `eslint`, `knip`.
- [x] En el navegador (1440, 1024, 768 y 375 px): 0, 1, 2 y 5 insignias, con descuento, Nuevo, CAYLA (Lima) y un nombre largo.
- [x] **`supabase/migrations/20261023205000_tienda_catalogo_trae_las_insignias.sql` pegada en producción el 2026-10-23** (Claude, a pedido de Felipe; antes, un ensayo
      revertido en producción: catálogo idéntico salvo la llave nueva y 0 diferencias entre la tarjeta y la ficha de #1300 en 1 497 combinaciones prenda × tienda).
      Verificada: `md5` (sin comentarios ni espacios) de `fn_tienda_insignias_de` = `0742bbca8a33cfcce1542736805969fc` (igual al del archivo), la ficha `fn_tienda_insignias`
      sin cambios (`617a578c31a3c6aee9bb8f3cb8ab0263`), permisos `f|f|f|f|f|t`, y el catálogo trae `insignias` en las 374 prendas (44 con insignias).
      La primera versión de esta migración reescribía también `fn_tienda_insignias` y se descartó: habría deshecho en producción la de #1300 (`20261023203000`).
- [ ] **Seguimiento tras fusionar #1300:** una migración chica que sume `icono` e `imagen` a `fn_tienda_insignias_de` (la tarjeta dibuja hoy el dibujo del NOMBRE; la ficha, el elegido)
      y haga que la ficha llame a la de lote (la regla una sola vez). Mientras tanto, `pruebas:tienda-insignias` compara la tarjeta con la ficha. Al fusionarse #1300 hay que
      actualizar en esa prueba los 3 escenarios de la ficha que miran la forma de `20261023182000`.
- [x] Felipe confirmó (2026-10-23) que el tope de 3 cuenta también el descuento, «Nuevo» y el puesto (la empresa no): se queda así.
- [ ] Sin probar en un teléfono real. En el celular (tarjeta de 165 px) caben «Nuevo» y el «+N», o «Nuevo» y una insignia corta: el resto va al «+N». Si Felipe prefiere ver más nombres ahí, hay que ceder espacio al corazón o achicar más la letra.
