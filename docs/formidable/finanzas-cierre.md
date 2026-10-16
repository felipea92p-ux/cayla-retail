# Formidable · Finanzas ▸ Cierre de mes (camino A)   (`/finanzas/cierre`)

- **Fecha / SHA:** 2026-10-16 · `fc5a966db` (PR #1127 + `main` del día) · **Dispositivo que manda:** escritorio
- **Pregunta que debería resolver:** «¿Puedo cerrar el mes y qué falta?» · **Protagonista:** el dinero (el mes que se congela)
- **Veredicto en una línea:** «Se entiende en 5 s ("la pantalla para cerrar el mes… 0 cosas… puedes cerrar") y le falta hablar en tienda: "diario",
  "asiento", "Debe = haber", "huella" y "ADR-0198" están a la vista de quien solo quiere cerrar Lima.»

Cómo se midió: como en `finanzas-resumen.md`. El seed tiene las cuatro unidades «lista para cerrar»: el estado con cosas que frenan no se vio
(el escenario `cierre.pendientes` de `tema:auditar` tampoco encontró su botón por lo mismo).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] 5 s ✓; «¿se puede cerrar?» ✓; encontró el único botón «Cerrar septiembre de Lima» y no tocaría otra unidad; 4 errores evitables (tarjetas de otra unidad, el chip «CAYLA entera» de arriba, la lista de mes, la de sede). Real: sin probar |
| 2 Una pregunta, una respuesta | 7 | [Medido] 1 primario («Cerrar septiembre de Lima») ✓; [Observado] «CAYLA entera» aparece dos veces (chip de la cabecera y tarjeta) |
| 3 Simplicidad profunda | 6 | [Observado] «0 COSAS» («no dice qué es una cosa»); «faltan 4» sin decir qué («se habilita cuando cierren todas», sin botón); la rutina de 3 días parece pasos obligatorios y la pantalla solo comprueba el día 1 |
| 4 Lenguaje de tienda | 5 | [Observado] 8 palabras: «ADR-0198», «huella», «diario», «asiento», «Debe = haber», «unidad», «regularizar las prendas vendidas sin código», «módulo Cierre de mes» |
| 5 Contenido primero | 8 | [Medido] el anillo y «Puedes cerrar septiembre.» son lo más grande; cifra 84 px no aplica (es un anillo) |
| 6 Lo difícil, a un toque | 7 | [Código] cada chequeo trae su detalle en una línea; no hay «¿Por qué?» para «0 cosas» (hoy no hace falta: no falta nada) |
| 7 Perdonar antes que preguntar | 7 | [Código] «Cerrar … de Lima» es irreversible con reapertura con motivo (lo dice la nota); [Observado] la ciega no sabe si pide confirmación |
| 8 Quitar antes de agregar | 7 | [Observado] la «RUTINA DE FIN DE MES» (3 días) ocupa media pantalla y no se comprueba |
| 9 De punta a punta | 7 | [Medido] 375 sin desborde; el estado «faltan cosas» no se pudo ver con el seed |
| **Leyes (promedio)** | **6,8** | ley 4 en 5 |
| **Oficio visual** | **8** | [Medido] fallan 2 de 8 propias: 1 fila de controles desigual, 5 radios. Pasan: blancos (ninguno propio bajo 24), contraste, rojo (2), texto mínimo, espaciado, alineación (solo el chrome a 2 px), sin sombras |

## Los 3 cambios de mayor impacto (presentación: esperan el OK de Felipe)
1. **El anillo habla.** Antes → «0 COSAS». Después → «Nada falta» cuando es 0 y «3 cosas frenan el cierre» cuando no; «faltan 4» en CAYLA entera dice «faltan 4 unidades por cerrar». Ley 3/4 · verif.: la ciega sabe qué es una «cosa» · esfuerzo S · decide Felipe.
2. **Los chequeos en lenguaje de tienda.** Antes → «El diario de la unidad cuadra · Debe = haber en su único asiento (3 líneas)». Después → «Las cuentas del mes cuadran» con el detalle contable en `title` o bajo «¿Por qué?»; «huella» → «queda guardado y no se puede cambiar»; «(ADR-0198)» fuera del texto. Ley 4 · verif.: palabras no entendidas bajan de 8 a ≤ 2 · esfuerzo S · decide Felipe.
3. **La rutina se pliega.** Antes → «LA RUTINA DE FIN DE MES» (Día 1, 2, 3) siempre abierta. Después → «¿Cómo se cierra un mes?» plegado, abierto solo la primera vez. Ley 8 · verif.: la pantalla cabe en 900 px con el botón de cerrar a la vista · esfuerzo S · decide Felipe.

## Lo que sobra (ley 8)
- El chip «CAYLA entera» de la cabecera repite la tarjeta «CAYLA entera».

## Lo que no pediste y importa más
En un escritorio de 900 px de alto, el lateral muestra hasta «Impuestos» y «Cierre de mes» queda fuera del área visible del menú (la ciega:
«ninguno dice Cierre de mes; no sé por dónde volvería»): es del chrome global, no de esta pantalla, y afecta al sexto ítem de cualquier módulo.

## Lista aparte (no se ejecuta)
- El botón «Cerrar septiembre de Lima» debería decir si pide confirmación («Cerrar…»).
- Las tarjetas de unidad parecen botones y lo son: marcar la elegida con algo más que el borde.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ |
| Primer intento | la pregunta ✓; cerrar Lima: encontró el botón, no pudo confirmar el resultado (captura) |
| Pasos | 7 |
| Dudas | 13 |
| Palabras no entendidas | 8 |
| Errores evitables | 4 |

## Antes de decir «listo»
- Concurrencia: el cierre lo atacó `/chaos` el 2026-10-13 («nada entra con fecha de un mes cerrado»). · Caída externa: la cabecera avisa con `fallas`. · Persona sin contexto: ciega ✓ · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-16 | fc5a966db | 6,8 | 8 | — (primer análisis) |
