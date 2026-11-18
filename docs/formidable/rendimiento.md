# Formidable · Gestión ▸ Rendimiento   (`/rendimiento`)

- **Fecha / SHA:** 2026-11-04 · 00fc48523 · **Dispositivo que manda:** escritorio
- **Pregunta que debería resolver (1 frase):** ¿cómo va mi equipo y a quién reconozco o acompaño? · **Protagonista:** las personas
- **Veredicto en una línea:** se entiende en 5 segundos gracias a la frase de arriba, pero **la ley 3 está en 4**: en «Este mes», «En ritmo» dice poco a inicio de mes.

Datos inventados, en una base local aparte. Rama sin publicar. La migración `20261104213000` no estaba en producción (se pegó el 2026-11-05).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: leyó bien a quién acompañar, cambió la meta con 0 retrocesos y comprobó el cambio en la tabla · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] la frase responde arriba, pero la tabla empieza en y = 1079 y la fila de Micaela en 1502, con ventana de 900. [Observado] la ciega dudó si podía tocar la frase |
| 3 Simplicidad profunda | 4 | [Medido] «Todo el equipo va en ritmo» sobre − S/ 2,148 de S/ 7,104; alguien en 4,2 % contra 13,8 % dice «En ritmo». [Observado] «me extraña ver 6 % y "En ritmo" juntos» |
| 4 Lenguaje de tienda | 6 | [Observado] «el reparto se pasa por S/ 800»: «no sé si eso es malo». También dudó de «por horas», «pocas ventas» y «Ajustada», aunque las interpretó bien |
| 5 Contenido primero | 7 | [Observado] nombres, cifras y barras pesan más que el marco. [Opinión] a inicio de mes el gráfico ocupa mucho para pocos días |
| 6 Lo difícil, a un toque | 9 | [Medido] el «?» voltea la cifra con los números de ahora, con clic y con teclado |
| 7 Perdonar antes que preguntar | 8 | [Medido] la vista se deshace, y la meta muestra qué pasaría antes de guardar. Guardar deja historial y no tiene deshacer, a propósito |
| 8 Quitar antes de agregar | 6 | [Medido] «por horas» y «pocas ventas» se repiten en las 6 filas |
| 9 De punta a punta | 8 | [Medido] sin acceso, sin meta, sin horarios, sin lectura por persona y de 320 a 1920 px. [Medido] el eje de «Este mes» arranca en 29 y 30 sin decir que son de octubre |
| **Leyes (promedio)** | **6.9** | Con una ley en 4: estado «en deuda» |
| **Oficio visual** | **5** | [Medido] fallan 6 de 11 comprobaciones que aplican (lista abajo) |

**Oficio: lo que falló.**
- **De esta pantalla:** el gráfico alinea en 315 px contra 312 de la tabla y 313 de las cifras; títulos de 21 y 22 px; radios de 20 y 22 px; 7 radios reales; 14 tamaños de texto (el tope es opinión, y la cuenta incluye dorsos y texto para lector); huecos de 7,3 y 3,1 px a 1440, sin comprobar si son cifras que ruedan.
- **De piezas ya elegidas:** `Interruptor` de 23,3 px (le faltan 0,7) y los segmentos de 10,5 px. No se tocan desde aquí.
- **Falsos positivos del medidor:** el nombre de la fila de 21 px (abre la fila entera, de 68 a 72 px), el foco del buscador (su anillo va en el padre) y 764/767/770 (números alineados a la derecha).
- **Pasan:** contraste del texto (0 hallazgos en claro y oscuro), foco visible, tokens, teclado y orden de pantalla.
- **Sin medir:** blancos táctiles (el navegador de prueba no simuló dedo) y contraste de los controles.

## Los 3 cambios de mayor impacto
1. **Que «En ritmo» diga lo mismo todo el mes.**
   - **Antes:** fuera de Hoy, ±10 puntos del mes entero. El día 4 casi nadie puede estar «Por debajo», y un cambio de meta basta para pasar a «En ritmo».
   - **Después:** fuera de Hoy, ±10 % de lo que tocaba, con un piso para que una sola venta no decida. En estos datos quedarían unas 5 personas «Por debajo» y 1 «En ritmo», coherente con la tienda 30 % abajo.
   - **Ley:** 3. **Se verifica:** prueba con día 1, día 4 y día 25; «Hoy» sigue igual. **Esfuerzo:** S.
   - **Decide Felipe:** revierte parte de la decisión 1 del ADR-0610 («los 10 puntos no cambian»). Hay que elegir el piso. No toca dinero.
2. **Que el nombre en la frase lleve a la persona.**
   - **Antes:** «Conviene acompañar a Micaela» es texto, y su fila queda 1.7 pantallas abajo.
   - **Después:** tocar el nombre abre su fila y lleva la vista hasta ella.
   - **Ley:** 2. **Se verifica:** un toque hasta la meta, también con teclado. **Esfuerzo:** S–M: la frase pasa a piezas con el id de la persona, y cambian sus pruebas, la guía y su huella.
   - **Decide:** presentación, OK de Felipe.
3. **Decir el reparto en palabras de tienda.**
   - **Antes:** «el reparto se pasa por S/ 800», «Quedan S/ X sin repartir», «Asignado a las 6: … se pasa por…».
   - **Después:** «Las metas de las 6 personas suman S/ 800 más que la meta de la tienda», con sus variantes de «menos» y «cuadra», y el aviso en lo que de verdad requiere atención: lo que falta repartir.
   - **Ley:** 4. **Se verifica:** repetir la prueba ciega. **Esfuerzo:** S.
   - **Decide:** presentación, OK de Felipe. Qué tono lleva cada caso es [Opinión].

