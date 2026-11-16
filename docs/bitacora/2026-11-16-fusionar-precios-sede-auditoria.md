# 2026-11-16 · Fusionar: auditoría de «Precios por sede» (ADR-0650)

- **Qué:** auditoría de la hoja «Fusionar» contra un Postgres local con las 1214 migraciones (sin Docker: Postgres 16 con lo mínimo de
  Supabase). La elección de precio por sede ahora usa la misma pieza que «Lo que es distinto» (opción con ✓ bajo su ficha, no botones
  negros); la sede sin conflicto dice el precio que queda y el de antes («antes S/ 79.90»); «Qué va a pasar» dice lo que cobrará cada
  tienda; el título ya no se parte a 375 px.
- **Verificado:** `pruebas:fusionar-productos` 49/49; precio_sede_variante, precio_terminal, perdidas, eliminar_producto,
  precio_desde_recepcion, tienda_precio_por_lotes y catalogo_montos_y_textos en verde (precio_sede 30 solo cambia de orden por la
  configuración regional C de la base local). La hoja real en Chromium a 1440, 1280 y 375 px, claro y oscuro, con los medidores de
  /milimetro, y de punta a punta: eligiendo la repetida en Lima la base cobra Lima 84.90 y Trujillo 74.90; con «un solo precio», 79.90 en
  las dos y el precio de Lima archivado. **No verificado:** producción (el conector de Supabase negó el permiso al final de la sesión).
- **Riesgo:** ninguno en la base (no hay migración); la web cambia solo cómo se ve y lo que dice el resumen.
