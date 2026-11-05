## Taller: cerrar lo pendiente antes del rediseño (2026-11-05, ADR-0614)
Lista de 16 actividades aprobada por Felipe el 2026-11-05.
- [x] 1 · Revertir restaura el costo de la prenda. `20261105213000_revertir_cierre_restaura_el_costo.sql` **en producción desde el 2026-11-05** (OK de Felipe; lo pegado coincidió por SHA-256 con el archivo y se verificó en solo lectura). Falta publicar la frase nueva de la hoja y refrescar el diccionario (`costo_historial` tiene dos columnas nuevas).
- [x] 2 · OP-1 a OP-4 cerradas en producción el 2026-11-05, con la orden de Felipe y desde su cuenta (OP-1 con «ya estaban registradas»). Comprobado en la base: OP-2, OP-3 y OP-4 tienen su entrada al stock y su costo; OP-1 no sumó stock ni movió el costo.
  - [ ] **La encargada:** declarar y anotar la tela de OP-5 y OP-6 antes de cerrarlas (Felipe no tiene el dato). «Pasar al stock» las frena si falta.
  - [ ] **OP-2 tiene tela anotada solo en 4 de sus 9 colores y sus botones sin descontar:** su costo por prenda puede estar corto. Revisar con quien la cortó.
  - [ ] **Falta el nombre de 4 servicios:** OP-1 (Corte, Ojales y botones), OP-2 (Planchado) y OP-4 (Corte). Hoy solo se registra con la orden abierta: la actividad 3 lo abre también con la orden cerrada.
- [ ] 3 · La deuda de un servicio llega a Por pagar.
- [ ] 4 · Pagar desde la vuelta, con su papel.
- [ ] 5 · «Llegó una compra», en hoja sencilla.
- [ ] 6 · Regularizar los lotes de compra sin proveedor y reemplazar una nota provisional.
- [ ] 7 · Ajustar lo que queda de un lote ya usado.
- [ ] 8 · Tope de corte de 3 prendas por talla y color.
- [ ] 9 · Cerrar un paso incompleto, con motivo.
- [ ] 10 · Anular con tela cortada pregunta qué hacer.
- [ ] 11 · Datos al abrir una orden.
- [ ] 12 · Cambiar una orden abierta, con motivo.
- [ ] 13 · Avíos que se descuentan solos.
- [ ] 14 · Las tres etapas de una prenda.
- [ ] 15 · Retirar el cajón de órdenes antiguas.
- [ ] 16 · Prueba completa y entrega para el rediseño.

**Límite conocido de la actividad 1:** una prenda con un cierre revertido sigue con su costo bloqueado a mano.