## Lo que sobra (ley 8)
- «por horas» bajo cada meta: lo dice la nota de abajo. Se quedan «partes iguales» y «Ajustada», que sí distinguen una fila.
- «pocas ventas» cuando lo dicen todas las filas: pasa a una nota. Con mezcla, sigue por fila (D-115 pide la muestra a la vista).

## Lo que no pediste y importa más
**Bajar la meta por vacaciones no hace lo que la encargada cree.** [Medido en código] `fn_metas_por_dia` multiplica todos los días del mes por el mismo factor, también los pasados y los de vacaciones. [Inferido, sin ejecutar] lo que tocaba le sigue creciendo mientras no está, y la frase podría decir «Conviene acompañar a…» a alguien de vacaciones. **El cambio 1 lo haría más visible.** Ruta sólida [Opinión]: que las horas programadas lean una ausencia aprobada como 0 h, y el reparto se recalcula solo. Cruza módulos y llega a producción: decide Felipe. [Sin verificar] el diccionario dice que `ausencias` casi no tiene filas, quizá no se use todavía.

## Lista aparte (no se ejecuta)
- Los motivos no incluyen salir de vacaciones: la ciega eligió «Vuelve de descanso» para quien se va. Un motivo nuevo pide migración, porque la lista también está cerrada en la base.
- El aviso «Nadie marcó entrada» recibe el filo rojo de «Sigue aquí» sin su pastilla, y se lee como error. Es de sistema (101 archivos usan ese campo guiado): ADR-0284.
- El eje de «Este mes» necesita un rótulo «oct» en 29 y 30. Esos días no cuentan en la cifra de arriba.
- Alinear el gráfico con la tabla y las cifras; unificar títulos y radios entre 20 y 22 px.

## Prueba ciega
Sonnet, navegador local a 1440 × 900, cuenta de encargada, datos inventados.

| Medida | Resultado |
|---|---|
| Lectura de 5 s | Pasa: «Micaela es quien necesita ayuda y lo siguiente es bajar a la lista de personas» |
| Primer intento | Pasa, salvo dos artefactos: Ctrl+A no selecciona en Mac, y la base de prueba no tenía la marca de entrada |
| Pasos | Unos 7 clics, 0 retrocesos |
| Dudas | Tocar o no la frase, si la fila abre algo, cuánto bajar la meta, qué significa «se pasa» |
| Palabras no entendidas | «el reparto se pasa»; interpretó bien «Ajustada», «por horas», «pocas ventas» y «Terminal de marcaje» |
| Errores evitables | Eligió «Vuelve de descanso» para quien sale de vacaciones |

Un modelo no es una persona en el piso: falta la pasada con encargadas reales.

## Veredicto del escéptico
Agente aparte, intentó refutar cada hallazgo. **Confirmados:** cambios 1, 2 y 3, motivos, aviso (de sistema) y eje. **Matizado:** lo que sobra. **Refutado:** mi ejemplo del día 25 para el cambio 1: 88 % de lo que tocaba da «Por debajo» con las dos reglas; el cambio importa a inicio de mes. **Refutado:** que una vacación baje sola la meta. **Falsos positivos:** los tres de oficio de arriba.

## Antes de decir «listo»
- **Concurrencia:** la función de la meta recibe `p_meta_esperada`, según el código. No probé a dos personas a la vez: es parte de la corrida de `/chaos`, pendiente.
- **Caída externa:** apartada la función nueva, la pantalla avisa y sigue con lo de la tienda y los rankings. No probé la base entera caída en esta pantalla.
- **Persona sin contexto:** ciega ✓, real sin probar.

## Tras los 3 cambios (2026-11-04, con el OK de Felipe)

- **Cambio 1, hecho:** en los mismos datos, 5 «Por debajo» y 1 «En ritmo», coherente con la tienda 30 % abajo [Medido]. El mínimo terminó siendo 3 días ya pasados del período, los mismos para todos: con días de meta por persona, la segunda ciega vio 6 % «En ritmo» junto a 12 % «Por debajo» [Observado]. Eso se corrigió después de esa prueba, y **la ciega no se repitió con el ajuste**. Con 5 de 6 nombres, la frase de arriba ya no señala a una persona.
- **Cambio 2, hecho:** el nombre abre la fila, la deja a la vista y le pasa el foco, también con teclado y a 375 px [Medido]. **La segunda ciega dudó y prefirió ir a la tabla** [Observado]: funciona, pero no se descubre sola.
- **Cambio 3, hecho:** la segunda ciega leyó y explicó bien «sumarían S/ 500 menos que la meta de la tienda: falta repartir» [Observado]. Dijo que no le aclara si está mal.

**Notas nuevas:** ley 3 de 4 a 7, ley 4 de 6 a 7. Las demás no cambian. Leyes 7.3; oficio 5 sin cambio.

**Hallazgos nuevos, sin ejecutar** [Observado, segunda ciega]:
- Al abrir una fila desde la tabla, el panel queda fuera de la vista.
- Al cancelar, la pantalla salta a otra zona.
- «Contra lo que tocaba»: dudó si «tocaba» era meta o venta esperada, aunque lo interpretó bien.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-04 | 00fc48523 | 6.9 | 5 | Primera medición |
| 2026-11-04 | sin commit, sobre 00fc48523 | 7.3 | 5 | Los 3 cambios |
