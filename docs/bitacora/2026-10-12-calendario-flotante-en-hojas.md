## 2026-10-12 (El calendario de una fecha flota fuera de la hoja — `CampoFecha`)
Qué hice: el calendario de los campos de fecha ahora flota fuera de la hoja (como la lista de un combo) en vez de dibujarse dentro de ella; y un
Escape con el foco en cualquier parte del calendario lo cierra solo a él.
Por qué así: dentro de un `<Modal>` (Nueva campaña, «Hasta») la hoja scrollea y recortaba el calendario por abajo y por la derecha, con una barra
horizontal. Se reusa el mecanismo ya probado de los combos (`usePosicionLista` + `useDestinoFlotante`, ADR-0211): si abajo no cabe, abre hacia arriba.
Felipe se lleva: lo mismo vale para todas las hojas con fecha (notas de crédito, pagos, compras, cotizaciones de maquila, editar campaña).
