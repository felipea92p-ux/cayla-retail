# 2026-11-08 · Caja: un solo «Historial de cierres» y el detalle del cierre vuelve a su ancho

- **Qué pasó:** el mismo botón «Historial de cierres» abría dos pantallas según la hora: con la caja abierta, el modal por mes (tickets con su sello y «Cómo cerró cada día»); con la caja cerrada, la tabla de `/caja/historial`. Y el detalle de un cierre, al bajar de 1024 a 768 px en la ronda 12 de `/unificar` (2026-10-14), apilaba sus tres tarjetas: los medios de pago y los movimientos del turno quedaban dos pantallas abajo (medido con el cierre de TRU del 7-nov: «Lo que pasó en el turno» a 1636 px contra 1045 antes). Los datos siempre llegaron bien (verificado en los registros de producción).
- **Arreglo:** con la caja cerrada, el botón abre el mismo modal por mes (`components/caja/BotonHistorialCierres.tsx`); la tabla de todas las sedes sigue en «Ver todas las sedes» del modal. El detalle vuelve a `max-w-5xl` (`ANCHO_DETALLE_CIERRE`, con su `unificar-fijo`), en el modal y en `/caja/historial`. La guía de Caja dice lo nuevo y su huella está aceptada. Sin migración.
- **Felipe se lleva:** el historial de cierres es uno solo, abra la caja o no, y el detalle de un cierre vuelve a verse como se aprobó el 12-oct: qué se cobró, cómo cuadró y a dónde fue el efectivo, en una fila; los movimientos, justo debajo.

# 2026-11-08 · Caja cerrada: cada cierre anterior abre su detalle

- **Qué pasó:** en «Abrir caja», las tarjetas de «Cierres anteriores» (los últimos 7 de la tienda) solo se leían; para ver el detalle de uno había que ir al historial.
- **Arreglo:** cada tarjeta es un botón que abre la misma hoja de detalle del historial (`useDetalleCierre`, 1024 px: lo cobrado por medio de pago, cómo cuadró, a dónde fue el efectivo y los movimientos). La hoja va fuera del `<form>` de abrir la caja. La guía de Caja gana su paso «Cierres anteriores» (`caja.cierres-anteriores`) y su huella está aceptada.
- **Después:** cada tarjeta dice «Ver detalle ›» al pie (en tinta, no en rojo: son siete), y las siete van en fila solo desde 1400 px; por debajo, de a cuatro (a 1024 px cada tarjeta medía 72 px y el monto y el texto se salían del borde).
- **Felipe se lleva:** con la caja cerrada, tocar cualquiera de los últimos cierres lleva directo a su detalle, sin pasar por el historial.
