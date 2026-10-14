## Auditoría del ERP y bloque 1 «la prenda sin registrar deja de entrar sin dato» (2026-10-14)
Aprobado por Felipe el 2026-10-14 (siete actividades, `/construir`). Hecha: **A0** (el plazo de la cola sigue a la carga inicial; en producción).
- **A1** · Dar de baja un comprobante anula la venta en el mismo acto: `/api/lucode/anular` llama `anular_venta` tras guardar la baja; si la venta no
  se puede anular (caja cerrada, cambio o devolución), la ruta se niega ANTES de llamar a Lucode y manda a Devolución con nota de crédito. Decisión de
  Felipe: estricto (se niega, no avisa). Los 3 casos de producción (B005-202, -221, -236; S/ 251,70) se remedian aparte con el contador.
- **A2** · «Es esta» en la hoja del mostrador: lectura nueva `fn_prendas_posibles(sede, categoría, talla, color)` con la misma definición de
  «posible» que `fn_candidatas_de_venta`; la prenda entra al ticket como línea normal.
- **A3** · Precio con referencia: rango de precios de la categoría en la sede (lógica pura) y confirmación fuera de rango, como el costo atípico de
  Compras. El candado en `registrar_venta` (muy fuera → líder) queda para la Fase 1 con el contador.
- **A4** · Costo estimado con su origen (`venta_items.costo_origen`); Finanzas rotula el margen. **Espera la decisión del contador** (qué estimador).
  Revisa la decisión 7 de ADR-0334 («no se inventa un costo»): hay que actualizarla con el porqué.
- **A5** · La cola llega a quien vende: contador «Hoy: N sin registrar» al pie del ticket y la cola en «Te toca» de la terminal.
- **A6** · Cerrar en bloque exige un cuadre del piso posterior al corte (Felipe: estricto). Hoy `cuadres_piso` = 0 en las tres tiendas.
- Fuera del bloque, con diseño propio (`/rigor`): el «descargo pendiente» para que un conteo no cuente como pérdida lo vendido sin registrar
  (`ajustar_inventario`, `cerrar_conteo`); y el bloque 2 (RPC transaccionales `corregir_venta`, `reemitir_comprobante`, disparador diferido
  «toda venta completada tiene un comprobante vivo»).
- `docs/datos/generado/` no tiene todavía `20261014161000` (entra con el próximo volcado; en producción la versión es `20261014161821`).
- La auditoría completa (233 hallazgos, menú propuesto, hoja de ruta de 5 fases, 8 decisiones) vive en un artefacto privado de Felipe; la lista de
  seguridad (64 observaciones, 5 altas, sin verificar por el escéptico) se entregó aparte y no se versiona.
