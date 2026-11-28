# 2026-11-28 · El DNI de la boleta une la ficha; «Quién» ya puesto deja de ser un paso (ADR-0718)

Qué hice: al escribir en el cobro el DNI de un cliente registrado, la venta entra en su ficha (con «Quitar»). En Existencias, con cuenta personal o Admin, colgar, subir, pedir y reportar dañada se confirman sin el paso «Quién».
Por qué así: Felipe eligió estas dos sobre la maqueta; el sistema ya sabía las dos cosas y las volvía a pedir (o las perdía).
Qué se rompería sin esto: ventas con DNI fuera de la ficha y sin puntos; un toque de más en la acción más repetida del piso.
Probado: suite web (983 archivos), tipos y lint; en el navegador a 1440 y 375 px, con las llamadas que escriben bloqueadas (no se grabó ninguna venta ni movimiento).

Qué hice (devoluciones): el último paso registra y aprueba de una, con el reembolso ahí y una sola firma; «Dejar pendiente» sigue.
Por qué así: eran dos viajes y dos firmas para algo que la misma persona hace en el mostrador.
Qué se rompería sin esto: devoluciones que se quedan pendientes porque aprobarlas estaba en otra pestaña.
Probado: una devolución real en la base local (aprobada, reembolso en efectivo contra la caja, prenda al stock y nota de crédito reservada) y el caso de boleta pendiente a 375 px.
