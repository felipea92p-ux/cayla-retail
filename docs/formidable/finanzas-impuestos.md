# Formidable · Finanzas ▸ Impuestos (camino A)   (`/finanzas/impuestos`)

- **Fecha / SHA:** 2026-10-16 · `fc5a966db` (PR #1127 + `main` del día) · **Dispositivo que manda:** escritorio
- **Pregunta que debería resolver:** «¿Cuánto le debo a SUNAT por el mes que toca declarar y qué reviso antes?» · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende en 5 s ("a la SUNAT no le debo nada: te queda a favor S/ 814") y le falta decir "pagas S/ 0" con esas
  palabras y tener una sola lista de "antes de declarar" (hoy hay dos que se contradicen).»

Cómo se midió: como en `finanzas-resumen.md`.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] 5 s ✓; terminó «a medias»: cuánto pagar ✓ (S/ 0, S/ 814 a favor), qué revisar ✓ (listó 4 cosas), pero dudó de que el S/ 0 sea real («El sistema tiene ventas desde octubre 2026»); 3 errores evitables («Registrar el pago» creyendo que debe pagar, «Paquete» creyendo que declara, mirar otro mes). Real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Observado] dos bloques con casi el mismo título: «Antes de declarar · Nada pendiente · Al día» y «Para revisar antes de declarar · 1 punto» («no sé cuál manda») |
| 3 Simplicidad profunda | 6 | [Observado] «te queda a favor» nunca dice «pagas S/ 0»; «La franja rayada es lo proyectado» con la barra vacía; «“sin pago registrado” solo dice que el sistema no lo sabe» sin que ese texto exista en la pantalla; Oct* «a favor S/ 7 811» vs «SALDO A FAVOR PARA OCTUBRE S/ 814» (7 009 + 814 − 12: la pantalla no lo explica) |
| 4 Lenguaje de tienda | 6 | [Observado] 6 palabras: «UIT», «Libro Diario y el Mayor electrónicos», «retención del 8 %», «régimen», «PAGO A CUENTA DE RENTA», «franja rayada» |
| 5 Contenido primero | 8 | [Medido] cifra de 84 px, la mayor |
| 6 Lo difícil, a un toque | 8 | [Código] «¿Por qué?» abre la cuenta a un toque ✓ |
| 7 Perdonar antes que preguntar | 8 | [Código] nada irreversible a la vista; «Registrar el pago» es un enlace a Cuentas y dinero |
| 8 Quitar antes de agregar | 6 | [Observado] dos listas de revisión; «El límite de 300 UIT · 0,0 %» con 12 meses que «todavía cuentan menos de lo real» |
| 9 De punta a punta | 7 | [Medido] 375 sin desborde; [Observado] textos que describen cosas que no se ven (franja, «sin pago registrado») |
| **Leyes (promedio)** | **6,9** | |
| **Oficio visual** | **5** | [Medido] fallan 4 de 8 propias: «¿Por qué?» 20 px, bordes a 1–3 px («Registro de ventas» 456 vs 458; `th` «A pagar» 881 vs 884), 1 fila desigual, 5 radios. Pasan: contraste, rojo (2), texto mínimo, espaciado. «Paquete para el contador» salió como primario con el texto «Armando…» pegado: el botón cambia de ancho al cargar (regla «Mientras guarda», ADR-0358) |

## Los 3 cambios de mayor impacto (presentación: esperan el OK de Felipe)
1. **Una sola lista «Antes de declarar».** Antes → «Antes de declarar (Al día)» arriba y «Para revisar antes de declarar (Recibos por honorarios)» abajo. Después → una lista: lo que frena primero, lo que el contador define después, con un solo chip. Ley 2 · verif.: la ciega no pregunta «cuál manda» · esfuerzo S · decide Felipe.
2. **La respuesta dice lo que pagas.** Antes → «te queda a favor S/ 814». Después → «Este mes no pagas IGV: te quedan S/ 814 a favor para octubre» (y «pagas S/ X» cuando toca pagar). Ley 1/3 · verif.: la ciega responde «S/ 0» sin inferirlo · esfuerzo S · decide Felipe.
3. **Textos que solo se muestran cuando lo que describen existe.** Antes → «La franja rayada es lo proyectado…» con la barra vacía y «“sin pago registrado”…» sin ese rótulo. Después → la nota de la franja solo con proyección > 0; la del pago, cuando el mes tiene algo que pagar. Ley 9 · verif.: con el seed no aparecen · esfuerzo S · decide Felipe.

## Lo que sobra (ley 8)
- «UIT 2026 = S/ 5 500» y «Libro Diario y el Mayor electrónicos» a la vista: bajo «¿Por qué?» del límite.

## Lo que no pediste y importa más
«IGV COBRADO AL VENDER S/ 0 · de 0 comprobantes emitidos» junto a «El sistema tiene ventas desde octubre 2026»: la pantalla declara septiembre con
ventas que no están en el sistema y no lo advierte al lado de la cifra grande. Un aviso «Septiembre no tiene ventas cargadas: el IGV cobrado es S/ 0
porque no hay datos, no porque no se vendió» evita declarar de menos. Es texto, no regla.

## Lista aparte (no se ejecuta)
- «por declarar» en la fila sin decir quién declara ni cómo se marca hecho.
- «Confirmar régimen con el contador» en negrita parece enlace y no lo es.
- «Otro mes» y las filas de la tabla cambian la cifra grande: decirlo al lado del título («IGV de septiembre · mes que se declara»).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ |
| Primer intento | a medias (la cifra sí; dudó de su realidad por las ventas desde octubre) |
| Pasos | 10 |
| Dudas | 10 |
| Palabras no entendidas | 6 |
| Errores evitables | 3 |

## Antes de decir «listo»
- Concurrencia: solo lectura; no aplica. · Caída externa: sin mes (`pulso.estado === "sin_mes"`) la pregunta queda con un vacío chico que dice el motivo [código `ImpuestosPulso.tsx`]. · Persona sin contexto: ciega ✓ · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-16 | fc5a966db | 6,9 | 5 | — (primer análisis) |
