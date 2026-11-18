# 2026-11-05 — Foto de producción al día, con el Taller y la tanda 3 de Finanzas

- `docs/datos/generado/` pasa de la foto del 2026-11-04 a la del 2026-11-06 00:12 UTC: 1956 funciones (24 más), 324 relaciones, 11 columnas nuevas. Por diferencia (`pnpm datos:refrescar`): 34 grupos cambiados y 0 quitados, y las 2088 huellas coinciden con producción.
- `datos:comparar` sin llamadas rotas ni sobrecargas; `registrar_compra_de_insumos` ya está en la foto. También se probó contra el código del PR #1658: producción acepta todas sus llamadas.
- Todo lo nuevo sale de una migración conocida. Las de los PR #1655 y #1658 y `fn_patrimonio_en_fechas` (`20261105230000`, rama `claude/estados-financieros-vidrio`) ya están en producción aunque esas ramas sigan sin fusionar.
