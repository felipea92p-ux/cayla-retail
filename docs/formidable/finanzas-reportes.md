# Formidable · Finanzas ▸ Reportes ▸ Estado de resultados (camino A)   (`/finanzas/reportes`)

- **Fecha / SHA:** 2026-10-16 · `fc5a966db` (PR #1127 + `main` del día) · **Dispositivo que manda:** escritorio
- **Pregunta que debería resolver:** «¿Cuánto ganó (la tienda que miro) este mes y de dónde sale?» · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende en 5 s ("¿Ganamos? … Ganó S/ 69") y le falta una sola palabra para la cifra: arriba "te quedan", el chip
  "Ganó" y la tabla "Utilidad operativa" nombran lo mismo tres veces, y las cifras tocables no se ven tocables.»

Cómo se midió: como en `finanzas-resumen.md`.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] 5 s ✓; cuánto ganó ✓ (S/ 69) y lo vendido ✓ (S/ 131) con la cuenta cuadrada a mano (131 − 62 = 69); «de dónde sale» a medias: leyó «Toca una cifra…» pero «las cifras se ven como texto común»; 2 errores evitables. Real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Observado] «te quedan S/ 69», «Ganó» y «Utilidad operativa S/ 69» («pensé que los tres son lo mismo. Nada en la pantalla lo dice»); dos selectores de tienda. [Medido] 0 primarios (bien: es de lectura) |
| 3 Simplicidad profunda | 5 | [Observado] CAYLA: «Utilidad operativa S/ 272 · 105,4 % de la venta» con ventas de S/ 258 («la ganancia no puede ser mayor que lo vendido»; «Faltantes y sobrantes de caja S/ 140» solo en esa columna); «—» sin saber si es cero o sin cargar; la «Nota» de la planilla deja el «Ganó» en duda |
| 4 Lenguaje de tienda | 5 | [Observado] 8 palabras: «ADR-0198», «diario», «asiento», «Dynamic», los números de «Cuenta» (7011, 691…), «D-31/D-32», «Producción ▸ Eficiencia», «Escenarios» |
| 5 Contenido primero | 7 | [Medido] cifra de 84 px, la mayor; abajo, la tabla contable con columna «Cuenta» pesa tanto como la respuesta |
| 6 Lo difícil, a un toque | 7 | [Código] «¿Por qué S/ 69?» ✓ y «De dónde sale» por celda ✓; [Observado] las celdas no parecen botones |
| 7 Perdonar antes que preguntar | 8 | [Código] solo lectura; «Descargar Excel» descarga |
| 8 Quitar antes de agregar | 5 | [Observado] la columna «Cuenta» con códigos contables y «(ADR-0198)» en la bajada están siempre a la vista |
| 9 De punta a punta | 7 | [Medido] 375 sin desborde; vacío del pulso con su motivo ✓ |
| **Leyes (promedio)** | **6,3** | leyes 3, 4 y 8 en 5 |
| **Oficio visual** | **5** | [Medido] fallan 4 de 8 propias: **7 blancos bajo 24 px** («¿Por qué S/ 69?» 20 px; las celdas «De dónde sale» 31,7×19,5; la casilla «Comparar con septiembre» 13×13), bordes a 1–3 px («te quedan» 806 vs 807/809), 2 filas desiguales, 8 radios. Pasan: contraste (falso positivo de la pestaña), rojo (2), texto mínimo, espaciado. Sin blocker: ninguna acción irreversible pequeña |

## Los 3 cambios de mayor impacto (presentación: esperan el OK de Felipe)
1. **Una sola palabra para la cifra.** Antes → «te quedan» (arriba), «Ganó» (chip), «Utilidad operativa» (tabla). Después → la última fila de la tabla se llama «Te quedan» como la respuesta, y el chip dice «Ganó» solo cuando el mes cerró. Ley 4 · verif.: la ciega no pregunta si son lo mismo · esfuerzo S · decide Felipe.
2. **Lo contable, a un toque.** Antes → columna «Cuenta» (7011, 691…) y «(ADR-0198)» siempre a la vista. Después → la columna va detrás de «Ver cuentas contables» (interruptor, apagado de fábrica) y la bajada deja la referencia al ADR para el `title`. Ley 8/4 · verif.: palabras no entendidas bajan de 8 · esfuerzo S · decide Felipe.
3. **Las cifras tocables se ven tocables y miden 24 px.** Antes → celdas de texto que «se pueden tocar» según una frase. Después → subrayado punteado y el chevron «›» del sistema, alto de fila 32 px. Ley 6 + oficio · verif.: `medir-oficio` deja de listar las celdas · esfuerzo M · decide Felipe.

## Lo que sobra (ley 8)
- «(ADR-0198)» y «Nadie escribe un asiento» en la bajada de la pantalla.
- Los dos recuadros «ⓘ» del pie repiten lo que dice la columna «CAYLA suma de todo».

## Lo que no pediste y importa más
Con el seed, CAYLA gana S/ 272 vendiendo S/ 258 porque «Faltantes y sobrantes de caja» (cuenta 6599) suma S/ 140 a favor: un sobrante de caja
entra al estado de resultados como ganancia. Que un sobrante sea utilidad es una regla de dinero y es de Felipe; mientras tanto, la frase del
pulso debería nombrarlo («incluye S/ 140 de sobrantes de caja») para que nadie crea que la ropa dejó más de lo que se vendió.

## Lista aparte (no se ejecuta)
- «Octubre 2026 · a la fecha» sin decir hasta qué día.
- «—» en los gastos: «sin gastos» o «sin cargar» según el caso.
- La casilla «Comparar con septiembre» de 13 px: `<Casilla>` del sistema (ADR-0358).

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ |
| Primer intento | a medias |
| Pasos | 8 |
| Dudas | 11 |
| Palabras no entendidas | 8 |
| Errores evitables | 2 |

## Antes de decir «listo»
- Concurrencia: solo lectura. · Caída externa: sin filas, el pulso dice «Todavía no hay nada registrado en …» [código `ResultadoPulso.tsx`]. · Persona sin contexto: ciega ✓ · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-16 | fc5a966db | 6,3 | 5 | — (primer análisis) |
