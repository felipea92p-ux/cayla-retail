## Compras ▸ Órdenes de compra, fase 5: «Nos debe» (2026-10-12) — rama `claude/purchase-order-phase5-9b0c82`

ADR-0362 (decisiones 14, 24 y 27). Va encima de la fase 4 (PR #1015). Contrato: `contrato-nos-debe.md`.

- [x] 5a · base: migración `20261013015000` (resoluciones, la causa `reposicion_faltante`, `fn_proveedor_nos_debe`, `fn_nos_debe_resumen`,
  `resolver_deuda_proveedor`; `recibir_despacho` y `fn_envio_detalle` con reemplazos anclados). `pruebas:nos-debe` 16/16.
- [x] 5a · pantalla: ficha del proveedor («Prendas por reponer» + «Llegó la reposición»), aviso en la orden nueva y editar, causa
  «Es la reposición de lo que faltó» en la recepción.
- [x] Guía interactiva de las piezas nuevas: ficha del proveedor, orden nueva/editar y recepción (104/104, recorridas a 1440 y 375 px).
- [ ] Pegar en producción, después de las de la fase 4: `20261013015000`.
- [ ] 5b (espera a Felipe y al contador): «Pasar a saldo a favor», «Depositó», devolver una dañada al proveedor, el aviso del IGV de
  una deuda con factura. Las formas `saldo_a_favor` y `deposito` de `resolver_deuda_proveedor` responden «todavía no».
- [ ] Chip «Te debe S/ X» en la lista de proveedores (provisional, no construido).
