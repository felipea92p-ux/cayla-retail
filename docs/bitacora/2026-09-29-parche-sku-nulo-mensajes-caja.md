## 2026-09-29 (La caja ya no muestra el error crudo de Postgres cuando rechaza una venta)

Qué hice: `registrar_venta` y `separar_prendas` armaban 17 mensajes de rechazo (precio cambiado, stock
restringido, descuento sin argumento, etc.) pegando el `sku` de la prenda. El catálogo nuevo (desde
ADR-0263) ya no escribe `sku`, así que una prenda cargada por esa vía tiene ese campo vacío — y en
Postgres, pegar un valor vacío dentro del mensaje de un `raise` hace que el mensaje entero se caiga con
un error técnico («RAISE statement option cannot be null») en vez de mostrar la frase en español que ya
existía para ese caso. Cambié el único lugar donde cada función lee ese dato: ahora usa el código nuevo
de la prenda, y si tampoco lo tiene, dice «sin código» — nunca vacío. Pegado en producción (parche vivo,
verificado antes y después contra el código real que corre ahí, no contra el archivo del repo).

Por qué así: no era un error de una prenda puntual — era la forma en que ambas funciones arman TODOS sus
mensajes de rechazo. Corregir el origen del dato, una vez, evita tener que tocar los 17 mensajes uno por
uno y que alguno quede sin corregir.

Felipe se lleva: la migración `20260929150000` ya está en producción. Probado antes de pegar con una
prenda de prueba sin ese dato: el mensaje salía roto; después, sale correcto. Nada de esto se nota en la
pantalla hasta que una venta se rechaza — no hace falta avisar a nadie en tienda.
