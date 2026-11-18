# Formidable · «Pregúntale a CAYLA»: Gestión ▸ Preguntas del equipo y el cajón del asistente   (`/gestion/preguntas`, botón «Preguntar»)

- **Fecha / SHA:** 2026-10-27 · `cd71f3a01` (rama `claude/ai-guide-c654db`) · **Dispositivo que manda:** escritorio (Mac mini); el cajón también se usa en la tienda
- **Pregunta que debería resolver:** Preguntas del equipo → «¿qué no encuentra mi equipo y qué conviene mejorar?»; el cajón → «¿dónde se hace esto?» · **Protagonista:** la mejora (y la pregunta que la sostiene); en el cajón, la respuesta
- **Estado:** los 3 cambios hechos y medidos el 2026-10-27 (ver Historial).
- **Veredicto en una línea:** Se entiende en ~5 s y deja claro qué mejorar; le falta que la lista diga a qué módulo le falta acceso (se corta), que «Fuera de tema» no parezca anulada y que el cajón tenga UN solo botón negro después de responder.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciego con capturas: entendió las dos piezas en 5 s y tocó lo correcto primero; 5 dudas de palabras · real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Observado] el informe va justo bajo las cifras; en el cajón, tras responder, «Preguntar» y «Muéstrame» son los dos negros |
| 3 Simplicidad profunda | 8 | [Observado] «Sin respuesta» se lee como «Regla sin escribir / Error sin explicar / No existe en CAYLA»; cada mejora con su tipo y sus preguntas |
| 4 Lenguaje de tienda | 7 | [Observado] ciego: no entendió «Sin IA» ni «Dónde las llevó»; «Vive en un módulo que su rol no tiene» se corta |
| 5 Contenido primero | 7 | [Observado] la columna «¿Le sirvió?» repite «Sin contestar» en casi todas las filas y pesa más que la respuesta |
| 6 Lo difícil, a un toque | 9 | [Observado] las preguntas de cada mejora bajo «Ver las N preguntas»; el detalle de cada caja en la píldora |
| 7 Perdonar antes que preguntar | 9 | [Observado] nada irreversible; el informe no se paga dos veces (la base devuelve el mismo) |
| 8 Quitar antes de agregar | 7 | [Observado] «Sin contestar» ×N; el aviso «Una pantalla que se pregunta mucho…» vale una vez, no en cada visita |
| 9 De punta a punta | 8 | [Medido] 375 px sin scroll de lado; [Observado] vacío con «Encenderlo en Configuración», sin red → modo básico, oscuro con tokens |
| **Leyes (promedio)** | **7,7** | |
| **Oficio visual** | **7** | [Medido] de lo propio: «Ver las N preguntas» mide 20 px de alto (mínimo 24 con mouse); «Fuera de tema» usa el tono `apagado` (tachado = anulado) para algo que sí cuenta. Lo demás que marca el medidor es del marco del ERP (el «Salir» de 16 px, la píldora de la página actual, el interruptor del sistema de 22 px) |

## Los 3 cambios de mayor impacto
1. **Cajón: después de responder, un solo botón negro.** Antes: «Preguntar» (negro) y «Muéstrame» (negro) compiten. Después: «Muéstrame» es el
   principal; «Preguntar» pasa a secundario hasta que la persona cambie la pregunta. Junto con el candado del doble clic que encontró /chaos (dos
   clics anotaban y pagaban dos veces). **Ley 2.** Verificación: captura antes/después a 1440 y 375; ráfaga de dos clics → una sola fila. Esfuerzo S.
   Decide Felipe (presentación).
2. **Lista de Preguntas del equipo: palabras de tienda y lo que respondió, primero y entero.** Antes: «Vive en un módulo que su rol no tie…» (se
   corta antes de decir cuál), «Fuera de tema» tachado, «Sin IA» y «Dónde las llevó» (el ciego no los entendió). Después: «Le falta: Traslados»,
   «→ Caja», «Regla de tienda»; «Fuera de tema» en el tono neutro; «Sin IA» → «Solo sugirió demos»; «Dónde las llevó» → «Pantallas que más
   responden». **Leyes 1, 3, 4 y oficio.** Verificación: la fila de un «Pide un acceso» muestra el módulo completo a 1024 px. Esfuerzo S. Decide Felipe (presentación).
