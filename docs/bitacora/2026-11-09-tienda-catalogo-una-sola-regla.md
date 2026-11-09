## 2026-11-09 (Tienda web: «lo nuevo» y «lo más vendido» en un solo lugar)
Qué hice: `20261109181000` reescribe `fn_tienda_lo_nuevo` y `fn_tienda_mas_vendidos` para leer los movimientos de una pasada y preguntar la
familia una vez por categoría. `tienda_catalogo` queda como la versión rápida que corría producción, pero pidiéndoles la respuesta en vez de
llevar su propia copia. En producción, con copias aparte (`pg_temp`) y sobre los mismos datos:
- el catálogo dio el mismo JSON (md5) en las 6 vistas, con 471 prendas;
- «lo nuevo» y «más vendidos» dieron 0 diferencias;
- la velocidad fue la misma: 323–334 ms contra 315–377 ms.

Por qué así: la copia no era más rápida por estar adentro del catálogo, sino porque las reglas estaban escritas talla por talla. Las de antes
tardaban 56 y 33 ms, y leían 19 491 y 16 886 bloques; las nuevas, 24 y 21 ms con 2 110 y 1 557. Con una sola regla, el catálogo y «Novedades
para ti» del club no pueden decir cosas distintas de la misma prenda. ADR-0408, act. (j).
Cómo verificas tú: `pnpm pruebas:tienda-club` (N3: romper `fn_tienda_lo_nuevo` cambia el catálogo y el club juntos) y `pnpm
pruebas:tienda-inicio`. En una base con collation de idioma pasan las 21 pruebas de la tienda, y cinco roturas a propósito de las reglas
nuevas las ve `tienda_inicio`.
