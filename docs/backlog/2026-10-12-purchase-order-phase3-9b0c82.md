## Compras ▸ Órdenes de compra, fase 3: enviar a una sede (2026-10-12) — rama `claude/purchase-order-phase3-9b0c82`

ADR-0362 (decisiones 12, 19, 22 y 46–50). La fase 2 está EN PRODUCCIÓN (base) y su web en el PR #1006; esta rama va encima de ella.

- [x] Enviar a una sede desde la orden (`crear_envio`, `/compras/ordenes/envio/[id]`): una guía, una sede, número de guía opcional
  (decisión 48), `ENV-000001`, precio neto congelado, sin mover stock. Migración `20261012225000`.
- [x] Anular un envío (solo en camino) y la orden con envío (no se edita; con uno vigente, no se anula).
- [x] «Por repartir»: varias guías a varias sedes, y su comprobante (la deuda es de la sede de quien hizo la orden, decisión 46).
  Migración `20261012230000`.
- [x] «Sin comprobante», el cuarto tipo de comprobante (decisión 50, Felipe 2026-10-12): número interno `SC-000001`, sin IGV, al
  crédito o al contado, fuera del Registro de Compras. Migración `20261012235000`; en el celular el tipo se elige con un desplegable.
- [x] Guías interactivas (envío, la orden abierta, la lista y el comprobante con el tipo nuevo).
- [ ] Pegar en producción, EN ORDEN y ANTES de desplegar la web: `20261012225000`, `20261012230000`, `20261012235000` (con el OK de
  Felipe; cada una en UNA parte, sin políticas: se pueden pegar dos veces).
- [ ] Refrescar el volcado y el diccionario después de pegar (`docs/datos/generado/COMO-REFRESCAR.md`).

**Por decidir (Felipe), con lo provisional ya construido:** al enviar se vuelve a la lista con la orden marcada (como crear y editar) y
el aviso trae «Ver la orden»; la guía impresa (guía de remisión) queda para después; «Sin comprobante» que después recibe su papel se
corrige anulándolo (si no tiene pagos) y registrando el papel; la factura suelta de Facturas de proveedor no ofrece «Sin comprobante».
**Para después:** una pantalla «Por enviar» con lo que llegó a Lima de varias órdenes (la base ya acepta una guía con varias órdenes y
proveedores); el texto «la tienda recibe contra la orden» lo confirma la fase 4.
