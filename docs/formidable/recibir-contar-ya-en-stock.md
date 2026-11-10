# Formidable · Inventario ▸ Recibir ▸ Contar reabierto: «Ya en stock» en su categoría   (`/recibir/envio/[id]`)

- **Fecha / SHA:** 2026-11-07 · d3ceee99d · **Dispositivo que manda:** escritorio (Mac mini del almacén); 375 px se adapta
- **Pregunta que debería resolver:** «De este envío, ¿qué ya está guardado, de qué talla y color, y cómo lo corrijo?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Se lee el dato correcto en pocos segundos, pero la fila dice “en stock” cuando es “lo que entró con este envío”, y parece que se puede contar o escribir ahí.»

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: acertó «4 negras talla L» y eligió «Ajustar stock», seguridad 3/5, 6 dudas, 1 error probable (el «−» del contador) · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] la fila usa la misma cara y el mismo hover que un modelo que se cuenta (`rc-modelo`) y no elige nada; el contador sigue en otro modelo |
| 3 Simplicidad profunda | 8 | [Observado] plegada: «15 en stock · 2 tallas» y puntos de color; abierta, la matriz |
| 4 Lenguaje de tienda | 6 | [Medido] «15 en stock» suma lo recibido en ESTE envío (`yaEnStockDelEnvio`), no el stock de hoy; [Observado] «candado» leído como «bloqueado» |
| 5 Contenido primero | 7 | [Medido] la miniatura sale sin foto: lo recibido no trae el id de la prenda |
| 6 Lo difícil, a un toque | 7 | [Medido] «no se vuelve a contar» vive solo en el `title` del chip (hover) |
| 7 Perdonar antes que preguntar | 9 | [Medido] nada irreversible en la fila; «Corregir» abre su hoja de siempre |
| 8 Quitar antes de agregar | 8 | [Opinión] «Ya está en el stock de la sede» repite el chip |
| 9 De punta a punta | 7 | [Observado] la raya «–» no se sabe si es 0 o «no llegó»; la matriz vecina usa «—» para otra cosa. Claro, oscuro y 375 px revisados |
| **Leyes (promedio)** | **7,3** | ley 4 en 6 |
| **Oficio visual** | **7,5** | [Medido] 6 de 8 pasan; fallan: contraste de la raya 1,9:1 (exención sin sostén) y un radio casi repetido (8 vs 9 px de la celda del contador) |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe; ninguno toca dinero, stock, permisos ni SUNAT)
1. **Decir lo que es.** Antes: «15 en stock», «Ya está en el stock de la sede». Después: «15 entraron» en la fila y «🔒 15 ya entraron» en la cabecera; el pie, en sus dos ramas, «No se cuenta aquí: ya está en el stock. Para cambiar cuántas hay hoy, Ajustar stock» (o «Entró el 5 nov · Ana — Corregir 3»). Leyes 1, 4, 6. Verifica: ciego repetido, «seguridad» ≥ 4. Esfuerzo S.
2. **Que la matriz no invite a escribir.** Antes: número en una caja hundida casi igual a la celda editable, y «–» al 30 %. Después: el número sin caja (la ola de entrada pasa al número) y «0» en el tono tenue que pasa el piso. Leyes 1, 9; oficio. Verifica: medir contraste ≥ 4,5 y la duda (a) y (c) del ciego desaparecen. Esfuerzo S. Cambia algo que Felipe eligió en la maqueta.
3. **El aviso de arriba sin «candado».** Antes: «sale con candado dentro de su categoría». Después: «sale en su categoría, marcado “En stock”, y desde ahí se corrige». Ley 4. Esfuerzo S.

## Lo que sobra (ley 8)
- «Ya está en el stock de la sede» en el pie: lo dice el chip. Se reemplaza por lo que sirve (cambio 1).

## Lo que no pediste y importa más
- La cifra se lee como el stock de hoy y es lo que entró con el envío: si después se vendió una, no coincide con Existencias (también lo hacía la lista vieja: «12 ya en stock»). Es el cambio 1.

## Lista aparte (no se ejecuta)
- La fila comparte `rc-modelo` (hover y foco) con los modelos que se cuentan: una cara propia de «solo lectura» la separaría más.
- «Ajustar stock» lleva a Existencias buscando por el nombre (puede traer varias prendas); abrir la planilla de esa prenda y talla pide sumar su id a lo recibido.
- La miniatura sin foto: las fotos se piden por id de prenda y lo recibido trae solo la variante.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «se cuenta lo que llegó… y al final Cerrar el conteo»: coincide con la pantalla; la fila «En stock» no estaba abierta |
| Primer intento | sí, sin retroceder |
| Pasos | 3 toques (mínimo 2) |
| Dudas | 6: «candado», «15 en stock» con candado, las cajitas, «Ajustar stock» (¿solo Negro L?), el contador del centro, «Cerrar el conteo» |
| Palabras no entendidas | candado; y fuera de esta pieza: «Re stock», «Tallas para después», «Por terminar» |
| Errores evitables | 1 probable: el «−» del contador creyendo que corregía la blusa |
Sobre capturas, agente de la sesión; escéptico: H2 y H3 confirmados, H1 y H4 matizados, H5 casi refutado (la regla de radios es por pantalla), y el hallazgo nuevo de la cifra.

## Antes de decir «listo»
- Concurrencia: la fila solo lee; si otra persona vende una prenda mientras está abierta, la cifra no cambia (y no debería: es lo que entró), por eso importa el cambio 1.
- Caída externa: sin respuesta de la base la pantalla entera va a `/sin-base` (ADR-0450); la fila no pide nada por su cuenta.
- Persona sin contexto: ciega sobre capturas, real sin probar.

## El después (2026-11-07, los 3 cambios con el OK de Felipe)
- **Hechos:** «15 entraron» en la fila y «🔒 15 ya entraron» en la cabecera; pie «No se cuenta aquí: ya está en el stock. Para cambiar cuántas hay hoy: Ajustar stock» (con salida: «No se cuenta aquí: entró el … (quien). Si hubo un error: Corregir N»); número sin caja y «0» en taupe; el aviso de arriba dice «marcado “En stock”».
- **Medido:** el «0» pasa de 1,9:1 a 5,6:1; cifras de la fila 4,9:1; pie 5,4:1; números 16,4:1. Sin desborde a 375 px. Mismo ancho (1440) antes y después.
- **Ciega repetida** (mismas capturas al mismo ancho, misma tarea): lectura de 5 s ahora nombra «En stock»; 4 toques; el «4» con seguridad 5/5; desaparecen las dudas de las cajitas, la raya y el candado, y lee «No se cuenta aquí» para no usar el contador. **Siguen:** «Ajustar stock» habla de «cuántas hay hoy» y la pregunta era «cuántas entraron» (seguridad 3/5 en la acción); «15 contadas · 15 ya entraron» en la cabecera (la categoría cuenta lo ya entrado como contado, de antes); el contador del centro sigue en otro modelo y aún nombra el «−» como error probable; «Ajustar stock» se ve como texto.
- **Para Felipe (stock, no se toca sin su OK):** corregir lo que ENTRÓ en un envío ya cerrado hoy se hace ajustando el stock de hoy en Existencias, sin dejar rastro en el envío. ¿Debería existir «Corregir lo que entró» desde aquí (con su movimiento), o «Ajustar stock» basta?

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-07 | d3ceee99d | 7,3 | 7,5 | — (esperan el OK) |
| 2026-11-07 | (este commit) | 7,7 | 9 | los 3 |
