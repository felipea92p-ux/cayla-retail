## Precio propio por tienda — lo que quedó (2026-10-10, rama `claude/pricing-by-location-error-f67ffd`)

- [ ] **Producción:** pegar `20261011100000_precio_de_tienda_por_prenda.sql` y después `20261011100100_apartar_cambiar_y_filtrar_con_el_precio_de_la_tienda.sql` (cada una sola, re-ejecutable, sin políticas). La primera archiva el precio propio de AQP en FAL-0008 (igual al de la prenda). **No está en producción** hasta el OK de Felipe; después, `pnpm datos:generar:produccion` para el diccionario.
- [ ] **Decisión de Felipe:** piso de costo / tope para un precio de tienda (hoy solo avisa pasado el 30 %; un descuento en la caja sí tiene piso y tope).
- [ ] Pantallas que todavía muestran el precio de la prenda donde debería ir el de la tienda (auditoría 2026-10-10): Inicio de Almacén «Nuevo en otras sedes», Análisis de la sede, Dañadas (precio de partida), aviso «Por debajo del costo» de Campañas, margen de Producción. Ninguna cobra.
- [ ] Cambios y devoluciones en otra tienda devuelven la prenda al piso con la etiqueta de la tienda donde se vendió: falta el aviso que sí tiene Traslados.
- [ ] `registrar_cambio` no recibe la diferencia que mostró la pantalla (si el precio cambia en medio, descuadra) y una venta sin red que sube después de un cambio de precio se rechaza: dos carreras que ya existían con el precio de la prenda.
- [ ] Frescura «La rebajé» no reconoce una rebaja hecha con precio propio (cuenta la venta como «sin descuento»).
