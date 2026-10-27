## «Pregúntale a CAYLA» acompaña una tarea (ADR-0536, «Acompañar una tarea», Felipe 2026-10-27)

- [x] Faltas de ortografía en la búsqueda local (`preseleccion.ts`: cómo suena y distancia de edición), 10 casos nuevos en la evaluación (50).
- [x] La IA arma la tarea con los datos de la persona (`pasos`), y el servidor la revisa y la completa (`lib/asistente/tarea.ts`).
- [x] Anclas en la hoja de cobro (`vender.cobro-*`) y en «quién atiende» (`vender.responsable`), con sus pasos opcionales en la guía de Vender.
- [x] El Acompañante: anillo + barra GPS abajo, pasa solo, nunca hace un clic ni guarda; probado a 1440 y 375 px hasta confirmar el cobro.
- [x] Sin pensamiento en la llamada de la IA: de ~7,5 s a ~5 s (fallaba por el tope de 8 s).
- [ ] Cierres fijos para Cambios, Devoluciones y Traslados (hoy solo Vender tiene `CIERRES`): mirar en el registro qué tareas piden de verdad.
- [ ] La prueba con una colaboradora real, con la sede del piloto encendida en producción.
- [ ] En local no hay asistencia de Dynamic (`public.marcajes`): Cobrar sale apagado en la terminal y no se puede recorrer una venta sin crearla un momento. Un seed local de asistencia lo arreglaría para todas las sesiones.
