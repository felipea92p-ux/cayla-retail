## Estados financieros en vidrio (Felipe 2026-11-05)

- [x] Felipe eligió pestañas fijas y letra Inter (2026-11-05).
- [x] Felipe eligió el fondo Hilos (2026-11-05). La decisión y sus excepciones están en ADR-0611.
- [x] Maqueta perfeccionada (2026-11-05): barra explorable, detalle debajo, libro del contador y botones de vidrio.
- [ ] Felipe aprueba la maqueta y la lista de actividades de construcción. La actividad de cada estado suma el detalle de sus partes: revisar qué desgloses da la base.
- [ ] Revisar si `lib/estados-financieros*` entrega las categorías y la serie de 12 meses que dibuja la maqueta.
- [x] Decidir aparte si el vidrio nuevo llega a todo el ERP. Felipe (2026-11-05): sí, después de Estados financieros. Anotado abajo.
- [ ] Selector de fechas: `?desde=&hasta=` en Estados financieros, `fn_patrimonio_cambios` con rango (migración, confirmar antes de producción) y lectura de ventas por día para los puntos del calendario.
- [x] Decidir si los campos de vidrio quedan solo en Finanzas. Felipe (2026-11-05): van al resto de los módulos después de Estados financieros. Anotado abajo.
- [x] Comparación con otros sistemas (`docs/investigacion/2026-11-05-componentes-frente-a-sistemas.html`): de la 1 a la 8 ya están en el ERP y de la 9, «Compacta» (ADR-0611).

## Después de Estados financieros: las mejoras al resto de los módulos (Felipe 2026-11-05)

Felipe: primero se implementa el diseño de Estados financieros; después, las mejoras de componentes y de visuales van al resto de los módulos. Nada de esta lista empieza antes.

**Componentes**

- [ ] **Tablas a `TablaViva`** (encabezado fijo, ordenar y filtrar desde la cabecera, total al pie). Hoy solo Rendimiento y Movimientos ▸ Ingresos; quedan 75 `<Tabla>`, pantalla por pantalla, y solo sirven las que traen todas sus filas al navegador. Primera candidata: Por pagar de Finanzas (`components/finanzas/PorPagarTodas.tsx`: ya filtra y ordena; vive en un `<Modal>`, hay que probar ahí el encabezado fijo). Siguen Terminados de Recibir (`components/recepcion-conteo/RecibidoEnLaSede.tsx`) y Ranking de ventas (`components/reportes-ventas/TablaRanking.tsx`). No sirven sin más trabajo: Clientes (pagina en la base por URL), Por pagar de Compras y Existencias (marcan filas, y `TablaViva` no). Gastos no usa `<Tabla>`.
- [ ] **Monto (mejora 3):** 17 archivos con `<input>` propio (`atributosMontoTexto` o `CLASE_MONTO_ILEGIBLE`) no dan formato al salir. Pasarlos a `CampoMonto` o `EntradaMonto`.
- [ ] **Fechas (mejora 8):** 18 archivos siguen con `type="date"` del navegador. Pasarlos a `CampoFecha`, con `min` y `max` donde la validación ya los pide.
- [ ] **Errores en su campo (mejora 1):** solo Registrar gasto usa `marcarError` para lo que devuelve el guardado. Las demás hojas de Finanzas siguen con `avisar.error`: AgregarCuentaModal, CierreMes, SaldosArranqueModal, HojaCorregirGasto y otras.
- [ ] **Avisar al salir (mejora 2):** hoy Gastos, `ConsultaDocumento` y `EntradaMonto`. Los demás campos que regañan mientras se escribe pasan a `useValidarAlSalir`.
- [ ] **Dedo (mejora 5):** `pnpm --filter web tacto:medir` cubre 8 rutas. Medir el resto; los puntos de color de Existencias quedan bajo 44 px a propósito.

**Visuales**

- [ ] **El vidrio de Estados financieros** (filo de luz, brillo que sigue al mouse, borde que desvía) en el resto del ERP. Hasta entonces es una receta solo de esa pantalla (ADR-0611). Antes, medir la fluidez en el Mac mini; una tabla o grilla larga no puede usarla.
- [ ] **Los campos de la maqueta** (`docs/maquetas/finanzas-eeff-vidrio-2026-11/`, «Probar ▸ Ver ▸ Campos»): monto, combo, opciones con gota, RUC, serie. Son piezas nuevas: pasan por `/unificar` y Felipe elige mirando (ADR-0358).
- [ ] **El calendario de vidrio** con atajos y rango en dos toques, una vez probado en Estados financieros.
- [ ] **Letra Inter y fondo Hilos:** decidido solo para Estados financieros. Falta que Felipe diga si salen de ahí.

**Decidido que no, por ahora (Felipe 2026-11-05, ADR-0611):** otro lote, editar en la fila y cambiar el loader por esqueletos.

## Antes del PR de esta rama

- [x] `/chaos` en Registrar gasto (semilla 611, informe en `.chaos/`).
- [x] `pnpm --filter web tema:auditar` en Gastos, Clientes, Rendimiento y Proveedores: lo que señala no viene de esta rama (el hallazgo solo en oscuro es «Pagar vencido» en la vista rápida de un proveedor, 4,24:1). 9 de 28 escenarios no abrieron: necesitan gastos que la base local no tiene, o quedaron viejos (el período «Mes» de Rendimiento).
- [ ] Menor, de `/chaos`: con el reloj del equipo en otro año, «3/11» toma ese año. Donde hay `max`, sacar el año de ahí.
