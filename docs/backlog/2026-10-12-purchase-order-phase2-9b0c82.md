## Compras ▸ Órdenes de compra, fase 2: pasar una orden a comprobante (2026-10-12) — rama `claude/purchase-order-phase2-9b0c82`

ADR-0362 (decisiones 5–9, 16, 21 y 40–43) y ADR-0387. Lista aprobada por Felipe el 2026-10-12; la fase 1 está fusionada (PR #973).

- [x] 1 · **Las acciones de Compras dejan de ser «solo del líder»** (ADR-0387): Plan de campaña, tienda gestora, costo atípico al
  recibir, decisiones sobre lo que faltó. Migración `20261012202000` **SIN pegar en producción**.
- [ ] 2 · **Qué tiendas se ven y a nombre de quién se paga** (decisión 41): quien tiene el módulo ve todas y paga a nombre de la empresa;
  recibir en una tienda una línea asignada a otra; qué pasa con `compradores_de_tienda`; «reasignar el reparto» (ARQUITECTURA dice
  «solo líder»: revisar).
- [ ] 3 · Las líneas por «categoría + marca» se ven bien en todo el ERP (las 15 funciones y la vista que leen el producto de una línea).
- [ ] 4 · Registrar el comprobante de una orden (boleta o nota de venta, al crédito, a una tienda).
- [ ] 5 · Factura con IGV.
- [ ] 6 · Al contado, con su pago (cuenta de la empresa; solo el módulo Órdenes de compra).
- [ ] 7 · Precio de venta sugerido.
- [ ] 8 · Entregas parciales (lo de más se acepta y se avisa).
- [ ] 9 · Órdenes «Por repartir».
- [ ] 10 · Revisión de calidad (/formidable, /chaos también contra los permisos nuevos, modo oscuro).
- [ ] 11 · Cierre: producción con el OK de Felipe, diccionario y PR.

**Pendiente de Felipe:** Proveedores con sus montos por su propio módulo (revertiría ADR-0161 P3).
**Para la fase 4 (recepción):** que Recibir muestre sus montos con su propio módulo (hoy los pide a seis lecturas de Facturas y Por pagar).
**Cuando se fusione el PR #977:** renombrar la prop `esLider` de `PlanCampana` y quitar sus textos de «cuando un líder…», que ya no se ven.
