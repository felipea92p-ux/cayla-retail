## 🏷️ Etiquetas de precio: «Imprimir sin el descuento» (2026-10-23) — solo web, sin migración; rama `claude/print-labels-without-discount-3cce7c`

- [x] `ImprimirEtiquetasPrecio`: interruptor que aparece solo si hay una campaña vigente en la lista; prendido, `sinDescuento(e)` quita campaña e ícono de campaña de la vista previa, la tabla y la hoja de impresión.
- [x] `iconosPorVariante(…, sinDescuento)` y `EtiquetaPrecio.iconosSinDescuento`: los íconos que quedan al no contar las etiquetas que rebajan; pruebas en `etiqueta-precio-reglas.test.ts`.
- [ ] **Sin probar a ojo en el navegador ni imprimiendo en la Brother** (se saltó por urgencia, pedido de Felipe). Mirar con la campaña Aniversario: prender, ver que el papel diga el precio de lista y que apagar vuelva al precio rebajado.
- [ ] Decisión de Felipe: hoy el interruptor empieza apagado y no se recuerda. Si durante toda una campaña lo prefiere recordado por computadora (como la forma A/B de la hoja), es un `localStorage` más.
