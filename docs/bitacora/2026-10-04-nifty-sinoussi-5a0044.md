## 2026-10-04 (Actividad: regularizar una venta sin registrar se anota en Existencias, no en Recibir — ADR-0207 act. 2026-10-04)
Qué hice: la lista «Ventas sin registrar» se mudó de Recibir a Existencias (ADR-0330), pero la línea que Actividad escribe al regularizar
una prenda seguía diciendo «Recibir». Quien filtraba por Existencias no la veía. Una migración nueva (`20261004233000`) cambia solo esa
palabra en `fn_actividad_regularizar`; la frase, la sede y la firma son las mismas. El cuerpo que copié es el vivo: su huella es idéntica
en el repo y en producción (solo lectura). La prueba `actividad_gestion.mjs` pasó de «una línea en Recibir» a «una línea en Existencias y
ninguna en Recibir»; contra la función vieja el chequeo nuevo falla (`modulo: recibir`), contra la nueva pasa, y la migración se puede
pegar dos veces. Todo en una base clonada aparte, la compartida no se tocó. **Felipe la pegó en producción el mismo 2026-10-04**; verificada
después en solo lectura (la función dice `existencias`, 0 líneas `prenda_regularizada` y 0 `recibir`, 267 prendas aún pendientes).
Por qué así: no se reetiquetan filas viejas porque la actividad es de solo agregar y no hay ninguna que reetiquetar (producción, 4-oct:
0 líneas `prenda_regularizada`; 267 prendas pendientes, ninguna regularizada). Preguntarle a Felipe por el historial habría sido una
pregunta sin respuesta que cambie algo. Lo que sí tiene fecha: pegarla antes de la primera regularización real, porque cada línea que
nazca como `recibir` ya no se corrige sin apagar el candado de inmutabilidad.
Felipe se lleva: la migración llegó a producción antes de la primera regularización, así que ninguna línea nació como `recibir` y el
historial no necesitó tocarse. El filtro «Recibir» de Actividad queda sin
nada nuevo (la actividad de Recibir mercadería nunca se construyó: 0 líneas `recibir` en producción); se retira cuando se decida.
