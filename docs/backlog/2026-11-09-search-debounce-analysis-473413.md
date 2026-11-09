# 2026-11-09 — Buscadores: pausa única y consultas de más

**Estado:** hecho en la rama `claude/search-debounce-analysis-473413`, sin migraciones. Detalle en ADR-0149, «Actualización 2026-11-09».

- [x] `useBuscarAlEscribir` para los 9 buscadores que van a la URL, con pausa única de 350 ms (Historial y Ranking estaban en 400).
- [x] Notificaciones de la tienda: de una consulta por tecla a la misma pausa.
- [x] Una letra sola no busca (un dígito sí: es un número de orden; con Enter en Recibidas, sí).
- [x] «Atrás» no recorre lo escrito en Compras, Movimientos y Recibidas.
- [ ] Probar en navegador Notificaciones de la tienda (hace falta su entorno local y una cuenta de cliente).
- [ ] Probar en navegador Órdenes de compra y de insumos con órdenes en la base (usan el mismo hook; en local no hay órdenes y el buscador no sale).
- [ ] Medir con datos reales cuánto tarda Productos por búsqueda y, según eso, guardar en caché las listas que no dependen de lo escrito (categorías, colores, marcas, proveedores, tallas, temporadas), con el patrón de `getCatalogo`. Son 9 de las 11 primeras lecturas de `app/(app)/productos/page.tsx`.
