## Taller: cerrar lo pendiente antes del rediseño (2026-11-05, ADR-0614)
Lista de 16 actividades aprobada por Felipe el 2026-11-05.
- [x] 1 · Revertir restaura el costo de la prenda. `20261105213000_revertir_cierre_restaura_el_costo.sql` **en producción desde el 2026-11-05** (OK de Felipe; lo pegado coincidió por SHA-256 con el archivo y se verificó en solo lectura). Falta publicar la frase nueva de la hoja y refrescar el diccionario (`costo_historial` tiene dos columnas nuevas).
- [x] 2 · OP-1 a OP-4 cerradas en producción el 2026-11-05, con la orden de Felipe y desde su cuenta (OP-1 con «ya estaban registradas»). Comprobado en la base: OP-2, OP-3 y OP-4 tienen su entrada al stock y su costo; OP-1 no sumó stock ni movió el costo.
  - [ ] **La encargada:** declarar y anotar la tela de OP-5 y OP-6 antes de cerrarlas (Felipe no tiene el dato). «Pasar al stock» las frena si falta.
  - [ ] **OP-2 tiene tela anotada solo en 4 de sus 9 colores y sus botones sin descontar:** su costo por prenda puede estar corto. Revisar con quien la cortó.
  - [ ] **Falta el nombre de 4 servicios:** OP-1 (Corte, Ojales y botones), OP-2 (Planchado) y OP-4 (Corte). Ya se puede con la orden cerrada (actividad 3), cuando se publique.
- [x] 3 · La deuda de un servicio llega a Por pagar, y el nombre se registra con la orden cerrada. **POR PEGAR:** `20261105221000_servicios_del_taller_por_pagar.sql`, una parte, con el OK de Felipe, antes de publicar la web. Finanzas ▸ Por pagar (`fn_por_pagar_consolidado`) todavía no lista estos servicios: su botón «Pagar» espera una factura.
- [x] 4 · Pagar a un servicio desde Por pagar, con su papel. **POR PEGAR:** `20261105222000_pagar_servicio_de_la_orden.sql`, una parte, DESPUÉS de `20261105221000` y antes de publicar la web. Al publicar, Por pagar mostrará lo que se les debe a los servicios de las órdenes ya anotadas: si Felipe ya les pagó fuera del ERP, se registra con «Ya lo pagué» y su fecha.
- [x] 5 · «Llegó una compra», en hoja sencilla: varias líneas, por metro, kilo o rollo, y un aviso si el proveedor tiene un pedido abierto. «Ingresar insumo» pasó a «Saldo inicial». **POR PEGAR:** `20261105223000_llego_una_compra.sql`, una parte, DESPUÉS de `20261105222000` y antes de publicar la web. **Sin kilos en un avío ni rollos con código de lote:** el código solo se pide en metros; va con el rediseño.
- [x] 6 · «Decir a quién» en un lote de compra sin proveedor (hay 7 en producción, por completar) y «Llegó el papel» en un comprobante S/P. **POR PEGAR:** `20261105225000_regularizar_lotes_y_papeles.sql`, una parte, DESPUÉS de `20261105223000` y antes de publicar la web.
- [x] 7 · Ajustar lo que queda de un lote ya usado: baja como merma; si hay más, es «Saldo inicial». Misma migración. Una lectura de producción del 5-nov confirmó que el saldo del libro y el de los lotes cuadran en todos los insumos: no hay nada que convertir.
- [x] 8 · Tope de corte de 3 prendas por talla y color. **POR PEGAR:** `20261105232000_tope_de_corte_tres_prendas.sql`, una parte.
- [x] 9 · Cerrar un paso incompleto con motivo: **ya existía** desde ADR-0570, actividad 2 (en producción desde el 29-oct): «Terminé» anota las prendas que se perdieron, con su motivo, y el paso cierra (`pruebas:produccion-termine-con-falla`, casos B3 y B5). Sin código nuevo.
- [ ] 10 · Anular con tela cortada pregunta qué hacer.
- [ ] 11 · Datos al abrir una orden.
- [ ] 12 · Cambiar una orden abierta, con motivo.
- [ ] 13 · Avíos que se descuentan solos.
- [ ] 14 · Las tres etapas de una prenda.
- [ ] 15 · Retirar el cajón de órdenes antiguas.
- [ ] 16 · Prueba completa y entrega para el rediseño.

**Límite conocido de la actividad 1:** una prenda con un cierre revertido sigue con su costo bloqueado a mano.
