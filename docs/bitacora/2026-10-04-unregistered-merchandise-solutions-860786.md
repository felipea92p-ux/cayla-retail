## 2026-10-04 (Ventas sin registrar: un líder puede cerrar la cola de arranque, reabrirla y identificar con sugerencias — ADR-0334)
Qué hice: Felipe pidió «una opción de lo entiendo y doy por hecho» para las ventas de prendas que caja vendió antes de que existieran en el
sistema. Producción (solo lectura) mostró que «Regularizar» solo sirve en un caso de tres: TRU 97 pendientes y AQP 170, pero AQP tiene 13
prendas cargadas, así que 167 de sus 170 no tienen ni una candidata, y la cola crece (AQP de 26 a 58 por día). Con su elección (opción B) se
construyó en tres cortes, uno por commit, cada uno probado contra Postgres y en el navegador: (1) un líder cierra la cola de UNA tienda en
bloque, con motivo y dentro del plazo (15-oct), y las filas quedan «cerradas sin prenda», sin mover stock; (2) si una cliente devuelve una
prenda cerrada, un líder la «reabre» (la respuesta de Felipe a una pregunta sobre devoluciones); (3) antes de cerrar, «Identificar con
sugerencias» une de una vez las ventas que tienen UNA sola prenda posible (23 en TRU), con la confirmación fila por fila del líder. Una
colaboradora no ve ninguno de los tres botones. **Nada está en producción:** cinco migraciones (`20261005100000`/`100`/`200`, `110000`,
`120000`) esperan su «dale».
Por qué así: cerrar es una decisión de una persona con fecha y firma, no cientos de clics (un botón por fila se volvía el camino fácil). Los
estados imposibles los impide el esquema (una venta cerrada sin su cierre, o con el cierre de otra tienda, no puede existir). Y una sola
candidata no es certeza: si la prenda vendida nunca se cargó, la sugerida es otra que sigue colgada, por eso lo confirma una persona. Lo que
NO se hizo a propósito: regularizar AQP antes de cargarla (crea un movimiento y la carga inicial rechaza esa prenda después) e inventar un
costo para las cerradas (el margen sale inflado y se ve, en vez de llenarse con un número que parece real).
Felipe se lleva: el ADR-0334; el orden para pegar el SQL en `docs/backlog/2026-10-04-unregistered-merchandise-solutions-860786.md` (la web va
DESPUÉS de las partes 1 y 3: la lista pide la tabla del cierre); y tres decisiones suyas pendientes: cerrar TRU recién después de cuadrar su
piso, qué hacer con el costo desconocido en el cierre de mes de Finanzas (tarea aparte) y si el plazo debe poder editarse desde la pantalla.
