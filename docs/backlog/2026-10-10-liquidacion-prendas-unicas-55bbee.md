## 🏷️ Piezas de liquidación (2026-10-10, ADR-0371) — migración `20261010190000` (NO en producción); rama `claude/liquidacion-prendas-unicas-55bbee`

- [x] Base: `piezas_liquidacion`, `piezas_liquidacion_etiquetas`, `parametros_liquidacion` (S/ 10); RPC `crear_pieza_liquidacion`, `cambiar_precio_pieza_liquidacion`, `retirar_pieza_liquidacion`, `guardar_precio_minimo_liquidacion`; lecturas `fn_pieza_liquidacion`, `fn_piezas_liquidacion`; dos reemplazos anclados a `registrar_venta`; venta final en cambios y devoluciones; anular la devuelve. `pnpm pruebas:piezas-liquidacion` 19/19 (también en el CI).
- [x] Web: Catálogo ▸ Liquidación (módulo `liquidacion`, nace solo del líder), etiqueta de papel, hojas con guía de foco, buscador que lee la etiqueta (también una vieja), precio mínimo del líder; Vender lee el código con pistola, cámara o tecleado (probado a 375 px).
- [ ] **Producción (OK de Felipe):** pegar `20261010190000` (una parte, idempotente, falla sin tocar nada si `registrar_venta` no es la revisada); después `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Felipe:** darle «Liquidación» a los roles de las terminales de almacén y caja (Roles y accesos).
- [ ] **Sin probar:** imprimir una etiqueta real en la Brother y leerla con la pistola Zebra; cobrar una pieza desde el navegador (lo cubre la prueba contra Postgres, no se cobró en local para no tocar la caja compartida).
- [ ] `/formidable` y `/chaos` sobre la pantalla nueva (obligatorias, pendientes).
