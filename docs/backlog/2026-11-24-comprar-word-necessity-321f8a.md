## 🧾 «Qué pedir» en dos partes y tarjetas sin botones (2026-11-24, ADR-0357 act.) — solo web, sin migración; rama `claude/comprar-word-necessity-321f8a`

- [x] Sin «Comprar» ni «o pedir a…» en las tarjetas de «Qué pedir» y «Se acaba» (la ficha conserva «Pedir a…»).
- [x] «Ya se agotaron»: lo agotado que se vendió en 8 semanas, con «Se agotó el …» y «Vendiste N en N días»; ya no se va de la lista al mes.
- [x] «Se acaban antes de Navidad»: «Hasta el 7 dic.», «Tienes 72», «Vendes 39 por semana».
- [x] «Ordenar por ▸ Lo que más se vende y quedan pocos»: primero lo que se acaba en 2 semanas o menos, de lo más vendido a lo menos.
- [x] Dos órdenes separados: «…y no hay stock» (arriba lo agotado) y «…y quedan pocos» (arriba lo que se acaba); cada parte muestra 10 y «Ver N más».
- [x] Pruebas de la lógica, guía de Análisis al día y su huella aceptada; verificado en el navegador a 1600 y 375 px, claro y oscuro.
- [ ] **Decide Felipe:** si «Comprar todas» de «Se acaba» también se va (hoy lleva a Mis compras, como lo hacía «Comprar»).
- [ ] **Decide Felipe:** cómo marcar un agotado que fue compra de una sola vez y no se repite (hoy sale en «Ya se agotaron» hasta 8 semanas).
- [ ] **Sin probar:** con una cuenta real en producción y con una encargada de tienda; `/formidable` de la pestaña.
