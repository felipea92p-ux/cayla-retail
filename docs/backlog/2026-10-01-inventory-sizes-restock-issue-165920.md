## ✅ «Reponer piso» por prenda con todas sus tallas (2026-10-01, ADR-0295) — solo web, sin migración; rama `claude/inventory-sizes-restock-issue-165920`

- [x] `ReponerPrendaModal` + `lib/reponer-prenda-reglas.ts` (13 pruebas): todas las tallas, cantidad por talla, una llamada a `bajar_al_piso`; la tarjeta y el cajón le pasan la prenda entera. Suite web, `tsc` y eslint en verde.
- [ ] **Sin ver en producción** hasta fusionar: con una prenda de dos tallas por colgar, «Reponer» debe listar las dos y «Bajar N prendas» dejar UNA bajada con dos líneas (`select count(*) from retail.bajada_piso_items where bajada_id = …`).
- [ ] **Sin probar con una cuenta no administradora** (en local se vio «Eres admin»): el combo de Responsable con la lista de turno es el de siempre, pero conviene un recorrido con una terminal de almacén.
- [ ] **«Retirar del piso» sin entrada en pantalla** desde `46e8abb6` (cajón lateral único): `ReponerPisoModal` con `sentido: "retirar"` existe y nadie lo abre, y Frescura y Ajustar mandan a la gente allí. Decidir la puerta (una por talla en el cajón, no un botón de la prenda) y reconectar `setMoviendo` en `InventarioPanel.tsx`.
- [ ] `ReponerPisoModal` sigue `PENDIENTE` en `guia-de-foco-pantallas.ts` (queda solo el retiro, con nota): su guía de foco entra cuando se le dé puerta.
