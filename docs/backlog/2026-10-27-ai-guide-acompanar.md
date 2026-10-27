## «Pregúntale a CAYLA» acompaña una tarea (ADR-0536, «Acompañar una tarea», Felipe 2026-10-27)

- [x] Faltas de ortografía en la búsqueda local (`preseleccion.ts`: cómo suena y distancia de edición), 10 casos nuevos en la evaluación (50).
- [x] La IA arma la tarea con los datos de la persona (`pasos`), y el servidor la revisa y la completa (`lib/asistente/tarea.ts`).
- [x] Anclas en la hoja de cobro (`vender.cobro-*`) y en «quién atiende» (`vender.responsable`), con sus pasos opcionales en la guía de Vender.
- [x] El Acompañante: anillo + barra GPS abajo, pasa solo, nunca hace un clic ni guarda; probado a 1440 y 375 px hasta confirmar el cobro.
- [x] Sin pensamiento en la llamada de la IA: de ~7,5 s a ~5 s (fallaba por el tope de 8 s).
- [x] Evaluación con la IA: 49 de 50; la que fallaba (mandar ropa a Trujillo → Mis compras) se arregló con una línea en las instrucciones.
- [x] **Cualquier tarea** (Felipe 2026-10-27): pantallas que se abren desde otra, puentes (`lib/asistente/puentes.ts`), toda tarea termina en el paso que guarda; «agregar un color a la blusa catalina siete» probada a 1440 y 375 hasta «Revisar y guardar».
- [x] **El resaltado rediseñado**: velo suave con recorte, halo, onda y una etiqueta con el número del paso pegada a la pieza (`acompanante.css`).
- [ ] Puentes para más pantallas con id: hoy Editar producto, el pase de un traslado, un proveedor, un conteo, una orden de producción y una campaña. Las de Órdenes de compra piden otro módulo y quedan fuera.
- [ ] Cierres fijos para Cambios, Devoluciones y Traslados (hoy solo Vender tiene `CIERRES`). Medido el 2026-10-27: el cambio y el traslado llegan solos a confirmar; **la devolución se corta en 2 pasos** («Busca la venta», «Toca Devolver») sin llegar a confirmar.
- [ ] La prueba con una colaboradora real, con la sede del piloto encendida en producción.
- [ ] En local no hay asistencia de Dynamic (`public.marcajes`): Cobrar sale apagado en la terminal y no se puede recorrer una venta sin crearla un momento. Un seed local de asistencia lo arreglaría para todas las sesiones.
