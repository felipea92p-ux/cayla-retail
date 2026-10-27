# Formidable · Producción ▸ Nueva orden, la pregunta «¿Ya tienen el molde?»   (`/produccion/ordenes?nueva=`)

- **Fecha / SHA:** 2026-10-27 · `a0eca4761` (rama `claude/sample-order-generation-d86d22`, PR #1389, sin fusionar) · **Dispositivo que manda:** escritorio; 375 px no se midió.
- **Pregunta que debería resolver:** «¿Qué voy a fabricar, cuántas y de qué tipo (lote o muestra)?» · **Protagonista:** el modelo y su tabla de cantidades.
- **Veredicto en una línea:** «Se entiende qué es y qué toca hacer, pero la pregunta nueva del molde pasa desapercibida: es una frase gris al lado, sin botones propios y con la respuesta ya marcada.»
- **Cómo se midió:** medidor del DOM a 1440 px sobre la pantalla real (banco propio con las migraciones de la rama, cuenta Líder del seed); una prueba ciega con 1 agente (Sonnet) que solo vio una captura, sin contexto; 1440 solo, 1024 y 375 sin medir. Sin escéptico (costo «medio»: 1 agente).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega: entendió que es un formulario para pedir al Taller que fabrique la prenda y que lo primero es escribir cantidades. No supo cómo averiguar si hay molde. |
| 2 Una pregunta, una respuesta | 5 | [Observado] ciega: «casi no se nota que me están haciendo una pregunta»; «Lote de producción» ya viene negro y se podría dejar sin saber que había que decidir. |
| 3 Simplicidad profunda | 6 | [Opinión] el historial se traduce en una frase («Ya hicieron la muestra… el molde está listo»), bien; la parte no resuelta es qué botón contesta. |
| 4 Lenguaje de tienda | 5 | [Observado] ciega: «molde» a medias; no entendió «La red no sugiere nada ahora», «Fases», «Admin · queda a tu nombre». |
| 5 Contenido primero | 7 | [Opinión] la tabla de cantidades manda y la ficha de la derecha resume. |
| 6 Lo difícil, a un toque | 7 | [Observado] «¿Por qué?» existe en el consejo de la red. |
| 7 Perdonar antes que preguntar | 5 | [Observado, /chaos] cambiar de sede con cantidades escritas las pierde sin aviso ni borrador; recargar al guardar reabre el formulario en blanco sin decir que ya hay una orden abierta. |
| 8 Quitar antes de agregar | 5 | [Observado] la tarjeta «La red no sugiere nada ahora» ocupa una fila y no dice qué hacer. |
| 9 De punta a punta | 6 | [Observado] el botón apagado no dice por qué; hay que mirar el «Falta:» de la derecha. |
| **Oficio visual** | 7 | [Medido] 1440 px: 3 blancos bajo 24 px (`Cambiar` 52×19,5, `Ver y cambiar` 110×20,3, un interruptor de 38×22: los tres vienen de antes de este cambio), 9 radios distintos, textos de 11 px (las versalitas del sistema), 0 huecos fuera de escala, 1 acción primaria, 0 rojos. El «poco contraste 1,0:1» del medidor es un falso positivo: el segmento «Lote de producción» tiene la píldora oscura como hermano absoluto, que el medidor no ve. |
| **Total (promedio de las 9 leyes)** | **5,8** | |

## Los 3 cambios de mayor impacto (esperan tu OK; nada se tocó)
1. **Que la pregunta sea una pregunta.** Antes: una frase gris al lado del interruptor con «Lote de producción» ya marcado. Después: una línea en grande, «¿Ya tienen el molde de esta prenda?», con dos botones, «Sí, ya tiene» (= Lote) y «No, falta hacerlo» (= Muestra), sin ninguno marcado cuando no se sabe (con molde deducido, queda marcado y la frase dice por qué). Arregla leyes 1, 2 y 4. Verifica: la ciega contesta la pregunta con el botón correcto a la primera. Ojo: sin ninguno marcado hay que decidir si «Abrir orden» espera la respuesta (toca la guía de foco); es presentación, no regla de negocio.
2. **Que la tarjeta del modelo diga «Ya hay 1 orden abierta de este modelo · Ver».** Antes: nada. Después: la tarjeta lo dice con los datos que la pantalla ya tiene (`abiertas`). Arregla el hallazgo #1 de /chaos y la ley 7. Verifica: recargar justo al guardar y reabrir muestra el aviso.
3. **Que cambiar de sede (o salir) con cantidades escritas pregunte «¿Salir sin guardar?»** o guarde el borrador. Antes: se pierde en silencio. Después: el aviso que ya usa el resto del formulario. Arregla el hallazgo #2 de /chaos y la ley 7.

**Lo que sobra (ley 8):** la tarjeta «La red no sugiere nada ahora» cuando no hay nada que sugerir, y «Admin · queda a tu nombre» (jerga). **Lo que no pediste y importa más:** la celda de cantidad convierte «1,5» o «1.5» en 15, «-5» en 5 y corta a 4 cifras sin avisar (hallazgo #3 de /chaos): se ve en la celda, pero nadie lo espera.

## Sin hacer
Prueba ciega con una colaboradora real; 1024 y 375 px; escéptico. La ciega vio una captura, no la pantalla viva.