3. **Menos ruido en la lista y blancos a la medida.** Antes: «Sin contestar» en casi cada fila; «Ver las N preguntas» de 20 px. Después: un «—»
   tenue cuando nadie contestó (el «Sí» y el «No» quedan como insignias), y el «Ver más» a 24 px o más. **Leyes 5 y 8, oficio.** Verificación: medidor
   sin blancos propios bajo 24 px. Esfuerzo S. Decide Felipe (presentación).

## Lo que sobra (ley 8)
- «Sin contestar» repetido en cada fila: no ayuda a decidir; basta un «—».
- La frase «Una pantalla que se pregunta mucho puede estar escondida…» bajo «Dónde las llevó»: útil la primera vez; la guía ya la dice.

## Lo que no pediste y importa más
El hallazgo de permisos de /chaos (en el chat, no aquí): hasta que se cierre, el tope del mes del asistente se puede gastar sin usar la IA.

## Lista aparte (no se ejecuta)
- En una terminal, la lista dice «Una terminal» porque el cajón todavía no manda el responsable del combo (ya en el backlog).
- «Una terminal» sin nombre: dos terminales distintas parecen una (el ciego vio dos respuestas a «la misma persona»). Mostrar el nombre de la
  terminal pide que la función de la base lo traiga (cambio de la base).
- «Muéstrame» podría decir «Muéstrame en la pantalla».
- En el cajón, una demo que no tiene que ver («Frescura del piso» para un traslado): la búsqueda local muestra hasta 2 aunque empaten poco.
- La evaluación fija oscila en 2 de 40 (Historial de cierres contra Caja; anular una venta de hoy).
- El escáner de huellas de las guías no cuenta `<Interruptor>` (backlog).

## Prueba ciega
Un agente sin contexto, con capturas (no recorrió la pantalla en vivo), como encargada de tienda:

| | Preguntas del equipo | Cajón |
|---|---|---|
| 5 s | «el resumen de lo que mi equipo le pregunta al sistema este mes: cuántas se resolvieron, cuáles no y qué accesos piden» ✓ | «un ayudante: escribo qué quiero hacer y me lleva a la pantalla» ✓ |
| Primer toque | «Ver las 2 preguntas» de la mejora 1 ✓ | «Muéstrame» ✓ |
| Dudas (textual) | «Sin IA · 2», «Dónde las llevó», el chip tachado «Fuera de tema» («¿está mal?»), «Sin contestar» en toda la columna «no me dice nada», «Vive en un módulo que su rol no tie…» cortado; «Una terminal» con dos respuestas distintas a la misma pregunta (eran dos terminales distintas) | «Muéstrame» no dice si cambia de pantalla o pone una demo; «Frescura del piso» entre las demos de un traslado no tiene que ver |
| Lo que le diría al jefe | «dar acceso a Por pagar a quien consulta deudas», leído en la mejora 2 ✓ (el informe hace su trabajo) | — |

A 375 px: la página es larguísima y las preguntas quedan muy abajo. El círculo «N» que tapa el texto es la herramienta de Next en desarrollo, no existe en producción.

## Antes de decir «listo»
- Concurrencia: dos que encienden la misma sede por primera vez dejan 2 filas de historia [inferido, sin estado imposible]; el informe de una semana es uno solo aunque el cron y el botón se crucen [base].
- Caída externa: sin la IA o sin red, el cajón muestra las demos parecidas [visto]; sin la base, el botón no sale y la pantalla dice «No se pudo cargar».
- Persona sin contexto: prueba ciega con capturas (abajo); con una colaboradora real, sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-27 | `cd71f3a01` | 7,7 | 7 | — (propuestos 3, esperan el OK de Felipe) |
| 2026-10-27 | (este commit) | 8,3 | 8 | Los 3, con el OK de Felipe: un solo botón negro tras responder (y el candado del doble clic de /chaos: una sola petición, una fila), «→ pantalla» / «Le falta: módulo» enteros, «Fuera de tema» sin tachar, «Solo sugirió demos», «Pantallas que más responden», «—» en vez de «Sin contestar» y el «Ver más» de 24 px en la pieza del sistema (sus 10 pantallas). [Medido] blancos propios bajo 24 px: 5 → 0 a 1440 |
