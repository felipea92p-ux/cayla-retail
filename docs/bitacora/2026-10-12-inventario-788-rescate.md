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
