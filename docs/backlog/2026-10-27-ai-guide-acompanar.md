## «Pregúntale a CAYLA» acompaña una tarea (ADR-0536, «Acompañar una tarea», Felipe 2026-10-27)

- [x] Faltas de ortografía en la búsqueda local (`preseleccion.ts`: cómo suena y distancia de edición), 10 casos nuevos en la evaluación (50).
- [x] La IA arma la tarea con los datos de la persona (`pasos`), y el servidor la revisa y la completa (`lib/asistente/tarea.ts`).
- [x] Anclas en la hoja de cobro (`vender.cobro-*`) y en «quién atiende» (`vender.responsable`), con sus pasos opcionales en la guía de Vender.
- [x] El Acompañante: anillo + barra GPS abajo, pasa solo, nunca hace un clic ni guarda; probado a 1440 y 375 px hasta confirmar el cobro.
- [x] Sin pensamiento en la llamada de la IA: de ~7,5 s a ~5 s (fallaba por el tope de 8 s).
- [x] Evaluación con la IA: 49 de 50; la que fallaba (mandar ropa a Trujillo → Mis compras) se arregló con una línea en las instrucciones.
- [x] **Cualquier tarea** (Felipe 2026-10-27): pantallas que se abren desde otra, puentes (`lib/asistente/puentes.ts`), toda tarea termina en el paso que guarda; «agregar un color a la blusa catalina siete» probada a 1440 y 375 hasta «Revisar y guardar».
- [x] **El resaltado rediseñado**: velo suave con recorte, halo, onda y una etiqueta con el número del paso pegada a la pieza (`acompanante.css`).
- [x] **Evaluación de tareas en el navegador** (`pnpm --filter web asistente:tareas`, `tareas.json`, 22 pedidos): de 27 % a 45–73 % (las tres últimas corridas, mismo código, varían por la IA) con arreglos generales (lo que abre cada paso, los «Continuar» de en medio, tarea mínima, cierre acotado, tope que no corta el cierre, buscador sin color ni talla, combos, recalcular el camino).
- [x] **Recalcular si la persona se desvía** (cerrar una hoja, un toque que no abrió nada), probado junto con recargar, irse y volver con «Llévame».
- [x] **Devolución**: anclas y pasos del flujo hasta «Registrar devolución»; **Caja**: el pie de las hojas de gasto e ingreso.
- [ ] **Felipe: ¿recetas fijas para las tareas más comunes?** Con el mismo código, la evaluación da entre 45 % y 73 % porque la IA arma pasos distintos para la misma pregunta. Una receta escrita a mano por tarea (vender, agregar color o talla, cambio, devolución, gasto, ingreso, traslado, cliente, cierre de caja…) con la IA eligiendo solo cuál y los datos lo haría repetible; cuesta escribirlas y mantenerlas al día con las guías (una prueba como la de los puentes lo vigilaría).
- [ ] Las tareas que todavía no llegan: gasto (la IA mezcla la hoja rápida con el formulario largo), devolución y campaña (pasos que la IA salta), prenda nueva y conteo (el recorredor no llena esos formularios), etiquetas (la IA elige un paso del Historial). Correr `asistente:tareas` antes de tocar las instrucciones o el Acompañante.
- [ ] Puentes para más pantallas con id: hoy Editar producto, el pase de un traslado, un proveedor, un conteo, una orden de producción y una campaña. Las de Órdenes de compra piden otro módulo y quedan fuera.
- [ ] Cierres fijos para Cambios, Devoluciones y Traslados (hoy solo Vender tiene `CIERRES`). Medido el 2026-10-27: el cambio y el traslado llegan solos a confirmar; **la devolución se corta en 2 pasos** («Busca la venta», «Toca Devolver») sin llegar a confirmar.
- [ ] La prueba con una colaboradora real, con la sede del piloto encendida en producción.
- [ ] En local no hay asistencia de Dynamic (`public.marcajes`): Cobrar sale apagado en la terminal y no se puede recorrer una venta sin crearla un momento. Un seed local de asistencia lo arreglaría para todas las sesiones.
