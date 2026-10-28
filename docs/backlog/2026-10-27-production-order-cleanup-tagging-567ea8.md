## 🧵 Producción: cinco pasos, orden «de antes» y etapas de visibilidad (2026-10-27) — rama `claude/production-order-cleanup-tagging-567ea8`

- [x] **Actividad 0, solo lectura de producción y del repo** + **ADR-0551 propuesto** (`docs/adr/0551-…`).
- [x] **Preguntas 1 a 4 del ADR-0551 resueltas por Felipe** (visto de calidad en Planchado, Catálogo la muestra a quien edita, «lleva botones» es dato del modelo, OP-1 y OP-4 se convierten en «de antes»).
- [x] **Medido en producción (solo lectura, 27-oct):** las 4 órdenes tienen la ruta de 7 pasos y 0 avances; no hay categoría de gasto para servicios de producción; el Chaleco es 57 contra 58 (el producto tiene 66 por colores fuera de la orden). Detalle en las preguntas 5, 6 y 8 del ADR.
- [ ] **Felipe contesta las preguntas abiertas del ADR-0551**: cifra del Chaleco (57 o 58), dónde están las 69 de la Blusa, camino del pago (con el contador) y fecha real por paso.
- [ ] **Actividad 1** · bajar los pasos fijos de 7 a 5 (migración en partes, con OK de Felipe).
- [ ] **Actividad 2** · orden «de antes» (función solo del líder, fecha real por paso; OK de Felipe).
- [ ] **Actividad 3** · cierre «ya estaba en stock» (toca stock y dinero: OK explícito). **OP-1 (Chaleco, lote de 57) no se cierra hasta tenerla**: duplicaría stock.
- [ ] **Actividad 4** · pago automático desde BCP Operativa al registrar la Vuelta con «Pagado» (toca dinero: OK explícito).
- [ ] **Actividad 5** · registrar la Blusa Claudia y el Chaleco CAYLA (antes: cargar proveedores y los insumos con `recibir_insumo` y `saldo_inicial`).
- [ ] **Sesión aparte** · `fn_producto_etapa` y las cinco lecturas que la preguntan (Vender, vitrina, Productos, Existencias, Análisis).
- [ ] **Sesión aparte** · el Taller como mayorista (ADR-0547, espera el OK de Felipe).
