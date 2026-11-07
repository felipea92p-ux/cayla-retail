## Producción · quitar pasos de una orden abierta (ADR-0551 act. 1b)
- **HECHO en producción (2026-10-28):** `20261028071000_produccion_quitar_paso_de_la_orden.sql` pegada y verificada (la función existe). La limpieza de OP-1 a OP-4 también: 8 pasos quitados, 0 sobrantes. Solo falta fusionar el PR para que la web muestre «Quitar este paso».
- **Pendiente de esta pantalla:** `tema:auditar` (escenario `produccion.orden-quitar-paso` ya registrado), `/chaos` y `guias:recorrer`: no se corrieron.
- **Convertir OP-1 y OP-4 en órdenes «de antes» (actividad 2):** ya pueden hacerse, sin pasos que no se hacen.
- **Sin «agregar paso»:** quitar es de un solo sentido. Si hace falta volver a agregar uno a una orden abierta, es una función hermana (hoy se anula la orden y se abre de nuevo).
- **Choca en texto con #1427** («Pendiente de registrar»): mismos 7 archivos (`RutaDeFases.tsx`, `orden-pagina-reglas*.ts`, guía y huella de la orden, `package.json`, `PRUEBAS`). Compatibles en lo funcional; el segundo en fusionar resuelve y vuelve a aceptar la huella (`guias:huella produccion.ordenes.numero`).
