## 2026-09-30 (Club de clientas, tanda 1d: «se la probó y no la llevó» en Cobrar, y «es para regalo» en espera)

Qué hice:
- **Base.** `pedidos_no_atendidos` guarda dos señales en la misma tabla: `motivo`, donde todo lo de antes queda «buscó y no
  había», y una `razon` que solo existe con «se la probó». `registrar_pedido_no_atendido` las recibe al final, con los
  defaults de hoy.
- **Cobrar.** Al quitar una prenda del ticket, aparece la pregunta del spike: «¿Se la probó y no la llevó?», con cuatro
  razones y «No anotar». Tocar una razón la anota para Compras, firmada por el responsable.
- **Cuatro partes.** Traje la 1c y partí la migración, cada parte con una sola tabla en uso. «Es para regalo»
  (`venta_items.es_regalo` y la ficha que lo lee) quedó en las partes 3 y 4, en espera y separables: el spike la sacó del
  ticket.

Por qué así: una sola tabla responde la pregunta de Compras («¿qué querían y no se llevaron?»). «Llegó tu talla» no debe
avisarle a nadie de una prenda que se probó y no quiso, y eso quedó escrito en la base. Las partes siguen lo que encontró
la 1c: una transacción que toma `venta_items` junto con otra tabla en uso puede trabarse en cruz con una venta.

Felipe se lleva:
- decidir si «es para regalo» se queda;
- pegar las partes 1 y 2 después de la 1c (y la 3 y la 4 si se queda);
- fusionar después de pegar;
- para verlo: en Vender, quita una prenda, toca «Precio» y mírala en `/pedidos-no-atendidos`.
