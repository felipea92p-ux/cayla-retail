## 🧹 Existencias: toda la maqueta (2026-10-06, ADR-0344 cuarta vuelta) — solo web, sin migración; rama `claude/existencias-maqueta-completa`

- [x] **Pasos dentro del panel** para las siete acciones (`FlujoTalla`, `lib/existencias-flujos.ts`), con la marca del intento por huella.
- [x] **Borrado lo reemplazado:** cajón de la prenda, ventanas Reponer, Subir y Reportar dañada, `MatrizMover`, `DesgloseStockPrenda` y sus reglas sin uso.
- [x] **Tarjeta como la maqueta** (filtro marca tallas y colores; icono Colgar/Pedir/Ver; cabecera abre el panel).
- [x] **Anillo «N de M hoy»**, caja de buscar, pistola sin buscador, teclado y hoja en el celular.
- [ ] **Ver `/inventario` con sesión real** en computadora y a 375 px: cada paso contra la base de verdad (colgar, subir para enviar, pedir para un
      cliente, ajustar con motivo, reportar dañada). Verificado solo con datos inventados; las funciones de la base no se llamaron.
- [ ] **«Lo confirma un líder» de Ajustar** (la maqueta lo dibuja): no existe en la base; sería una cola de aprobación con su tabla. Decisión de Felipe.
- [ ] **Apartar dentro del panel con adelanto:** hoy abre Vender (ahí se cobra). Hacerlo en el panel duplicaría la caja y el comprobante.
- [ ] **El anillo y el piso sin cuadrar de TRU:** mientras el piso esté en pausa, el anillo solo cuenta lo agotado que otra tienda tiene.
- [ ] **Un pedido hecho no llena el anillo** hasta que llega: si se quiere contarlo, Existencias tiene que leer los pedidos abiertos de la talla.
- [x] **Descripción del producto:** la trajo #832 (Felipe, 2026-10-06) y va bajo el nombre del panel, no en la Ficha como la maqueta: manda la decisión de Felipe.
