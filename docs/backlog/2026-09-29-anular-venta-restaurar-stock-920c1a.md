## 🧾 PDF con el número, serie B001 (próximo 4), Actividad sin ventas de prueba y la venta de las 12:55 (2026-09-29, ADR-0278) — web + una migración y tres scripts de datos; rama `claude/anular-venta-restaurar-stock-920c1a`

- [x] **Nombre del PDF = número del comprobante.** `lib/impresion-reglas.ts` (`nombreDeImpresion`, 4 pruebas) y `lib/useTituloDeImpresion.ts`, usados en `VentaRegistradaModal`,
  `DetalleVentaModal`, `ProformasPanel`, `ModalesApartado` y `CambioTicket`. `tsc`, `eslint` y las 243 pruebas de la web en verde.
- [ ] **Sin probar en el navegador:** que Chrome proponga «B001-000004.pdf» al «Guardar como PDF». Hace falta una venta real (no se creó ninguna en producción).
  Prueba: vender una prenda → «Solo imprimir» → destino «Guardar como PDF» → el nombre propuesto es el número. Safari y Firefox también usan el título; no se miraron.
- [x] **Serie de boleta de Tienda TRU: `B001`, próximo 4** — aplicado en producción y verificado (B001 ACTIVA próximo 4, B004 archivada). Dos scripts, en este orden:
  `pegar-en-produccion-serie-boleta-trujillo-b004-2026-09-29.sql` (equivocado, corregido) y `…-b001-proximo-4-2026-09-29.sql` (el que vale). ADR-0278.
- [ ] **B001-000002 y B001-000003 existen en Lucode y no en el ERP.** Alguien las emitió por fuera. Averiguar qué son; si eran pruebas, están «aceptadas» ante SUNAT y
  habría que darlas de baja igual que la 000001 (resumen diario). El ERP no puede verlas ni darlas de baja: no tiene sus filas.
- [ ] **Arequipa (`B002`) y Lima (`B003`):** siguen desde el 1. Felipe solo verificó Trujillo. Si Lucode ya tiene números en esas series, el mismo problema: comprobarlo
  en el panel antes de la primera venta de cada sede.
- [x] **Actividad sin ventas de prueba** — `20260930030000_actividad_oculta_ventas_de_prueba.sql`, **aplicada en producción** (las dos funciones conservan permisos y llevan la línea
  nueva una vez). `pnpm pruebas:actividad-oculta-ventas-de-prueba`: 8/8 contra el Postgres local, con dos CONTROLES que muestran que el hueco existía. Oculta por la venta, no por la
  fila: registro y anulación desaparecen juntas. La tabla `actividad` no se toca. Las filas «se deshizo la venta de prueba …» (purgas) siguen visibles: son la constancia de una
  purga y no se pidieron ocultar.
- [ ] **Sin probar:** el panel «Actividad · Punto de venta» y el Inicio con una sesión de líder de verdad (se probó la función SQL, no la pantalla). No hay interruptor «Con datos
  de prueba» en Actividad (Historial sí lo tiene): quien quiera ver lo oculto tiene que ir a la tabla. Si se quiere, es un parámetro nuevo de `fn_actividad`.
- [x] **Venta de las 12:55 (`df60dae1…`, `B001-000001`, una vendedora de TRU, S/ 59.90 en efectivo): anulada y su prenda de vuelta al inventario** — `pegar-en-produccion-archivar-venta-de-prueba-b001-000001-2026-09-29.sql`
  y `pegar-en-produccion-anular-venta-b001-000001-2026-09-29.sql`, pegados en producción y verificados: venta `anulada` + `es_prueba`, entrada `anulacion_venta` de 1, «Piso de venta» de 0 a 1,
  ya no sale en Actividad. Se anuló con SQL a mano (equivalente a `anular_venta`) porque la función se niega a anular una venta con boleta aceptada y el SQL Editor no tiene sesión de líder.
- [ ] **La baja de la boleta `B001-000001` sigue EN TRÁMITE.** Felipe la pidió a las 16:02 (motivo «ERROR»); la boleta sigue «aceptada» con `anulacion_solicitada_at` puesto y `anulado_at` vacío. Hay que
  abrir Ventas ▸ Comprobantes ▸ «Consultar anulación» hasta que diga «anulado». **Si SUNAT la rechaza (plazo)**, la boleta queda viva con la venta anulada y el inventario ya devuelto: se corrige con una
  nota de crédito (ADR-0016), no anulando de nuevo. Mientras no confirme, SUNAT sigue teniendo un ingreso de S/ 59.90 que el ERP ya no tiene.
- [ ] **Caja de hoy (abierta):** al anular la venta, el efectivo esperado bajó S/ 59.90. Si esos S/ 59.90 entraron de verdad al cajón, el cierre mostrará ese sobrante.
- [ ] **Actividad con «Todo» o «7 días» aún muestra entradas de ayer** («anuló la venta B005-000001», «se deshizo la venta de prueba …»): esas ventas se purgaron de verdad (ya no existen en `ventas`),
  así que el filtro por `es_prueba` no las puede identificar. Ocultarlas exigiría otra regla (p. ej. por `detalle.purga`); no se hizo.
- [ ] **«Que no quede rastro» tiene un tope, por diseño:** `movimientos` y `actividad` son inmutables y una boleta aceptada por SUNAT no se borra. Lo que se puede es que la venta de prueba no
  aparezca en Historial, Finanzas ni Actividad (`es_prueba`).
- [ ] **`docs/datos/generado/`** no se refrescó (cambiaron `series_comprobantes` y dos funciones en producción; el volcado sigue en el de la mañana).
