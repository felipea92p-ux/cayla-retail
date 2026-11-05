## Estados financieros en vidrio (Felipe 2026-11-05)

- [x] Felipe eligió pestañas fijas y letra Inter (2026-11-05).
- [x] Felipe eligió el fondo Hilos (2026-11-05). La decisión y sus excepciones están en ADR-0611.
- [x] Maqueta perfeccionada (2026-11-05): barra explorable, detalle debajo, libro del contador y botones de vidrio.
- [ ] Felipe aprueba la maqueta y la lista de actividades de construcción. La actividad de cada estado suma el detalle de sus partes: revisar qué desgloses da la base.
- [ ] Revisar si `lib/estados-financieros*` entrega las categorías y la serie de 12 meses que dibuja la maqueta.
- [ ] Decidir aparte si el vidrio nuevo llega a todo el ERP: Felipe opina que el actual es «algo pobre» y el cambio toca todos los módulos.
- [ ] Selector de fechas: `?desde=&hasta=` en Estados financieros, `fn_patrimonio_cambios` con rango (migración, confirmar antes de producción) y lectura de ventas por día para los puntos del calendario.
- [ ] Decidir si los campos de vidrio quedan solo en Finanzas o reemplazan a los del ERP (Felipe; `docs/maquetas/finanzas-eeff-vidrio-2026-11/`, pantalla Campos).
- [ ] Comparación con otros sistemas (`docs/investigacion/2026-11-05-componentes-frente-a-sistemas.html`): aplicadas en la maqueta el 2026-11-05. Felipe las prueba y decide cuáles llegan al ERP, y cuánto se mueve lo diario. Llevarlas al ERP es trabajo aparte.

## Mejoras de componentes (ADR-0611): lo que quedó

- [ ] **Mejora 9, decisiones de Felipe:** pasar más tablas a `TablaViva` (encabezado fijo y orden), lote (qué acción y en qué pantalla), edición en la fila (toca dinero: mismo rastro que una corrección), esqueleto de carga (choca con ADR-0149).
- [ ] Mejora 3: 17 archivos con `<input>` propio (`atributosMontoTexto` o `CLASE_MONTO_ILEGIBLE`) no dan formato al salir. Pasarlas a `CampoMonto` o `EntradaMonto` cuando se toquen.
- [ ] Mejora 8: 18 archivos siguen con `type="date"` del navegador. El rango con dos toques dentro de un mismo calendario es de la reconstrucción de Estados financieros, sin aprobar.
- [ ] Mejora 1: solo Registrar gasto usa `marcarError` para lo que devuelve el guardado. Las demás hojas de Finanzas siguen con `avisar.error`: AgregarCuentaModal, CierreMes, SaldosArranqueModal, HojaCorregirGasto y otras.
- [ ] Mejora 5: `tacto:medir` cubre 8 rutas. Medir el resto; los puntos de color de Existencias quedan bajo 44 px a propósito.
- [ ] Sin correr todavía: `/chaos` en Registrar gasto y `pnpm --filter web tema:auditar`.
