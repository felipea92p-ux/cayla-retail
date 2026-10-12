## 2026-10-12 (Ventas sin registrar: lo vigente de #788, rescatado sobre la mesa del Puente)
Qué hice: traje al repo, sin cambiar una coma, las dos migraciones de #788 que producción tiene desde el 5-oct (las candidatas con el libro, y
«nadie regulariza su propia venta salvo el líder»), con su prueba en el CI; en Vender, «Prenda sin registrar» sugiere la categoría que nombra lo
escrito («Escribiste «Jean»: ¿no será Jeans?»), sin aplicarla; y en la mesa, «¿Cómo estaba?» marca «Sugerida» la respuesta que dice el libro y
avisa en ámbar si se elige la contraria. #788 no se fusiona: su modal quedó superado por la mesa que eligió Felipe (ADR-0360).
Por qué así: el repo tenía que decir lo que producción ya hace (desde el 5-oct regularizar exige quién firma y rechaza la propia venta, y la web
mostraba ese rechazo como «avisa a Felipe. Código: …»); y contestar mal «¿Cómo estaba?» descuenta dos veces o deja una prenda fantasma, cosa que
nadie sabe de memoria y el libro sí.
Felipe se lleva: la sugerencia nunca elige por nadie (puede fallar si una carga se contó en papel y se registró días después); cerrar #788 sin
fusionar, remitiendo a este PR.

## 2026-10-12 (revisión adversarial del rescate de #788)
Qué hice: la mesa ahora avisa antes del botón lo que la base ya rechazaba desde el 5-oct (una prenda que nunca entró a la tienda, con la misma
frase de la base, y la venta propia, bajo el «Responsable»); antes mandaba a «Llegó nueva» justo en el caso que la base rechaza. «Escribiste «…»»
ya no cita el nombre del color, el porqué de «Sugerida» se trae a la vista en el celular, la hoja no se anima con movimiento reducido, el porqué
no le dice «ese conteo» a una recepción, y una prueba nueva impide que la forma o la categoría se elijan solas.
Por qué así: el rescate había descartado dos avisos de #788 creyendo que la mesa los cubría; no los cubría, y la persona hacía todo el trabajo para
recién enterarse al final. Solo avisan: el botón y la guía no cambian, y manda la base.
Felipe se lleva: producción tiene 36 acciones sin responsable y `main` 35 (sobra `producto_confirmar_cambios`: `20261006180100` sin pegar o
revertida); lo decide la sesión principal, no este PR.
