## Compras ▸ Órdenes de compra, fase 2: pasar una orden a comprobante (2026-10-12) — rama `claude/purchase-order-phase2-9b0c82`

ADR-0362 (decisiones 5–9, 16, 21 y 40–45) y ADR-0387. Lista aprobada por Felipe el 2026-10-12; la fase 1 está fusionada (PR #973).

- [x] 1 · **Las acciones de Compras dejan de ser «solo del líder»** (ADR-0387): Plan de campaña, tienda gestora, costo atípico al
  recibir, decisiones sobre lo que faltó. Migración `20261012202000` **SIN pegar en producción**.
- [x] 2 · **Qué tiendas se ven y a nombre de quién se paga** (decisiones 41, 44 y 45): quien tiene el módulo ve todas las tiendas y paga a
  nombre de la empresa; Proveedores ve los montos de la empresa; la deuda de una factura es de la tienda que hizo el pedido (Finanzas
  alineado). Migración `20261012204000` (DOS partes: funciones, y las políticas solas al final) **SIN pegar en producción**; se pega
  ANTES de desplegar la web. Recibir no cambia (va con la fase 4); `compradores_de_tienda` y lo de «mi parte» quedan sin efecto.
**Actividades 3 a 8 juntas, el mismo día** (Felipe 2026-10-12): contrato en `docs/compras/ordenes-de-compra-2026-10/contrato-comprobante-de-orden.md`;
migraciones `20261012205000` (esquema), `20261012210000` (Recibir y lecturas sin prenda) y `20261012211000` (la función del comprobante).
- [x] 3 · Las líneas por «categoría + marca» se ven bien en todo el ERP; Recibir no las ofrece ni las recibe (llegan por guía, fase 4).
- [x] 4 · Registrar el comprobante de una orden (`registrar_comprobante_orden`, página `/compras/ordenes/comprobante/[id]`).
- [x] 5 · Factura con IGV («Sumar IGV», marcado por defecto; «si el papel dice otro total», con la tolerancia de `registrar_compra`).
- [x] 6 · Al contado, con su pago a nombre de la empresa («Sale de»), solo con el módulo Órdenes de compra.
- [x] 7 · Precio de venta sugerido (opcional, `compra_items.precio_venta_sugerido`).
- [x] 8 · Entregas parciales: «Llegó en papel X de Y», varios comprobantes por orden; lo de más y lo que no estaba en la orden se aceptan y se avisan.
- [ ] 9 · ~~Órdenes «Por repartir»~~ → **pasa a la fase 3** (Felipe 2026-10-12, para cerrar la fase 2 hoy): son las que se reparten a las
  sedes. Mientras tanto, una orden «Por repartir» no muestra «Registrar comprobante».
- [ ] 10 · Revisión de calidad (/formidable, /chaos también contra los permisos nuevos, modo oscuro).
- [ ] 11 · Cierre: producción con el OK de Felipe, diccionario y PR.

**Pendiente de Felipe:** las terminales de ventas (3) y administrativa (3) tienen Facturas de proveedor en producción: con la actividad 2
ven las facturas, pagos y deudas de todas las tiendas. Si no se quiere, se les quita el módulo en Roles y accesos.
**Retirar después del despliegue** (quedó sin uso con la actividad 2): `compradores_de_tienda`, `fn_compras_ubicaciones`,
`fn_compras_visibles`, `fn_mi_parte_de_compra`, `fn_mis_partes_de_compras`; en la web, `MisPartesDeCompras`, `lib/compras-mi-parte*.ts`,
`/compras/parte/[compraId]` y el parámetro `misTiendasIds` de `lib/reparto-reglas.ts`.
**Efectivo con «ve todas las cuentas»** (sin ser líder, con Configuración o Cierre de mes): la cuenta propuesta puede ser el cajón de otra
tienda (la base la rechaza al guardar); arreglo sugerido en `fn_cuentas_para_elegir`.
**Para la fase 4 (recepción):** que Recibir muestre sus montos con su propio módulo (hoy los pide a seis lecturas de Facturas y Por pagar).
**Al traer `main` (PR #977 ya fusionado):** integrar `6f7ac936b` (otra sesión quitó `esLider` de `PlanCampana`; choca en dos lugares con las
guías de main: conservar las dos cosas); `guardar_plan_compra_recupero` todavía pide ser líder (pasarlo al módulo, con su caso en
`pruebas:compras-llave`); textos «un líder» que quedaron en el Plan (CifrasPlan, NuevaCampanaModal, EditarCampanaModal,
CampanasArchivadasModal, TopeModal y el texto visible de ResultadosCampana).
**De las actividades 3 a 8 (para después):** `anular_compra` no rechaza a una terminal sin responsable (ya pasaba); corregir un comprobante
al CONTADO no se puede anulando (tiene pago) hasta que exista anular un pago; la guía «categoría · marca» de las líneas sin prenda se
retira cuando la fase 4 cree la prenda desde la guía.
