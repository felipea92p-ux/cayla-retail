# Formidable · Catálogo ▸ Editar producto ▸ «Precio por tienda» y su hoja   (`/productos/[id]/editar`)

- **Fecha / SHA:** 2026-10-10 · cc3ec4bd (más la corrección del motivo, sin commit al medir)   · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «¿A qué precio se vende esta prenda en cada tienda, y cómo le pongo uno distinto a la mía?» · **Protagonista:** el precio de la tienda
- **Veredicto en una línea:** «Se entiende al primer vistazo y la tarea se completa; la prueba ciega destapó un error real (corregir solo el motivo no guardaba), ya arreglado, y quedan tres ajustes de presentación.»
- **Escala:** 1 agente (ciego, Opus; el de Sonnet lo frenó el falso positivo `reasoning_extraction` del piloto). Medición y escepticismo los hice yo contra el DOM y el código; cada hallazgo dice su veredicto.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego: lectura de 5 s correcta, tarea completada; no al primer intento (retrocedió por el error del motivo) · real: sin probar |
| 2 Una pregunta, una respuesta | 9 | [Observado] fue directo al enlace «Precio distinto…»; la hoja tiene una acción principal |
| 3 Simplicidad profunda | 8 | [Opinión] una fila por tienda con su precio y la insignia; la diferencia con el general se dice en palabras («S/ 5.00 más que el general (+6 %)») |
| 4 Lenguaje de tienda | 7 | [Observado] dudó con «general» y con «Precio propio» (los interpretó bien, sin bloquearse) |
| 5 Contenido primero | 8 | [Medido] el precio es lo más grande de la fila (14 px mono, semibold); tienda, insignia y detalle detrás |
| 6 Lo difícil, a un toque | 8 | [Opinión] el motivo y quién lo puso están en la fila; el historial completo, en la página Historial |
| 7 Perdonar antes que preguntar | 9 | [Opinión] cambiar es directo; quitar pide quién (es dinero); un precio raro avisa sin bloquear |
| 8 Quitar antes de agregar | 7 | [Opinión] la línea de detalle (general · desde · quién · «motivo») es larga y en 375 px ocupa dos líneas |
| 9 De punta a punta | 6 | [Observado] «Cambiar» solo el motivo decía «guardado» sin guardar (CORREGIDO); [Medido] 3 controles de 15,6 px |
| **Leyes (promedio)** | **7,7** | ley 1 sin pasada real |
| **Oficio visual** | **8** | [Medido] 6 de 8: fallan blancos (3 enlaces de 15,6 px, bajo el mínimo de 24) y contraste de la línea de detalle (4,45:1, bajo 4,5). Alineación, espaciado, alturas, radios, rojos y tamaños pasan, a 1440, 1024 y 375 px |

Aparte (piezas del sistema, no bajan la nota): en la hoja, «Sigue aquí» de 10,5 px y desvíos de 1–2 px de la etiqueta oculta de `CampoGuiado`; los tienen todas las hojas con guía de foco.

## Ya corregido en esta corrida (era un error, no presentación)
- **Corregir solo el motivo no se guardaba** — CONFIRMADO [Medido]: `poner_precio_sede` con el mismo precio y otro motivo devolvía 0 y la hoja decía «guardado». `20261010100600` (en producción, versión `20261010130947`): un motivo distinto es un cambio (archiva y crea otra fila); la hoja dice «No había nada que cambiar» si de verdad no cambió nada. Prueba en `pruebas:precio-sede`; verificado en el navegador con el caso del ciego.

## Los 3 cambios de mayor impacto (esperan tu OK; son presentación)
1. **«Cambiar», «Quitar» y «Precio distinto…» como botones de verdad.** Antes: enlaces de 15,6 px, y «Quitar» sin el rojo de lo peligroso. Después: `btn-sutil` de 32 px para Cambiar y el enlace de arriba, y `btn-peligro` chico para Quitar (pieza única «Lo peligroso», ADR-0358). Ley 9 + oficio. Verifica: `medir-oficio` sin blancos bajo 24. Esfuerzo S. Decide: Felipe (presentación).
2. **El enlace nombra la tienda cuando hay una sola libre.** Antes: «Precio distinto en otra sede», con la cabecera diciendo «TIENDA LIMA» y Lima como la única libre: el ciego dudó si servía para Lima. Después: «Precio distinto en Tienda Lima» si queda una; «…en otra tienda» si quedan varias. Ley 1 y 4. Verifica: repetir la prueba ciega. Esfuerzo S. Decide: Felipe.
3. **Línea de detalle legible y más corta.** Antes: «general S/ 79.90 · desde hoy · Felipe Alvarez · «motivo»» a 4,45:1. Después: «Las demás tiendas: S/ 79.90 · desde hoy» arriba y el motivo solo debajo, con `text-tinta/70` (≥ 4,5:1). Ley 4 y 8 + oficio. Verifica: contraste medido y la palabra «general» fuera. Esfuerzo S. Decide: Felipe.

## Lo que sobra (ley 8)
- El nombre de quien lo puso en la fila: ya está en el Historial de la prenda y en Actividad. Se puede quitar de la fila sin perder nada.

## Lo que no pediste y importa más
- **La pasada con una colaboradora real de AQP (la cuenta «Almacén Arequipa»)**: es quien lo va a usar, y hasta entonces la ley 1 no pasa de 8.

## Lista aparte (no se ejecuta)
- MATIZADO: el ejemplo de «Por qué» («Ej. En Lima se vende a más») era igual a lo que el ciego escribió y creyó que no había escrito nada. En la pantalla el ejemplo es gris y desaparece al escribir; el ciego leía el DOM, no el color. Riesgo bajo; si se repite con una persona, cambiar el ejemplo.
- REFUTADO: «la ficha tardó más de 8 s al recargar»: es el servidor de desarrollo compilando, no el bloque.

## Prueba ciega
| Lectura de 5 s | Primer intento | Pasos | Dudas | Palabras no entendidas | Errores |
|---|---|---|---|---|---|
| Correcta («precio por tienda con el enlace “Precio distinto en otra sede”») | No (retrocedió por el motivo) | 8 (mínimo 4) | 4: «Por qué» ¿obligatorio?; ejemplo igual al texto; «otra sede» con Lima en la cabecera; «guardado» sin cambio | «general», «Precio propio» (sin bloquear) | 2: motivo duplicado por segundo clic; «Cambiar» sin efecto (era el error, corregido) |

## Antes de decir «listo»
- Concurrencia: dos precios a la vez para la misma prenda y tienda se ponen en fila (bloqueo de la prenda); queda el último, sin duplicados (`pruebas:precio-sede` y el ataque de caos del 2026-10-09).
- Caída externa: si `fn_precios_sede_producto` falla, el bloque no se dibuja y la ficha sigue; si `poner_precio_sede` falla, la hoja muestra el error y no cierra.
- Persona sin contexto: ciega ✓ (con el error, ya corregido) · real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | cc3ec4bd | 7,7 | 8 | error del motivo corregido; los 3 de presentación esperan OK |
