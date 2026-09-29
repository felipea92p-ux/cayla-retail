## 🖼️ Fotos por color en «Editar producto» (2026-09-29, ADR-0279) — solo web, sin migración; rama `claude/product-colors-image-upload-281ffc`

Construida la versión C del spike `docs/maquetas/producto-fotos-por-color-2026-09/` (Felipe eligió «Tarjetas por color»).
Reemplaza la galería suelta con combo de 71 colores (`FotosProducto.tsx`, borrado) por `components/ficha-producto/FotosPorColor.tsx`.

- [x] Reglas puras y probadas (`lib/fotos-por-color-reglas.ts`, 27 casos): siempre una sola principal, la foto que pasa de color queda
      al final del nuevo, la huérfana no se pierde. `tsc`, `eslint` y la suite de `apps/web` (234 archivos) en verde.
- [x] Render probado con `react-dom/server` en cuatro casos (captura, colores sin foto, huérfana + nueva, sin colores).
- [x] «Agregar color» trae su casilla «Foto de cada color (opcional)».
- [ ] **Sin probar en el navegador con datos reales:** falta copiar `apps/web/.env.local` a este worktree (lo corre Felipe, un `cp`) y
      recorrer `/productos/[id]/editar` con una prenda de 2+ colores: agregar foto a un color sin ella, «Pasar a otro color…»,
      «Agregar color» con foto, «Descartar», y a 375 px.
- [ ] **Probarlo con una colaboradora en una tablet**, sin explicarle nada (es la prueba de «persona sin contexto»).
- [ ] **Volver a contar antes de publicar** las fotos sin color en prendas de 2+ colores (producción, 2026-09-29: 0 de 1 prenda con
      fotos; 11 de 15 colores activos sin ninguna foto). El catálogo crecerá y ese cero puede dejar de serlo.
- [ ] Si una prenda llega a 20 o más colores, revisar el largo de la grilla de tarjetas (hoy el peor caso real es 8).
