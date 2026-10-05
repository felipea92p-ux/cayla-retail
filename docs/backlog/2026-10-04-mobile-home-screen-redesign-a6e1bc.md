## 📱 Existencias en el celular: buscador, «Para hoy» y primera prenda a la vista (2026-10-04) — solo web, sin migración; rama `claude/mobile-home-screen-redesign-a6e1bc`

- [x] «Para hoy» en una línea (sin título; «Todo al día» también), con sus dos enlaces al pie de lo desplegado. Medido: 135–158 → 44–61 px.
- [x] «Para hoy» justo bajo el buscador en el celular (ranura `bajoBuscador`, variante `incrustado`); arriba como tarjeta en pantallas anchas.
- [x] Tarjeta del buscador compacta (etiqueta solo para lectores, sin hueco de pie, conteo + vista + orden en una fila). Medido: 278 → 166 px.
- [x] Cabecera compacta (`EncabezadoPagina compactoMovil`) y cifras en una línea (`CifrasEnLinea`, con `corta` en `CifraResumen`). Medido: 244 → 95 px.
- [x] «Hacer…» y botón fijo de dos botones (`DockExistencias`, `lib/existencias-hacer.ts`, 6 pruebas). Probado con 5, 1 y 0 acciones.
- [x] 332 archivos de pruebas y tipos en verde; escritorio sin cambio (comparado a 1024 y 1280 px).
- [ ] **Antes de publicar a las tiendas:** cuadrar el piso de TRU (ADR-0328 §5; PR #787 y #792). La primera línea del celular es «por colgar» y hoy está inflada.
- [x] Tarjeta de prenda más baja en el celular (262 → 224 px; con «Reponer» 278 → 232), solo clases `max-sm:`; escritorio idéntico (commit `422a3c71`, sesión aparte). A 375×667 el botón fijo aún le tapa ~14 px; desde ~700 px de alto queda entera.
- [ ] Unificar la fila de accesos de la cabecera con `accionesHacer` (hoy una prueba vigila que no se separen). Tarea aparte (chip); esperar al renombre «Bajar al piso» → «Colgar en el piso».
- [x] Merge de `main` con #787, #792, #785, #800 y #803 ya dentro (2026-10-05): un solo conflicto, en `InventarioPanel.tsx` (las props `accionesHacer` y `listaDelDia` conviven); 338 archivos de pruebas en verde.
- [ ] **Conflictos que quedan por esperar** (cambios chicos en archivos compartidos): `inventario/page.tsx` y `InventarioPanel.tsx` con #796 y #799, `ResumenSede.tsx` con #795 y el renombre «Colgar en el piso» (`unificar-bajar-prendas-c077c7`). Las cifras con «de 600 · por cuadrar» de #795 entran solas a la línea si traen `nota`; solo hace falta darles `corta`.
- [ ] Verificado con datos de mentira (arnés temporal, ya borrado), no con la base: sin Docker no había base local. Falta una pasada con la base real de TRU a 375 px antes de publicar.
