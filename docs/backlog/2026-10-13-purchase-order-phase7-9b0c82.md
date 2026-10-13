## Producción ▸ Órdenes de insumos, fase 7 de las órdenes de compra (2026-10-13) — rama `claude/purchase-order-phase7-9b0c82`

ADR-0362 (decisiones 25, 28, 29 y 47). Va encima de la fase 5a (PR #1017). Contrato: `contrato-ordenes-de-insumos.md`.

- [x] Parte 1 · base: migraciones `20261013035000` y `20261013040000` (módulo `ordenes_insumos`, orden 205, sin rol; `ordenes_insumo`,
  `orden_insumo_items`, `orden_insumo_versiones`; crear, editar, anular, lista, detalle, número siguiente y opciones del formulario).
  `pruebas:ordenes-insumo` 55/55.
- [x] Parte 1 · pantallas: `/ordenes-insumos` (lista, nueva, ver como página y como ventana, editar, anular, PDF).
- [ ] Pegar en producción, después de las de la fase 5a: `20261013035000` → `20261013040000`.
- [ ] Felipe: confirmar lo provisional (menú y ruta propia; destino taller obligatorio; unidad copiada en la línea; el insumo no se
  restringe al proveedor; las cifras de la lista).
- [ ] Una cuenta con SOLO «Órdenes de insumos»: en el Taller, su entrada del menú se llama «Producción» (un grupo con una sola hija toma el
  nombre del grupo); desde una tienda no ve la entrada, aunque la pantalla abre por URL. Decidir con Felipe.
- [ ] Parte 2 (espera a Felipe): el comprobante de la orden por el circuito del Taller (`comprobantes_produccion`) y la recepción en el
  Taller contra la orden; al llegar, editar y anular suman el candado «no con un comprobante o una recepción vivos».
- [x] Caos chico en el navegador (9 ataques, 0 hallazgos) y en la base (doble clic con el mismo id, dos sesiones editando a la vez).
- [ ] `/chaos` completo (catálogo y semilla) y `/formidable` de las pantallas.
- [x] En la fila de escritorio, el ejemplo de la descripción se cortaba: ahora es corto («Ej. crudo», «Ej. negro») y la cabecera dice solo «Descripción».
