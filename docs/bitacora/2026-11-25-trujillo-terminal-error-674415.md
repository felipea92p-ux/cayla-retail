## 2026-11-25 (Caja de TRU caía en «No se pudo cargar»)
Qué hice: cada pieza que escucha cambios en vivo abre su propio canal de Supabase (`nombreDeCanal` + `useId`), en vez de uno por tabla y sede.
Por qué así: en la Mac de TRU la Caja y la estación de impresión escuchaban las ventas de TRU con el mismo nombre de canal; Supabase devolvía el canal ya suscrito, su `.on()` lanzaba (Sentry CAYLA-RETAIL-1C, 26 veces) y la pantalla caía; además una podía cerrarle el canal a la otra.
Felipe se lleva: Caja ya no se cae en la sede que tiene encendida «Imprimir en la caja», y la impresión sigue enterándose al instante de cada venta.
