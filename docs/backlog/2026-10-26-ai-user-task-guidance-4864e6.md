## «Pregúntale a CAYLA»: el asistente con IA que guía (ADR-0529, 11 actividades aprobadas por Felipe el 2026-10-26)

- [x] 1 · El cajón sin IA: botón «Preguntar» en la cabecera, «?» y ⌘/, búsqueda local entre las guías del menú de la cuenta.
- [x] 2 · La IA responde (Claude Haiku 5.5, `/api/asistente`): elige guía y paso de una lista cerrada; sin clave, sin respuesta en 8 s o con una respuesta fuera de la lista, búsqueda sin IA. ~2 s y ~US$0,0013 por pregunta (medido en local).
- [x] 3 · Recorridos: «Muéstrame» arranca en el paso que responde, con lo que necesita abierto, y pasa solo a la pantalla del siguiente tramo (hasta 3).
- [x] 4 · Sin acceso: si responde una pantalla de un módulo que el rol no tiene, el sistema dice dónde se hace y «pídeselo a tu líder de equipo», sin los pasos.
- [x] 5 · Cada pregunta queda anotada (`retail.asistente_preguntas`, migración `20261026235000`), «¿Te sirvió? Sí / No» y «¿Qué buscabas?», y el tope de US$30 al mes (`fn_asistente_gasto_del_mes`). Aplicada solo en la base local.
- [ ] **Pegar `20261026235000_asistente_preguntas.sql` en producción** (necesita el OK de Felipe; una sola parte, tabla nueva sin políticas y tres funciones). Mientras no esté, el asistente responde igual pero no anota nada (`preguntaId: null`, sin «¿Te sirvió?») ni cuenta el tope del mes: queda solo el límite de gasto de la consola de Anthropic.
- [ ] Refrescar el volcado de producción (`datos:generar:produccion`) cuando la migración esté aplicada: `pnpm datos:comparar` marca las tres funciones hasta entonces.
- [ ] 6 · Rellenar con candados (`data-asistente="rellenable"`, «Lo escribió CAYLA»).
- [ ] 7 · Reglas de tienda y catálogo de errores (cada regla con el OK de Felipe).
- [ ] 8 · Interruptor por sede en Configuración (`retail.asistente_sedes`).
- [ ] 9 · Pantalla «Lo que pregunta tu equipo» (módulo nuevo, solo líder).
- [ ] 10 · El informe del lunes (vigía de GitHub Actions + Sonnet 5.5).
- [ ] 11 · Evaluación de 40 preguntas, `/guia`, `/focus`, `/formidable`, `/chaos`, modo oscuro y 375 px, y el PR con `/abrir-pr`.
- [ ] Ver en producción que un tramo encuentra su pieza a tiempo (en desarrollo, Productos tardó más de 8 s en cargar).
- [ ] **Felipe:** ¿«¿Cómo anulo una boleta?» debe llevar a Devoluciones («Anular una venta de hoy») o a Comprobantes? Hoy la IA elige Devoluciones.
- [ ] En una terminal la pregunta queda sin persona: el cajón todavía no manda el responsable del combo (`x-responsable`).
