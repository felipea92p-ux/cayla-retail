## 2026-10-02 (El cobro sale del ticket: hoja lateral sobre el catálogo, con QR)
Qué hice: al tocar «Cobrar», una hoja ancha entra sobre el catálogo con seis medios en cuadrados grandes (QR nuevo), billetes sugeridos para el efectivo y el vuelto grande, y boleta/factura/nota sin ninguno marcado; el ticket sigue a la derecha. Con dos o más medios, el que no se escribió se queda con el resto. Se quitó el Nº de operación de la caja. Migración `20261002130000` (QR en `venta_pagos` y en el libro de Finanzas), aplicada en producción el mismo día; diccionario refrescado. ADR-0306.
Por qué así: el cobro se apretaba en 420 px con scroll mientras la grilla quedaba vacía; Felipe eligió la hoja lateral entre nueve maquetas y la pulió «tal cual». Siempre con «Confirmar» (sin cobro de un toque) y el QR solo en Vender, para no ofrecerlo donde la base lo rechaza.
Felipe se lleva: cobrar Yape + Boleta en tres toques, viendo de lejos qué medio y qué comprobante quedaron; y la migración lista para pegar en dos partes cuando quiera el QR en las tiendas.

## 2026-10-02 (QR en producción y fuera la búsqueda por Nº de operación)
Qué hice: apliqué en producción la migración del QR en sus dos partes (a pedido de Felipe) y la verifiqué; quité del buscador de Historial, Cambios y Devoluciones la búsqueda por Nº de operación.
Por qué así: antes de aplicar comparé producción con el repo y encontré que el candado de `venta_pagos` también acepta `'anticipo'` (apartados entregados): la migración lo borraba y se corrigió antes de tocar nada. La búsqueda por Nº de operación ya no tenía datos nuevos.
Felipe se lleva: producción lista para cobrar con el QR de Izipay en cuanto la hoja de cobro llegue a `main`, y un buscador sin una opción que ya no servía.
