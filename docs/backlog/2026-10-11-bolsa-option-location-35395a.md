## Bolsas: lo que queda después de producción (2026-10-11, ADR-0377)
- [ ] **Poner en S/ 0.00 la bolsa «Única» de BOL-0001** (hoy a S/ 0.01) desde su ficha, cuando este PR esté publicado.
- [ ] **Cargar stock de bolsas en AQP** (y en Lima, si se usan ahí): hoy solo Tienda TRU tiene (18 pequeñas, 9 grandes, 9 «Única»). Sin stock, «Agregar bolsa» se ve pero no agrega.
- [ ] **Nuevo producto sigue pidiendo precio mayor que 0** (también `crear_producto_con_variantes` en la base): una bolsa de obsequio nueva se crea con un precio y se deja en 0 desde su ficha. Si se vuelve frecuente, abrir el 0 en el alta para Empaque (toca una RPC: con el OK de Felipe).
- [ ] **Refrescar el volcado del diccionario** (`pnpm datos:refrescar`): `familias.entra_a_motores` ya está en producción.
