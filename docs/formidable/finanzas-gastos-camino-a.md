# Formidable · Finanzas ▸ Gastos (camino A: «¿En qué se fue la plata?» y la bandeja)   (`/finanzas/gastos`)

- **Fecha / SHA:** 2026-10-16 · `fc5a966db` (PR #1127 + `main` del día) · **Dispositivo que manda:** escritorio
- **Pregunta que debería resolver:** «¿En qué se fue la plata este mes y qué me falta revisar?» · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende en 5 s ("cuánto gastó la tienda y en qué… revisar la 1 cosa que falta") y le falta UNA acción principal:
  la ciega tocaría primero "Registrar gasto" para los S/ 20 de bolsas y los contaría dos veces.»

Cómo se midió: como en `finanzas-resumen.md`. Este informe es del camino A (la pregunta grande y la bandeja); la fila de un gasto y su detalle ya
tienen el suyo en `finanzas-gastos.md` (2026-10-14).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] 5 s ✓ (identificó la pantalla, la pregunta y «Clasificar» como lo que sigue); terminó «no del todo» porque no vio la hoja de clasificar; 2 errores evitables (tocar «Registrar gasto» primero; dejar «Otro»). Real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Medido] **dos** `btn-primario` a la vista: «Registrar gasto» y «Clasificar»; [Observado] la ciega dudó cuál va primero |
| 3 Simplicidad profunda | 6 | [Observado] «este mes gastaste S/ 0.00» junto a «S/ 20 … salió del cajón» («pensé que la plata ya se había ido, pero el sistema dice que no se gastó nada»; solo la cuarta tarjeta lo explica); «el sistema propone y tú solo dices qué fue» sin propuesta visible; «Otro» en grande cuando la nota del pie dice «No existe la categoría “Otros”» |
| 4 Lenguaje de tienda | 7 | [Observado] 7 palabras: «Dynamic», «vigentes», «Fijos del mes», «Activos fijos», «Por pagar», «Otro/Otros», «IGV descontable» |
| 5 Contenido primero | 8 | [Medido] cifra de 84 px, la mayor; la cosa por revisar es la tarjeta más grande del cuerpo |
| 6 Lo difícil, a un toque | 7 | [Código] la bandeja abre la hoja «¿Qué fue esta salida?» a un toque ✓; no hay «¿Por qué?» en «gastaste» (los tres mayores salen solo con más de un gasto) |
| 7 Perdonar antes que preguntar | 7 | [Código] clasificar y registrar confirman con «Guardar»; [Observado] la ciega no sabe si «Clasificar» guarda al elegir |
| 8 Quitar antes de agregar | 6 | [Observado] tres caminos a lo mismo: botón «Clasificar», tarjeta «EGRESOS DE CAJA SIN CLASIFICAR →» y pestaña «EGRESOS DE CAJA POR CLASIFICAR» |
| 9 De punta a punta | 7 | [Medido] 375 sin desborde; vacío «Sin gastos en octubre 2026. Registra la luz…» ✓; [Observado] «S/ 0.00» no distingue «no se gastó» de «nadie anotó» |
| **Leyes (promedio)** | **6,7** | ley 2 en 5 |
| **Oficio visual** | **5** | [Medido] fallan 4 de 8 propias: borde a 1 px (pestaña «Gastos»), 1 fila desigual, 7 radios, rojo en 3. Pasan: blancos (ninguno propio bajo 24), contraste (el 1,06:1 de la pestaña es falso positivo; `tema:auditar` 0), texto mínimo, espaciado; 2 sombras (hojas cerradas: por revisar de dónde) |

## Los 3 cambios de mayor impacto (presentación: esperan el OK de Felipe)
1. **Una sola acción principal.** Antes → «Registrar gasto» (cabecera) y «Clasificar» (bandeja), los dos negros. Después → con cosas por revisar, «Clasificar» es el primario y «Registrar gasto» pasa a `fantasma`; sin bandeja, al revés. Ley 2 · verif.: `medir-oficio` cuenta 1 primario; la ciega repetida toca «Clasificar» primero · esfuerzo S · decide Felipe.
2. **La cifra dice lo que no cuenta.** Antes → «este mes gastaste S/ 0.00 · Todavía no hay gastos registrados este mes.» Después → «S/ 0 registrados · S/ 20 salieron del cajón y aún no dicen qué fueron» cuando la bandeja no está vacía. Ley 3 · verif.: la contradicción desaparece de la ciega · esfuerzo S · decide Felipe.
3. **La tarjeta por revisar dice lo que es.** Antes → título «Otro» (el motivo del egreso) y «el sistema propone y tú solo dices qué fue» sin propuesta. Después → el título es la nota («Bolsas para empaque»), el motivo va en chico, y la frase de la cabecera solo promete lo que hace («una por una, tú dices qué fue»). Ley 4/9 · verif.: la ciega no toma «Otro» por categoría · esfuerzo S · decide Felipe.

## Lo que sobra (ley 8)
- La tarjeta «EGRESOS DE CAJA SIN CLASIFICAR →» repite la bandeja de arriba con el mismo número.

## Lo que no pediste y importa más
«La planilla no se registra aquí: se lee de Dynamic» deja la pregunta «¿en qué se fue la plata?» sin los sueldos, que son el gasto más grande de
CAYLA; la cifra grande debería decir «sin sueldos» (o sumarlos, decisión de Felipe) para que la respuesta no parezca completa cuando no lo es.

## Lista aparte (no se ejecuta)
- «Si llegó con comprobante de un proveedor, comparte la factura con Compras» en la bajada: la ciega no supo si las bolsas tenían comprobante y si debía ir a Compras.
- «vigentes» en «0 gastos vigentes»: «sin anular».
- Las tarjetas de cifras sin flecha no parecen tocables y la última sí: igualar.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ |
| Primer intento | a medias (no vio la hoja de clasificar) |
| Pasos | 8 |
| Dudas | 11 |
| Palabras no entendidas | 7 |
| Errores evitables | 2 |

## Antes de decir «listo»
- Concurrencia: la bandeja abre las hojas ya atacadas por `/chaos` el 2026-10-13/14 (ADR-0412). · Caída externa: si lo gastado no se puede leer, «No se pudo leer lo gastado en el mes.» [código `GastosPulso.tsx`]. · Persona sin contexto: ciega ✓ · real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-16 | fc5a966db | 6,7 | 5 | — (primer análisis del camino A) |
