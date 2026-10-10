## 🏷️ Piezas de liquidación (2026-10-10, ADR-0371) — migración `20261010190000` (EN PRODUCCIÓN 2026-10-10, versión `20261010172258`); rama `claude/liquidacion-prendas-unicas-55bbee`

- [x] Base: `piezas_liquidacion`, `piezas_liquidacion_etiquetas`, `parametros_liquidacion` (S/ 10); RPC `crear_pieza_liquidacion`, `cambiar_precio_pieza_liquidacion`, `retirar_pieza_liquidacion`, `guardar_precio_minimo_liquidacion`; lecturas `fn_pieza_liquidacion`, `fn_piezas_liquidacion`; dos reemplazos anclados a `registrar_venta`; venta final en cambios y devoluciones; anular la devuelve. `pnpm pruebas:piezas-liquidacion` 19/19 (también en el CI).
- [x] Web: Catálogo ▸ Liquidación (módulo `liquidacion`, nace solo del líder), etiqueta de papel, hojas con guía de foco, buscador que lee la etiqueta (también una vieja), precio mínimo del líder; Vender lee el código con pistola, cámara o tecleado (probado a 375 px).
- [x] **Producción (OK de Felipe, 2026-10-10):** aplicada por el MCP; las 13 funciones con el mismo md5 que en local y `registrar_venta` idéntica salvo un comentario que ya difería.
- [ ] Refrescar el volcado (`datos:refrescar` por el MCP) y correr `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Publicar la web:** hasta que se fusione el PR, la pantalla y el escaneo en Vender no existen en producción (la base ya acepta las piezas; nadie las crea todavía).
- [ ] **Felipe:** darle «Liquidación» a los roles de las terminales de almacén y caja (Roles y accesos).
- [ ] **Sin probar:** imprimir una etiqueta real en la Brother y leerla con la pistola Zebra; cobrar una pieza desde el navegador (lo cubre la prueba contra Postgres, no se cobró en local para no tocar la caja compartida).
- [ ] `/formidable` y `/chaos` sobre la pantalla nueva (obligatorias, pendientes).
