# Estándar de nombres de prenda (ADR-0556) — lo que queda

- [ ] **Pegar `20261028184000_nombre_del_proveedor.sql` en producción** (OK de Felipe; una sola parte, idempotente). Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Aprobar la regla `nombre-prenda`** de «Pregúntale a CAYLA» (`apps/web/lib/asistente/reglas-de-tienda.ts`, hoy en borrador).
- [ ] **Compras ve y busca el nombre del proveedor**: órdenes de compra, reposición y los buscadores del ERP (toca otro módulo; decisión de Felipe).
- [ ] **El alta sin conexión** no lleva el nombre del proveedor: hoy se avisa y se completa en Editar producto.
- [ ] **Listado de nombres viejos que rompen la regla** (color, descripción o número en el nombre), para que Felipe decida cuáles renombrar.
- [ ] **Tienda online**: mostrar la línea descriptiva («Manga globo · Lino · Rayas») bajo el nombre.
- [ ] Correr `/formidable`, `/chaos` y `/sugerir` sobre el paso 2 nuevo de Nuevo producto antes del PR.
