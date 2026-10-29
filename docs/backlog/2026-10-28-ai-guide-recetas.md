## «Pregúntale a CAYLA»: recetas (ADR-0536, «Recetas», Felipe 2026-10-28)

- [x] Diez recetas en `lib/asistente/recetas.ts` (vender, cambio, devolución, gasto e ingreso de caja, traslado, cliente nuevo, agregar color, agregar talla, cambiar precio), vigiladas por `recetas.test.ts`.
- [x] La IA elige la receta y copia los datos; un dato solo entra si la persona lo dijo (`datoDicho`). Solo se ofrecen las que la cuenta puede hacer entera (`pantallasAlcanzables`).
- [x] `tipo` tolerante (`tipoDe`) y un reintento rápido: la respuesta con receta ya no se pierde.
- [x] Medido: 9 de 10 tareas con receta llegan al paso que guarda (la décima depende del padrón de SUNAT, que en local no responde); 49 de 50 en las preguntas.
- [ ] Recetas para lo que falta: el apartado (su guía no tiene paso de confirmar), el cierre de caja (la hoja del cierre no tiene anclas), prenda nueva, conteo, etiquetas, liquidación y marca. Cada una pide primero las anclas que le faltan a su pantalla.
- [ ] «¿Qué se le entrega al cliente cuando aparta?» a veces va a Apartados en vez de a su regla (1 de 50).
