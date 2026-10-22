# 2026-10-22 — photo-symmetry-correction

- **Fotos:** las 32 fotos principales con gancho/etiqueta, corregidas con ChatGPT Plus y subidas a producción una a una (aprobadas por Felipe, verificadas en la base: 31 recortes `listo`, CMS-0045 `por_revisar`). Detalle y prompt en `docs/investigacion/2026-10-21-prompt-edicion-minima-fotos.md`.
- **Probador, la falda acampanada:** se veía 1,2× más ancha que su blusa con peplum (la unión llevaba la pretina al tope de la holgura). Arreglo: `ANCHO_MAXIMO_DE_ABAJO_SOBRE_ARRIBA` (×1,05) en `union-prendas.ts`; sin datos nuevos ni migración. ADR-0449, «Actualización 2026-10-22».
- **Probador, el momento «Ajustando»:** el cartel y la falda apagada pasan a un hilo con su aguja, la escena atenuada al 35 % y la etiqueta «Ajustando tu look… / ✓ Listo» debajo del arco (B1, elegida por Felipe en la maqueta `docs/maquetas/probador-ajustando-2026-10/`). ADR-0449, «Actualización 2026-10-22 (b)».
- Tienda: 781 pruebas, `tsc`, `eslint` y Knip en verde. Sin verlo todavía en la tienda de verdad ni en un celular.
