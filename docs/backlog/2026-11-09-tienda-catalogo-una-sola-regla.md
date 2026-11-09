## 🛍️ Tienda web: «lo nuevo» y «lo más vendido» en un solo lugar (2026-11-09, ADR-0408 act. j) — 1 migración por pegar; rama `claude/tienda-catalogo-una-sola-regla`

- [x] `20261109181000_tienda_catalogo_una_sola_regla.sql`: `fn_tienda_lo_nuevo` y `fn_tienda_mas_vendidos` de una pasada; `tienda_catalogo`
  como la versión rápida de producción, pidiéndoles la respuesta. Una parte, re-ejecutable, solo `create or replace` y `comment`.
- [x] Comparado en producción con copias temporales (`pg_temp`), sin tocar las vivas:
  - el catálogo da el mismo JSON (md5) en 6 vistas;
  - «lo nuevo» y «más vendidos» dan 0 diferencias;
  - la velocidad es la misma (~330 ms).
- [x] Camino de vuelta: `supabase/migrations/pegar-en-produccion-vuelta-catalogo-una-regla-2026-11-09.sql` (las tres como están hoy en
  producción).
- [x] Pruebas, en una base con `main` + `20261109171000` + esta y collation de idioma (`en-US`): 21 suites de la tienda en verde. Tres que
  vuelven a pegar migraciones viejas del catálogo parten del de main de antes (`scripts/pruebas/_antes_catalogo_una_regla.sql`). Cinco
  roturas a propósito de las reglas nuevas las ve `tienda_inicio`.
- [ ] **POR PEGAR (2026-11-09):** `20261109181000`, antes de fusionar. La web no cambia, así que puede ir antes o después, pero mientras no
  esté, producción sigue con la copia de las reglas.
- [ ] Después de pegar: volver a medir por el conector el md5 del catálogo de cada sede (debe dar lo mismo que antes) y la deriva diaria (ya
  no debe listar `tienda_catalogo`).
