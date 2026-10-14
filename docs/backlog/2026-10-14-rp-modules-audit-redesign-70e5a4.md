## Auditoría del ERP y bloque 1 «la prenda sin registrar deja de entrar sin dato» (2026-10-14)
Aprobado por Felipe el 2026-10-14 (siete actividades, `/construir`). Hechas: **A0** (el plazo de la cola sigue a la carga inicial; en producción)
y **A1** (la baja de un comprobante anula la venta en el mismo acto; migración `20261014165000` lista, **pendiente de producción con OK de Felipe**:
la web no se publica antes que la migración, o una boleta dada de baja respondería «la venta no se pudo anular»).
- **A1, lo que queda:** los 3 casos de producción (B005-202, -221, -236; S/ 251,70) se remedian aparte con el contador. Riesgo residual: si SUNAT
  rechaza la baja después, la venta queda anulada con comprobante vigente; la invariante «toda venta completada tiene un comprobante vivo y toda
  anulada ninguno» (Fase 1, `fn_invariantes`) lo detecta y la salida es una nota de crédito. `consultar-anulacion` podría avisarlo al ver «no_anulado».
- **A2, hecha:** «¿Es alguna de estas?» en la hoja del mostrador, sin RPC nueva (`lib/prenda-sin-registrar-posibles.ts` sobre el catálogo y
  el stock en vivo de Vender). Queda por decidir si la mesa de Ventas sin registrar (`corregir`) también ofrece posibles: hoy no, la venta ya existe.
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
