# Backlog · Campaña con ofertas en la Tienda web (rama campanas-tienda-catalogo-42d8de)

Hecho: migración `20261027221000` + prueba + ADR-0541. Pendiente, en este orden:
- [x] **Pegada en producción el 2026-10-27** (una sola parte) y comprobado `select retail.tienda_portada();` (`{"campana":null}`, igual que antes). Pendiente solo mirar la tienda real cuando una campaña tenga ofertas.
- [ ] Los otros lectores del descuento directo (ADR-0496 y 0541): `campana_detalle`, `fn_campanas_reporte` (Finanzas), `fn_configuracion_tiendas`, `lib/precio-de-hoy.ts`, `lib/etiqueta-campana.ts`.
- [ ] Decisión de Felipe: la tarjeta «Lo que ya tiene» de Insignias dice «Descuento: sin descuento» en una campaña que solo tiene ofertas; ¿se funde con la fila «Ofertas»?
- [ ] Decisión de Felipe: la portada no mira las sedes (una campaña limitada a una tienda se anuncia en todas), como antes con el descuento de siempre.
- [ ] Las suites `campanas-web`, `campanas-por-sede` y `tienda-ficha` suponen una base local sin campañas con ofertas: con una campaña de prueba activa fallan por datos.
