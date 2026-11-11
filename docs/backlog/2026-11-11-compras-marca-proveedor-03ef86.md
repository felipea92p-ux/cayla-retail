## 🏷️ Compras: la marca primero (2026-11-11, ADR-0644) — web + una función nueva; rama `claude/compras-marca-proveedor-03ef86`

- [x] Maqueta aprobada: `docs/maquetas/compras-marca-primero-2026-11/`.
- [x] Mis compras ▸ Compré ropa: paso 1 por marca, «¿Quién te la trajo?» con dos proveedores, «Buscar por proveedor», píldoras de marca en el paso 2.
- [x] Proveedores: las marcas como título en el directorio y en el ranking.
- [x] Lista del día, Historial y Por pagar: las marcas como título (con `fn_marcas_de_compras`).
- [x] **En producción** `supabase/migrations/20261111155000_marcas_de_compras.sql` (2026-11-11, con el OK de Felipe; verificada: una firma,
      `anon` no, `authenticated` sí). Ojo: de las 50 compras más recientes solo 2 tienen líneas con marca; casi todo Historial y Por pagar sigue
      con la razón social porque sus comprobantes no traen líneas por prenda. Mis compras sí (35 de 50 papeles).
- [ ] Refrescar el diccionario (`pnpm datos:generar:produccion`) cuando la función esté en producción.
- [ ] Ver Historial, Por pagar y Proveedores con datos reales (solo se probaron por tipos y pruebas) y «Compré ropa» con una cuenta real.
- [ ] **Segunda parte, espera a Felipe:** buscar y filtrar por marca en Historial y Por pagar (cambia `listar_compras`, `listar_compras_operativo`
      y la función de Por pagar, que están vivas).
- [ ] `/formidable` y `/chaos` de «Compré ropa» con el paso por marca.
