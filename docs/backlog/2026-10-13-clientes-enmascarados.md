## Clientes enmascarados para quien no es líder (2026-10-13, auditoría de 20 puntos, punto 18)
- [x] **Lista y ficha de Clientes**: DNI y celular completos solo para el líder (`contactoVisible`).
- [ ] **Lo que el enmascarado NO cubre (Felipe lo eligió sabiéndolo):** la caja de edición de la ficha muestra el número completo, y una cuenta con el módulo Clientas puede leer la tabla entera desde la consola del navegador. Si algún día se quiere cerrar de verdad: lectura solo por funciones con tope de filas (la opción A del informe), 2 a 3 días.
- [ ] **El botón «Exportar» se ve para quien no es Admin** y la base lo rechaza al pulsarlo: esconderlo (o explicarlo) para quien no puede usarlo.
- [ ] **`enmascararCelular` (Proveedores) toma cualquier número de 9 dígitos como celular:** un fijo «044 123456» sale «9•• ••• 456». Pieza compartida: arreglarla (que exija empezar con 9) en su propio cambio, mirando Proveedores, avisos del club y Clientes.
- [ ] **Decide Felipe: ¿unir fichas solo el líder?** Hoy cualquier cuenta con el módulo puede unir (no se deshace); por eso la comparación muestra los números completos.
