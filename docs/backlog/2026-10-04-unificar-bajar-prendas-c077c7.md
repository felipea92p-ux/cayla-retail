## 🏷️ «Colgar en el piso»: un solo nombre para pasar prendas del almacén al piso (2026-10-04, ADR-0339) — solo web, sin migración; rama `claude/unificar-bajar-prendas-c077c7`

- [x] 89 archivos (`apps/web` y `docs/`) con el nombre nuevo; `ReponerPrendaModal` y `reponer-prenda-reglas` pasan a `BajarPrendaModal` y `bajar-prenda-reglas`. `tsc` limpio; las 332 pruebas de `apps/web` en verde.
- [x] Prueba de CI `lib/un-solo-nombre-de-la-bajada.test.ts` (corre con `pnpm test`; `ci.yml` ya lo ejecuta). Probada con 12 casos y con una mutación (4 nombres viejos plantados, falló por los 4). El escaneo encontró 1 texto que mi inventario a mano se había perdido.
- [ ] **Sin commitear ni PR.** Solapa 24 archivos con #787, 4 con #786 y 2 con #792 (abiertos). Conviene que se fusionen esos primero y regenerar el reemplazo sobre `main`, en vez de resolver conflictos a mano. La tabla de equivalencias del ADR-0339 sirve para eso.
- [ ] **Sin probar en el navegador ni a 375 px.** «Colgar en el piso» es más largo que «Reponer» y el botón de la tarjeta de Existencias es `btn-chico`: mirar que no se corte. Vender (avisos de «no se registró como colgada» y el modal «Registrar que se colgó en el piso») sí pide captura a 375 px (PL-105).
- [ ] **Decisión de Felipe:** la palabra nueva «tanda» (el lote de prendas de una bajada) y «Colgada en el piso» como etiqueta del historial.
- [ ] **Decisión de Felipe:** «Se agotaron ▸ Reponer» (`lib/analisis-que-hacer.ts`, grupo `agotada`) se dejó igual: cubre colgar desde el almacén **o** pedir a otra sede.
- [ ] **Migración pendiente (producción, pide OK):** los `raise exception` de `bajar_al_piso`, `mover_entre_piso_y_almacen` y `retirar_del_piso` siguen diciendo «bajar prendas al piso» y se ven crudos cuando la web no los reinterpreta.
- [ ] La pantalla de escaneo con pistola (`/inventario/bajar`) y la ventana por tallas quedan con el mismo nombre; decidir si la de pistola sigue viva (ver análisis del 3-oct).
