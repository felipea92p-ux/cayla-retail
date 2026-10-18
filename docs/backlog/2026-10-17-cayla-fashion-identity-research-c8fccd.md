## 🪶 Tienda web: Heebo y el logo oficial (2026-10-17, ADR-0446, variante B elegida por Felipe) — solo `apps/tienda`, sin migración; rama `claude/cayla-fashion-identity-research-c8fccd`

- [x] Investigación de las diez grandes de la moda y propuestas de identidad (`docs/investigacion/2026-10-17-identidad-tienda-web.html`).
- [x] Comparación de letras de dafont en doce piezas de CAYLA (`docs/investigacion/2026-10-17-fuentes-dafont/`; las fuentes y el PDF, fuera de git).
- [x] Logo oficial calcado a vector desde el archivo en alta (2000×580): 426 puntos, superpuesto al original solo difiere en el suavizado del borde.
- [x] Maqueta A/B de la tienda con Ahellya (`docs/maquetas/tienda-ahellya-2026-10/`, fotos y fuentes fuera de git). Felipe eligió **B**.
- [x] **Heebo** reemplaza a DM Sans en la tienda (`app/layout.tsx`, `--sans`, la página de error y las imágenes de `next/og`): cifras del mismo ancho.
- [x] **Logo oficial** en encabezados (con y sin sesión), menú del celular, pie, cabecera de las páginas sin salida y tarjeta del Club
      (`components/Marca.tsx` + `lib/marca.ts`, un solo dibujo con `currentColor`); el colibrí oficial en la campaña, la entrada, las ayudas,
      el ícono de instalar y las imágenes para compartir; «CAYLA» dentro del título de una campaña sale con el dibujo del logo
      (`partirPorLaMarca`, con prueba). Rojo del dibujo: `--t-logo` (#d13730), igual en claro y oscuro; el texto rojo sigue en `--rojo`.
- [x] Íconos de la app instalada (`public/cayla-app-*.png`, `cayla-apple-180.png`) rehechos con el colibrí oficial en la misma caja; se borró
      `public/cayla-isotipo.png`, que ya nadie usa.
- [x] Verificado: `typecheck`, `lint`, 532 pruebas de la tienda, `knip`, `knip:produccion`, `next build`; en el navegador sin sesión (portada,
      entrar, crear cuenta, página que no existe, cómo separar) a 375 px y a 1280 px, claro y oscuro, sin desborde; con sesión, el Inicio, el
      menú y la fila de 320 px; la imagen `/tu-look/vista`.
- [ ] **Ahellya para los títulos:** espera el permiso escrito de su autor (Dmitry Barsukov, behance.net/string4 o mensaje privado en dafont). Con
      el permiso: `next/font/local` en `app/layout.tsx`, `--serif` en `globals.css` y `lib/fuentes-og.ts`; el título de la campaña en la
      computadora topa en 100 px (Ahellya es más ancha que EB Garamond, medido en la maqueta).
- [x] **ADR-0446** (número reservado con `pnpm reservar adr`): la identidad de la tienda, lo descartado y lo pendiente.
- [ ] **Sin probar:** la imagen de la historia de un look guardado (`/looks/guardado/<id>/historia`, pide sesión con un look guardado); usa la
      misma pieza que `/tu-look/vista`, que sí se probó.
- [ ] **Decisión de Felipe:** si el ERP, los tickets y las etiquetas pasan al colibrí y al rojo del logo oficial (toca más de un módulo).
