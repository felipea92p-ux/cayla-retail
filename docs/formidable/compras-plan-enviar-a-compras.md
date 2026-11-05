# Formidable · Compras ▸ Plan de campaña ▸ paso 3 «Enviar a Compras» y Órdenes ▸ «Pendientes de campaña»   (`/compras/plan`, `/compras/ordenes`)

- **Fecha / SHA:** 2026-10-26 · 42dbad976 (+ el arreglo del botón a 375 px, en el commit siguiente) · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver:** «¿Ya mandé lo que armé a Compras, y quién lo pide de verdad?» · **Protagonista:** el pedido por proveedor (prendas, costo, fecha)
- **Veredicto en una línea:** «Se entiende en 5 s qué es y qué sigue; le faltan palabras más de tienda en «Rectificar» y en lo de Finanzas, y una forma visible de anular una orden ya pedida.»
- **Costo (Felipe eligió «medio»):** un solo agente ciego, **sin escéptico** y **sin colaboradora real**; medición propia a 1440, 1024 y 375 px.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega (Sonnet, sobre 6 capturas, datos inventados): lectura de 5 s correcta («hoja de tres pestañas, estoy en la tercera; sigue enviar»), supo mandar, ver lo pendiente y crear la orden; **12 dudas**: «Enviar suena a pedir», «Rectificar el envío ¿a todos o a uno?», «Cancelar ¿cancela lo enviado o cierra?», «anula la orden aquí… pero no veo un botón Anular» · real: sin probar (tope 8) |
| 2 Una pregunta, una respuesta | 7 | [Medido] una sola acción primaria en cada hoja (`.btn-primario` = 1); el pie del paso 3 junta cuatro botones (Rectificar, Ver en Compras, Cancelar, Enviar) |
| 3 Simplicidad profunda | 7 | [Opinión] «No se envía todavía» traduce lo complejo (sin marca, sin proveedor, Taller, modelos nuevos); «segunda tanda» y «Cambió el plan» piden pensar |
| 4 Lenguaje de tienda | 6 | [Observado] «Pendiente de campaña · falta confirmar», «Rectificar» y «falta pedir / pedido sin pagar» (palabras de Finanzas) no se entendieron del todo |
| 5 Contenido primero | 8 | [Opinión] la tabla por proveedor (prendas, costo, cuándo) manda; el marco se retira |
| 6 Lo difícil, a un toque | 7 | [Opinión] «No se envía todavía» está siempre a la vista (se lee bien), pero el «¿por qué?» de «segunda tanda» y «Cambió el plan» solo está en un `title` |
| 7 Perdonar antes que preguntar | 8 | [Medido] enviar y rectificar son reversibles; lo irreversible (crear la orden) tiene su hoja de confirmación con el monto y a nombre de quién |
| 8 Quitar antes de agregar | 6 | [Opinión] la nota de Finanzas al pie del paso 3 no ayuda a decidir ahí; el aviso «Eres admin…» es del sistema |
| 9 De punta a punta | 7 | [Medido] vacíos, error de lectura, sin-soporte, plazo vencido, paso 2 por revisar, 375 px sin desborde; **hallazgo arreglado:** a 375 px el botón principal se cortaba («como pendientes de car») → ahora «Enviar a Compras». Blancos táctiles de 35–36 px bajo 44 en piezas del sistema (Boton, segmento) |
| **Leyes (promedio)** | **6,9 (provisional)** | ninguna ley bajo 5 |
| **Oficio visual** | **7 (provisional)** | [Medido] 4 de 8 comprobaciones fallan a 1440 px: texto chico (10–11 px, de piezas del sistema: «del plan» del encabezado y las etiquetas del segmento), bordes casi alineados (1–2 px, la cabecera «¿Cuándo piensas pedirlo?» contra el segmento), 7 radios distintos (piezas del sistema) y 4 «contrastes» que son el pulgar del segmento y de la pestaña activa (falsos positivos: `tema:auditar` mide 0 en oscuro y en claro). 0 blancos bajo 24 px; 1 acción primaria; 0 rojos; sin desborde a 1440, 1024 ni 375 |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe: son de lenguaje)
1. **«Rectificar» → «Retirar de Compras»** (en el Plan: «Rectificar el envío» → «Retirar el envío»; en Compras: «Rectificar» → «Retirar»). Y en la tarjeta de un pedido ya pedido, además de «Ver la orden», un botón «Anular la orden». Ley 1 y 4. Se verifica repitiendo la ciega: nadie duda entre «corregir» y «echar para atrás», y encuentra cómo deshacer una orden. S. Decide Felipe (la maqueta decía «Rectificar»).
2. **Sacar del paso 3 la nota «En Finanzas, lo pendiente sigue contando como «falta pedir»…»** y dejarla, en palabras de tienda, solo en la hoja de «Confirmar y pedir», donde sí cambia algo («Esto pasa de «por pedir» a «pedido, falta pagar» en Finanzas»). Ley 8 y 4. S. Decide Felipe.
3. **«Enviar como pendientes de campaña» → «Dejar pendiente en Compras»** (o dejar el botón y sumarle la frase corta «No pide nada» al lado). Ley 1: la palabra «Enviar» hizo dudar si pide al proveedor. S. Decide Felipe (es su frase de la maqueta).

## Lo que sobra (ley 8)
La nota de Finanzas del paso 3 (ver arriba); el aviso «Eres admin. No necesitas autorización…» a cada hoja (es del sistema: no se toca aquí).

## Lo que no pediste y importa más
**Lo del Taller no llega a ningún lado.** La hoja lo dice («se pide en Producción ▸ Órdenes»), pero nada lo crea allá: quien lea «Enviado a Compras» puede creer que ya mandó TODO. Conectarlo con Producción es de otro módulo y es tuyo decidirlo.

## Lista aparte (no se ejecuta)
- Blancos táctiles de 35–36 px en celular (Boton y segmento del sistema, no de esta pantalla).
- La cabecera «¿Cuándo piensas pedirlo?» y el segmento difieren 1–2 px a la izquierda.
- Que el chip «2 pendientes en Compras» de la lista sea un enlace a Compras (hoy es solo un dato).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | coincide en lo esencial |
| Primer intento | completó 3 de las 4 preguntas; «echar para atrás» lo resuelve con «Rectificar» pero ninguna captura muestra qué pasa al tocarlo |
| Pasos | 11 elementos distintos que tocaría |
| Dudas | 12 (arriba) |
| Palabras no entendidas | «Pendiente de campaña», «Pedido sin pagar», «Rectificar», «Llega tarde» (la interpretó bien) |
| Errores evitables | 0 (esperaba que «Enviar» y «Confirmar y pedir» avisaran al proveedor: no lo hacen; la hoja lo dice) |

## Antes de decir «listo»
- **Concurrencia:** cuatro que envían, cuatro que confirman y una que confirma contra una que rectifica, con sesiones reales en la base (`pruebas:plan-compra-envio`, K1–K3). · **Caída externa:** si la base no responde, la pestaña y la sección de Compras lo dicen (nunca «no hay nada pendiente»), y un reintento tras un corte devuelve lo mismo. · **Persona sin contexto:** ciega ✓ sobre capturas; real, sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-26 | 42dbad976 | 6,9 (provisional) | 7 (provisional) | ninguno de los 3 (esperan OK); arreglado el botón cortado a 375 px |
