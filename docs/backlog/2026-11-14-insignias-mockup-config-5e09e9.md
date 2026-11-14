## 🏷️ Campañas y ofertas: actividades 6 a 9 (2026-11-14, ADR-0655) — base + web; rama `claude/insignias-mockup-config-5e09e9`

Cada migración de la obra se pegó en producción y se verificó allá. La comprobación fue la huella de la caja (`fn_campanas_en_sede`, md5
de `prosrc`), antes y después.

- [x] **«Llevar varias y pagar menos»** (3x2, N por S/ X, la N.ª al X %):
  - base, hoja, caja, apartados y tienda web;
  - PR #1844, #1846, #1848, #1850 y #1851;
  - migraciones `20261114003000`, `011000`, `032000` y `041000`.
- [x] **«Gastar un monto y ahorrar»**, con hasta 3 escalones:
  - base, caja, apartados y tienda web en #1852 (`20261114044000` y `054000`);
  - la hoja en #1853.
- [x] **Ofertas por insignia** (#1854: `20261114060000` y `061000`). La oferta alcanza las prendas de las insignias elegidas, marcadas a mano o
  por categoría.
- [x] **Auditoría final** (ADR-0655, «Auditoría final»):
  - la caja relee los 3x2 y los montos, por páginas;
  - «Quedaría en» y los tickets en espera los cuentan;
  - Finanzas ▸ Campañas (`20261114064000`);
  - la portada por modelo o insignia (`071000`);
  - reactivar una campaña pasa por los choques (`072000`);
  - textos: «antes: −0 %», «Ninguna todavía» y el precio tachado en el pedido web;
  - el pie de la hoja en el celular.
- [x] **Diccionario de datos:** refrescado el volcado (77 grupos, 2236 huellas iguales). Las 7 tablas nuevas tienen su pájaro.
- [ ] **Decisiones de Felipe** (ADR-0655, «Queda para Felipe»):
  - el cambio de talla en un 3x2;
  - marcar prendas con una insignia que usa una oferta;
  - una oferta sobre una insignia desactivada;
  - «Prenda sin registrar» en un monto de toda la compra;
  - una venta sin conexión con una oferta que empezó después;
  - Frescura cuenta el 3x2 como liquidación.
- [ ] **El descuento de siempre** de una campaña que se reactiva no se compara con las ofertas de las otras: el disparador de `072000` solo
  mira las ofertas de la campaña.
- [ ] **De paso, fuera de la obra:** al calcular lo vendido por proveedor se resta dos veces el cupón del Club. Se resta `descuento_club_unitario`
  además de `descuento_unitario`, que ya lo trae (`20261107202000:188`, `20261024221000:112`, `20261024231000:143`, `20261026194000:129`).
  Sin comprobar.
- [ ] **Sin probar en el navegador con base:**
  - la caja con un 3x2 activado mientras está abierta;
  - la bolsa de la tienda web a 375 px;
  - el pedido web del ERP con una prenda del 3x2;
  - `guias:recorrer` de `productos.campanas` (pide sesión y base local).
- [ ] **El chip de un apartado con un monto** dice «Por monto · Verano», sin los escalones. La lista no los trae; se dejó así por «poco texto
  a la vista».
