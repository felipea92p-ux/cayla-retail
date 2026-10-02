## ✅ «Reponer piso» por prenda con todas sus tallas (2026-10-01, ADR-0295) — solo web, sin migración; rama `claude/inventory-sizes-restock-issue-165920`

- [x] `ReponerPrendaModal` + `lib/reponer-prenda-reglas.ts` (13 pruebas): todas las tallas, cantidad por talla, una llamada a `bajar_al_piso`; la tarjeta y el cajón le pasan la prenda entera. Suite web, `tsc` y eslint en verde.
- [ ] **Sin ver en producción** hasta fusionar: con una prenda de dos tallas por colgar, «Reponer» debe listar las dos y «Bajar N prendas» dejar UNA bajada con dos líneas (`select count(*) from retail.bajada_piso_items where bajada_id = …`).
- [ ] **Sin probar con una cuenta no administradora** (en local se vio «Eres admin»): el combo de Responsable con la lista de turno es el de siempre, pero conviene un recorrido con una terminal de almacén.
- [x] ~~**«Retirar del piso» sin entrada en pantalla** desde `46e8abb6`~~ — resuelto en ADR-0300: «Subir a almacén» por prenda en la tarjeta y el cajón (`retirar_del_piso`).
- [x] ~~`ReponerPisoModal` sigue `PENDIENTE` en la guía de foco~~ — el modal se retiró en ADR-0300 (nadie lo abría).
