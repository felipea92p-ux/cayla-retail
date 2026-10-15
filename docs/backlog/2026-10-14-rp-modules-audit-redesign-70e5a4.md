## Auditoría del ERP y bloque 1 «la prenda sin registrar deja de entrar sin dato» (2026-10-14)
Aprobado por Felipe el 2026-10-14 (siete actividades, `/construir`). [PR #1094](https://github.com/felipea92p-ux/cayla-retail/pull/1094), en borrador. Hechas: **A0** (el plazo de la cola sigue a la carga inicial; en producción)
y **A1** (la baja de un comprobante anula la venta en el mismo acto; migración `20261014165000` **en producción desde el 2026-10-14**, versión `20261015000106`).
- **A1, lo que queda:** los 3 casos de producción (B005-202, -221, -236; S/ 251,70) se remedian aparte con el contador. Riesgo residual: si SUNAT
  rechaza la baja después, la venta queda anulada con comprobante vigente; la invariante «toda venta completada tiene un comprobante vivo y toda
  anulada ninguno» (Fase 1, `fn_invariantes`) lo detecta y la salida es una nota de crédito. `consultar-anulacion` podría avisarlo al ver «no_anulado».
- **A2, hecha:** «¿Es alguna de estas?» en la hoja del mostrador, sin RPC nueva (`lib/prenda-sin-registrar-posibles.ts` sobre el catálogo y
  el stock en vivo de Vender). Queda por decidir si la mesa de Ventas sin registrar (`corregir`) también ofrece posibles: hoy no, la venta ya existe.
- **A3, hecha:** precio con referencia y confirmación fuera de rango (`lib/prenda-sin-registrar-precio.ts`). Queda para la Fase 1, con el contador:
  el candado en `registrar_venta` (muy fuera de rango → `p_autorizado_por` de un líder) y si el rango debe salir de lo VENDIDO (p10–p90 de ventas
  reales por categoría) en vez del catálogo cuando haya muestra.
- **A4** · Costo estimado con su origen (`venta_items.costo_origen`); Finanzas rotula el margen. **Espera la decisión del contador** (qué estimador).
  Revisa la decisión 7 de ADR-0334 («no se inventa un costo»): hay que actualizarla con el porqué.
- **A5, hecha:** el pie del ticket con «Hoy N sin registrar · M por regularizar» y el enlace a la mesa. La insignia global «Te toca» en la
  cabecera (también para terminales, `fn_pendientes`) sigue siendo de la Fase 3 (UX-02, INT-13).
- **A6, hecha:** migración `20261015004000` **en producción desde el 2026-10-14** (versión `20261015000109`). Hoy `cuadres_piso` = 0 en
  las tres tiendas: el día que entre, nadie podrá cerrar en bloque hasta cuadrar el piso (Existencias ▸ Cuadrar el piso), que es lo decidido.
- Fuera del bloque, con diseño propio (`/rigor`): el «descargo pendiente» para que un conteo no cuente como pérdida lo vendido sin registrar
  (`ajustar_inventario`, `cerrar_conteo`); y el bloque 2 (RPC transaccionales `corregir_venta`, `reemitir_comprobante`, disparador diferido
  «toda venta completada tiene un comprobante vivo»).
- `docs/datos/generado/` no tiene todavía las tres migraciones (entran con el próximo volcado; en producción las versiones son `20261014161821`, `20261015000106` y `20261015000109`).
- La auditoría completa (233 hallazgos, menú propuesto, hoja de ruta de 5 fases, 8 decisiones) vive en un artefacto privado de Felipe; la lista de
  seguridad (64 observaciones, 5 altas, sin verificar por el escéptico) se entregó aparte y no se versiona.
- **Pendientes de esta rama, dichos a Felipe:** `/chaos` y `/formidable` sobre «Prenda sin registrar» y «Anular comprobante» (pantallas que guardan); el volcado de
  `docs/datos/generado/` con las tres migraciones; y, al fusionar, mover esta fila de Sesiones activas a «Cerradas hoy».
