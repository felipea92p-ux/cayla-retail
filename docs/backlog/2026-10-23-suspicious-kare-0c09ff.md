## 🏷️ Las insignias en las tarjetas del catálogo (2026-10-23, ADR-0489 act. c) — migración `20261023205000` SIN pegar en producción; rama `claude/suspicious-kare-0c09ff`

- [x] Base: `fn_tienda_insignias_de` (la regla por lote, una sola vez), `fn_tienda_insignias` la llama, y `tienda_catalogo` trae `prenda.insignias` (tres reemplazos
      anclados). `pnpm pruebas:tienda-insignias` 34/34 (con ORÁCULO contra la regla de antes); `tienda-inicio`, `tienda-rapida` y su candado de claves
      actualizados; `tienda-puerta`, `tienda-club`, `tienda-empresas`, `tienda-bolsa` y `una-sola-firma` en verde.
- [x] Tienda: `lib/insignias.ts` (lo común con la ficha: lectura tolerante, dibujo por nombre, «lo que la tienda ya dice» y el tope), `insigniasAsignadasDeTarjeta`,
      `TarjetaPrenda.tsx`, `FilaDeInsignias.tsx` (UNA fila: mide cuántas caben enteras) y su CSS; la empresa baja sola debajo. 868 pruebas, `tsc`, `eslint`, `knip`.
- [x] En el navegador (1440, 1024, 768 y 375 px): 0, 1, 2 y 5 insignias, con descuento, Nuevo, CAYLA (Lima) y un nombre largo.
- [ ] **Pegar `supabase/migrations/20261023205000_tienda_catalogo_trae_las_insignias.sql` en producción** (después de `20261023182000`, que ya está) y comprobar
      `select retail.tienda_catalogo(null) -> 'prendas' -> 0 ? 'insignias'`.
- [ ] **Confirmar con Felipe** que el tope de 3 cuenta también el descuento, «Nuevo» y el puesto (la empresa no): así lo leí de su imagen.
- [ ] Sin probar en un teléfono real. En el celular (tarjeta de 165 px) caben «Nuevo» y el «+N», o «Nuevo» y una insignia corta: el resto va al «+N». Si Felipe prefiere ver más nombres ahí, hay que ceder espacio al corazón o achicar más la letra.
