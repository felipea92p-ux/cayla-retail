# Estándar de nombres de prenda (ADR-0556) — lo que queda

- [ ] **Pegar `20261028184000_nombre_del_proveedor.sql` en producción** (OK de Felipe; una sola parte, idempotente). Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **Aprobar la regla `nombre-prenda`** de «Pregúntale a CAYLA» (`apps/web/lib/asistente/reglas-de-tienda.ts`, hoy en borrador).
- [ ] **Compras ve y busca el nombre del proveedor**: órdenes de compra, reposición y los buscadores del ERP (toca otro módulo; decisión de Felipe).
- [ ] **El alta sin conexión** no lleva el nombre del proveedor: hoy se avisa y se completa en Editar producto.
- [ ] **Listado de nombres viejos que rompen la regla** (color, descripción o número en el nombre), para que Felipe decida cuáles renombrar.
- [ ] **Tienda online**: mostrar la línea descriptiva («Manga globo · Lino · Rayas») bajo el nombre.
- [ ] Correr `/formidable`, `/chaos` y `/sugerir` sobre el paso 2 nuevo de Nuevo producto antes del PR.

## Nuevo producto con la carga cerrada (ADR-0328 act. 2026-10-28) — lo que queda

- [ ] **Pegar `20261028221000_alta_con_llegada.sql` en producción ANTES de publicar la web** (OK de Felipe; una sola parte, solo una función nueva). Sin ella, crear con la carga cerrada y unidades falla con «no encontró la función». Después: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.
- [ ] **«Marca y proveedor» dice «opcional»** aunque con la carga cerrada y unidades el proveedor sea obligatorio: el aviso del paso 4 lo explica y lleva al campo, pero la etiqueta del paso 2 no cambia (decidir si cambia).
- [ ] Correr `/chaos` sobre el alta con llegada (doble clic, corte de red a mitad, otra pestaña que cierra la carga).
