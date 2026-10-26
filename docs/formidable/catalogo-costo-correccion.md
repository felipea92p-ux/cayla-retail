# Formidable · Catálogo ▸ Historial de la prenda ▸ Costo: «Hoy: N prendas» y la hoja «Corregir el costo»   (`/productos/[id]/historial`, vista rápida ▸ Historial)

- **Fecha / SHA:** 2026-10-26 · 2cba541d8 · **Dispositivo que manda:** escritorio (Mac mini); la hoja a 375 px se adapta
- **Pregunta que debería resolver (1 frase):** «¿cuánto me cuesta hoy esta prenda y, si el costo de la última compra se tecleó mal, cómo lo arreglo?» · **Protagonista:** el dinero
- **Veredicto en una línea:** «Se entiende en unos 5 s; a la hoja le sobra un párrafo y, cuando el costo es raro, el pie repite el botón que el aviso ya ofrece.»

**Cómo se midió (honesto):** costo «medio» pide hasta 4 agentes; **no se lanzaron** — la prueba ciega necesita una sesión de navegador con login y la corrida
ya llevaba 6 horas. Por eso **ciega y colaboradora real: sin probar**; lo de abajo es medición propia (DOM a 1440 y 375 px, capturas) y lectura de las leyes.
Ninguna nota lleva el veredicto de un escéptico: **tómalas como provisionales**.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Opinión] cada campo dice su estado («Sigue aquí»), la vista previa dice qué pasaría; [Observado] la guía de 4 pasos recorre la hoja sin tropiezos · ciega: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Observado] con el aviso de costo raro a la vista conviven «Guardar» (fijo abajo) y «Confirmar y guardar» (en el aviso): dos primarios para la misma decisión |
| 3 Simplicidad profunda | 8 | [Observado] «Hoy cada prenda te cuesta S/ 40.00; con la corrección, S/ 57.68» traduce el promedio ponderado a un veredicto; «estimado» con su «?» |
| 4 Lenguaje de tienda | 8 | [Opinión] «llegaron», «ya tenías», «costo fuera de lo normal»; «por prenda, sin IGV» es consistente con Análisis [código analisis-pedir.ts:452] pero no se confirmó contra Recibir |
| 5 Contenido primero | 6 | [Observado] la hoja abre con un párrafo de 3 líneas antes del primer campo |
| 6 Lo difícil, a un toque | 8 | [Observado] el «?» de «estimado» y de cada compra; el motivo del aviso sale con cifras |
| 7 Perdonar antes que preguntar | 8 | [Observado] nada se guarda sin «Guardar»; el costo raro se confirma (es dinero); «sin cambios» por doble clic se toma como hecho |
| 8 Quitar antes de agregar | 6 | [Opinión] el párrafo inicial repite lo que la vista previa y el aviso ya dicen |
| 9 De punta a punta | 6 | [Observado] a 375 px los botones del aviso quedan bajo el pie fijo; [Observado] con 6 compras en 2 días los números del gráfico se pisan (la pestaña, no la hoja) |
| **Leyes (promedio)** | **7,0** | provisional, sin ciega |
| **Oficio visual** | **7** | [Medido] 5 de 8 comprobaciones fallan, casi todas del marco del ERP (menú, «Salir», 10–11 px del lateral); de lo nuevo: los tramos de «Hoy» miden 6,6 a 477 px de ancho × 12 de alto (el blanco chico es propio de la barra apilada; la leyenda de abajo es el blanco de 24 px y hace lo mismo) |

## Los 3 cambios de mayor impacto
1. **Con el aviso de costo raro, el pie no repite «Guardar».** Antes: «Guardar» primario fijo + «Confirmar y guardar» en el aviso (a 375 px, tapado por el pie). Después: mientras el aviso está a la vista, el pie solo dice «Cancelar» y el aviso lleva la decisión (corregir o confirmar); al corregir el costo vuelve «Guardar». **Ley 2 y 9.** Se verifica a 1440 y 375 px con el costo S/ 1950. Esfuerzo S. Quién decide: Felipe (presentación).
2. **Acortar el párrafo de arriba de la hoja.** Antes: «En esa compra llegaron 2 a S/ 40.00. Escribe lo que costaron de verdad: cambia lo que cuesta cada prenda, pero no la factura ni lo que ya se vendió.» Después: «Llegaron **2** a **S/ 40.00**. La factura y lo ya vendido no cambian.» **Ley 5 y 8.** Esfuerzo S. Felipe (presentación).
3. **El aviso entra a la vista sobre el pie fijo** (a 375 px el botón «Confirmar y guardar» queda bajo «Cancelar/Guardar»): si el cambio 1 se aprueba, se resuelve solo; si no, subir el aviso con un margen igual al alto del pie. **Ley 9.** Esfuerzo S.

## Lo que sobra (ley 8)
El párrafo inicial de la hoja (cambio 2) y la línea «Queda anotado con tu nombre.» bajo el motivo: ya lo dice «Responsable» más abajo; se propone esconderla.

## Lo que no pediste y importa más
**El gráfico de escalera se rompe con compras cercanas en el tiempo** (actividad 2 del PR #1335): con 6 compras en 2 días (datos locales de «Pantalón Carla») los números y las etiquetas «primera/igual» se pisan y no se puede tocar ninguno. En una tienda que recibe varias veces por semana pasará. Se deja como tarea aparte (no es de esta actividad).

## Lista aparte (sin ejecutar)
- Confirmar con Felipe que el costo de una compra es «sin IGV» en Recibir (la hoja lo promete).
- La barra «Hoy» con más de 6 compras vivas: hoy se repiten tonos (cuatro claros); leyenda con «de antes» ya lo dice.

## Historial
| Fecha | SHA | Leyes | Oficio | Nota |
|---|---|---|---|---|
| 2026-10-26 | 2cba541d8 | 7,0 | 7 | primera medición; sin ciega ni escéptico; 3 cambios propuestos, esperan OK de Felipe |
