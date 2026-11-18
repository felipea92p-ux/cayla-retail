## 2026-11-14 — Campañas y ofertas: las ofertas de grupo, el monto con escalones, las insignias y la auditoría final (ADR-0655)

Qué hice: las actividades 6 a 9 de la obra, en los PR #1844, #1846, #1848, #1850, #1851, #1852, #1853, #1854 y el PR de la auditoría, con sus migraciones
pegadas en producción (de `20261114003000` a `20261114072000`).
- **«Llevar varias y pagar menos»** (3x2, N por S/ X, la N.ª al X %): se cobra en la caja, los apartados y la tienda web.
- **«Gastar un monto y ahorrar»**, con hasta 3 escalones.
- **Ofertas por insignia**, pedido de Felipe del día.
- **La auditoría final**, con un revisor que no había construido la obra:
  - la caja ya relee los 3x2 y los montos mientras está abierta, por páginas;
  - «Quedaría en» y los tickets en espera los cuentan;
  - Finanzas ▸ Campañas cuenta lo regalado por un 3x2 o un monto;
  - la portada anuncia las campañas por modelo o insignia;
  - reactivar una campaña pasa por los choques;
  - el pie de la hoja en el celular y tres textos que guiaban mal;
  - el diccionario de datos, al día.

Por qué así: una sola cuenta, en la base, para cada forma de oferta:
- la caja, los apartados y la tienda calculan igual y la base vuelve a exigir el resultado;
- el ahorro se reparte dentro del descuento de cada prenda, al céntimo, para que SUNAT y una devolución vean lo que se pagó por cada una.

Felipe se lleva: una campaña puede rebajar, armar grupos o premiar un monto, sobre categorías, prendas sueltas o insignias. Cada prenda
tiene una sola oferta por tienda y por día, y lo que se regaló se ve en Finanzas.

## 2026-11-14 — Cinco de las seis decisiones pendientes (ADR-0655)

Qué hice: investigué las seis decisiones que dejó la auditoría con datos de producción, Shopify, Square, Lightspeed, Oracle, Target y la Ley
29571 (`docs/investigacion/2026-11-14-ofertas-decisiones-pendientes.md`). Construí las cinco que Felipe decidió:
- el cambio de talla del mismo modelo no cobra el descuento otra vez;
- una oferta no llega a las prendas de una insignia desactivada;
- una venta sin conexión se mide con las ofertas de su hora;
- Frescura cuenta el 3x2, el monto y el Club como campaña;
- «Prenda sin registrar» sigue contando en un monto de toda la compra.

Por qué así: cada regla vive en la base (una función con su nombre), y la pantalla hace la misma cuenta. Las pruebas de la base traen su
control (sin la migración, falla) y su pegado doble.

Felipe se lleva: lo que se cobra en un cambio, en una insignia apagada y en una venta sin red ya no sorprende al cliente ni deja una venta
perdida. Queda una: qué hacer con una prenda que termina con dos ofertas.
