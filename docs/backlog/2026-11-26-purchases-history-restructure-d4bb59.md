## 🛒 Compras reestructurado (2026-11-26, ADR-0704) — rama `claude/purchases-history-restructure-d4bb59`

- [x] Lecturas `fn_compradores` y `fn_todas_las_compras`, con su prueba de Postgres.
- [x] Compradores (portada), el detalle de cada persona con su revisión y «Cerrar su ronda» acotado.
- [x] Todas las compras reemplaza al Historial; menú final sin pestañas; Revisar compras redirige.
- [ ] Pegar `20261126152000` en producción (con el OK de Felipe) y refrescar el diccionario (`pnpm datos:generar:produccion`).
- [ ] `/milimetro auditar`, `/formidable`, `/chaos` y `guias:recorrer` sobre las tres pantallas, con datos reales.
- [ ] La maqueta `docs/maquetas/compras-reestructura-2026-11/` lleva nombres reales: cambiarlos por inventados antes de versionarla.
- [ ] Decidir si «Todas las compras» pagina cuando un mes pase de 300 compras.
