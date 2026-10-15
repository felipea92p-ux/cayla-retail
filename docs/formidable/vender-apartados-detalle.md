# Formidable · Ventas ▸ Apartados ▸ el detalle de un apartado   (`/vender/apartados` ▸ Historial ▸ tocar una fila)

- **Fecha / SHA:** 2026-10-15 · 8dbc630ce · **Dispositivo que manda:** escritorio (Mac mini); 375 px obligatorio (Apartados, PL-105)
- **Pregunta que debería resolver:** «¿Cuánto pagó este cliente, cuándo y cómo, hasta cuándo se le guarda, y qué hago ahora (abonar, aplazar, entregar)?» · **Protagonista:** el cliente y su dinero
- **Veredicto en una línea:** «Se entiende a la primera (la ciega lo resolvió en 6 toques, sin errores). Los 3 cambios están hechos (2026-10-15): ya no se traba al guardar, la fila dice «2 pagos» y tras un corte la hoja comprueba sola si quedó.»

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega (Sonnet, datos inventados): tarea completa al primer intento, 6 toques (mínimo 5), 0 errores evitables, 4 dudas · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] 1 acción principal por modo («Entregar» / «Aplazar al …») |
| 3 Simplicidad profunda | 8 | [Observado] la ciega leyó «pagó con S/50.00, vuelto S/30.00» y «aplazado 1 de 2 veces» sin ayuda |
| 4 Lenguaje de tienda | 7 | [Observado] duda: la fila dice «1 abono» y el cliente pagó dos veces (adelanto + abono); «Eres admin…» es del combo Responsable |
| 5 Contenido primero | 8 | [Opinión] cliente, dinero y prendas arriba; el historial es la historia del dinero |
| 6 Lo difícil, a un toque | 7 | [Observado] la ciega dudó si +3 cuenta desde hoy o desde el vencimiento; lo dedujo del resultado |
| 7 Perdonar antes que preguntar | 7 | [Opinión] aplazar es definitivo (cuenta para el tope) y se confirma con su botón; no hay «deshacer aplazamiento» |
| 8 Quitar antes de agregar | 8 | [Opinión] nada sobra a la vista |
| 9 De punta a punta | 5 | [Observado] la hoja queda trabada tras guardar (× apagada, Escape no cierra); [Medido] foco a BODY al cerrar; botones del pie de 39 px a 375 px |
| **Leyes (promedio)** | **7,2** | ley 9 en 5 |
| **Oficio visual** | **5** | [Medido, solo la hoja] pasan contraste, alineación, alturas, rojos (0) y Tab atrapado; fallan blancos < 44 px a 375 (pie de 39 px y la × de 28 px: piezas del sistema), fechas de 11,5 px en los atajos, un hueco de 32,8 px, 5 radios y el foco al cerrar |

## Los 3 cambios de mayor impacto
1. **La hoja se destraba sola al guardar y el foco vuelve a la fila.** Antes: tras aplazar o abonar, la × queda apagada y Escape no cierra; al cerrar, el foco cae al fondo. Después: al volver al detalle se limpia «guardando» y el foco regresa al nombre de la fila. Ley 9. Verifica: aplazar → Escape cierra; Tab tras cerrar sigue en la fila. Esfuerzo S. Presentación.
2. **Lo que se lee no miente.** Antes: la fila dice «1 abono» con dos pagos, y el aviso del abono dice «Sale su boleta de anticipo» en un apartado que no emite boleta (ADR-0399). Después: «2 pagos» en la fila, y el aviso sin la boleta cuando es constancia. Leyes 4 y 1. Verifica: la ciega no vuelve a dudar en «1 abono». Esfuerzo S. Presentación.
3. **Tras una respuesta perdida, la hoja comprueba sola si quedó.** Antes: «revisa si ya aparece registrado», pero la hoja muestra el historial viejo. Después: relee y, si el vencimiento ya es la fecha elegida, lo da por hecho; si no, deja reintentar la misma fecha. Ley 9. Verifica: RS-03 con la misma semilla. Esfuerzo S. Presentación (la base ya resiste).

## Lo que sobra (ley 8)
Nada a la vista.

## Lo que no pediste y importa más
«2,5» en cualquier monto del ERP se guarda como 25 (`CampoMonto`, 29 lugares, también el cobro de Vender). Es dinero y es transversal: tu decisión.

## Lista aparte (no se ejecuta)
- Botones del pie a 44 px y × de 28 px en el celular: son piezas del sistema (`pie-acciones`, `<Modal>`); se arreglan una vez para todo el ERP.
- Fechas de 11,5 px bajo «+3 días» / «+7 días»: subir a 12 px.
- «+3 días» puede leerse «desde hoy»: decir «3 días más que el jue, 22 oct».

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | Pasa: «esta pantalla sirve para separar una prenda; Norma ya separó, busco su apartado» y fue a Historial |
| Primer intento | Sí, sin retroceder |
| Pasos | 6 (mínimo 5) |
| Dudas | 4: «1 abono» frente a dos pagos; Apartar/Entregar/Historial para algo ya hecho; +3 desde cuándo; «Falta: Hasta cuándo» |
| Palabras no entendidas | 0 bloqueantes (interpretó bien «aplazar», «abono», «adelanto» y «estante») |
| Errores evitables | 0 (1 no evitable: Escape no cerró la hoja → cambio 1) |

## Recalificación tras los 3 cambios (2026-10-15, OK de Felipe)
Repetidos los ataques con la semilla 1415 en el navegador sin ventana (`/chaos`): tras aplazar o abonar la × sigue activa, Escape cierra y el foco
vuelve a la fila [Medido]; la fila dice «2 pagos» y el aviso del abono ya no nombra una boleta en los apartados nuevos [Medido]; con la respuesta
perdida la hoja relee y dice «Sí quedó», y si el pedido no llegó explica que se puede reintentar la misma fecha [Medido]. Pruebas:
`lib/apartado-detalle-reglas.test.ts` (`hojaDetalle`, `aplazamientoTrasCorte`) y `lib/separaciones-reglas.test.ts` (`textoPagosDeFila`, `avisoDeAbono`).
Leyes: 4 → 8 y 9 → 7 (quedan los botones del sistema a 375 px). Oficio: el foco al cerrar pasa → 6. **Falta repetir la ciega sobre la pantalla nueva.**

## Antes de decir «listo»
- **Concurrencia:** dos abonos a la vez que juntos pasan el saldo: el segundo se rechaza. Dos personas aplazando a la vez: se gastan los 2 aplazamientos (por diseño, ADR-0414).
- **Caída externa:** sin red, el aviso dice que no se sabe si se guardó y el reintento no cuenta dos veces; la hoja todavía no relee (cambio 3).
- **Persona sin contexto:** la ciega lo resolvió; real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-15 | 8dbc630ce | 7,2 | 5 | — |
| 2026-10-15 | (este commit) | 7,6 (provisional) | 6 | los 3 |
