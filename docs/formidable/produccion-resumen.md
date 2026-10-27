# Formidable · Producción ▸ Resumen   (`/produccion`)

- **Fecha / SHA:** 2026-10-27 · `d56321836` (origin/main) · **Dispositivo que manda:** escritorio en el Taller
- **Pregunta que debería resolver (1 frase):** «¿Qué fabrico primero y cuánto?» · **Protagonista:** la prenda (el modelo)
- **Veredicto en una línea:** «Se entiende qué mirar en 5 s, pero no cuánto fabricar ni por qué hay dos listas.»
- **Costo y alcance:** 1 agente (la prueba ciega, Sonnet, sobre las dos capturas del Resumen real, que son de producción). **Sin escéptico y sin medir el DOM** (costo medio); el oficio visual queda sin calificar. Real sin probar con una colaboradora.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 4 | [Observado] ciega: sabe qué prenda mirar primero, no cuánto hacer; creyó que «81 modelos» eran 81 prendas. Nota de facilidad que se dio: 5/10 |
| 2 Una pregunta, una respuesta | 3 | [Observado] «parecen dos listas de lo mismo» («Para decidir» y «¿Qué producir?»); no supo en cuál mandar. [Medido, código] el aviso de 81 modelos y la tabla salen de las mismas filas (`tarjetaProducirAgrupada`) |
| 3 Simplicidad profunda | 4 | [Observado] «8,6 por semana» junto a «6 en 30 d» le chocó; la barra con dos rayitas sin leyenda: «no lo entiendo» |
| 4 Lenguaje de tienda | 5 | [Observado] «Cobertura», «Ventas/sem.» y «Poca base» confunden; «agotado», «Sobrestock» y «no produzcas más» sí se entienden |
| 5 Contenido primero | 6 | [Opinión] la prenda es una miniatura de 40 px y las 4 tarjetas de cifras pesan más que ella |
| 6 Lo difícil, a un toque | 5 | [Observado] no halló cómo se calcula nada; existe la hoja «Ver el modelo», pero no se la encontró desde la captura |
| 7 Perdonar antes que preguntar | 8 | [Medido, código] la pantalla no escribe: «Abrir orden» navega y precarga; no hay nada irreversible aquí |
| 8 Quitar antes de agregar | 3 | [Observado] la duplicación; además «Hoy en el Taller» dice «ninguna pide algo» cuando arriba todo era urgente |
| 9 De punta a punta | 5 | [Observado] tres ceros (stock, en producción, valor) que no distingue de «aún no cargado»; «Producir ya» parece una etiqueta y no un botón |
| **Leyes (promedio)** | **4,8** (provisional, 9 de 9 con evidencia de 1 agente) | |
| **Oficio visual** | sin calificar | no se midió el DOM |

## Los 3 cambios de mayor impacto
1. **Una sola lista, con una sola pregunta.** *Antes:* aviso de 81 modelos + tabla de 54–81 filas + tarjetas de «Para decidir» + 2 listas más. *Después:* «¿Qué fabrico primero?» con los modelos que se venden de verdad, el primero marcado «Empieza por aquí», y los de 1–2 ventas aparte, plegados, como «Para vigilar». Los filtros de la tarea #4 sobran: son dos grupos. *Ley:* 2, 8, 1. *Verifica:* la ciega repetida contesta «¿qué hago primero?» sin dudar. *Esfuerzo:* M. *Decide:* Felipe (presentación; no cambia reglas).
2. **Una frase y un número por modelo, en vez de ritmo, cobertura y chips.** *Antes:* «8,6 · 6 en 30 d · barra · Producir ya». *Después:* «Se agotó en las tiendas · vendió 12 en el último mes → Fabricar unas 13 → [Preparar orden]»; el ritmo y la barra viven bajo «¿Por qué?». *Ley:* 3, 4, 6, 9. *Verifica:* la ciega responde «cuántas hago» y repite la frase con sus palabras. *Esfuerzo:* M. *Decide:* Felipe. **Ojo:** la cantidad ya existe (`repartirFalta`) y respeta ADR-0346 (sin cantidad con poca base).
3. **Los ceros y la edad de los datos dicen la verdad.** *Antes:* «S/ 0.00» ×3 y «ninguna pide algo». *Después:* «Aún sin cargar», «Sin costos todavía», «4 sin fecha»; una nota «el sistema lleva 4 semanas de ventas». *Ley:* 9, 3, 1. *Verifica:* la ciega distingue «no hay» de «no está cargado». *Esfuerzo:* S–M. *Decide:* Felipe; la pieza `TarjetaCifra` ya admite `valor={null}` con su motivo (ADR-0358).

**Lo que sobra (ley 8):** el chip «Producir ya» repetido en las 54–81 filas (todas lo dicen), la columna Cobertura a la vista, y el aviso de 81 modelos como tarjeta aparte.
**Lo que Felipe no pidió y importa más:** el orden. Hoy los agotados van primero, aunque se hayan vendido 1 vez; «Falda Jean», que vendió 18 y se acaba en 6 días, queda al final. Ordenar por «lo que más se vende» es más fácil de explicar a alguien nuevo, pero cambia el orden que aprobó ADR-0133: decide Felipe.

## Maqueta
`docs/maquetas/produccion-resumen-81-2026-10/index.html` (tercera pestaña, «Versión simple»), con datos reales de producción del 27-oct.

## Pendiente
Repetir la ciega con la versión construida, y probar con una colaboradora del Taller (no hay evidencia real de que la versión simple la ayude más que la de hoy).

## Después de construir (2026-10-27): segunda prueba ciega
Mismo método y mismas preguntas, otro agente nuevo (Sonnet), sobre capturas de la pantalla REAL construida, con los 54 modelos de producción y las cifras de ese día (las de insumos y facturas simuladas como «sin cargar»: es lo que mostraría producción). **Facilidad: 5 → 7 de 10.** [Observado, 1 agente; real sin probar con una colaboradora]
- **Se arregló:** a los 5 s dice qué mirar y qué tocar («Camisa M/corta con Amarre», «Empieza por aquí», botón negro); entiende «Se agotó · vendió 12» y «Fabricar unas 13» (CLARO); la nota de 4 semanas la entiende y la hace desconfiar bien («consultaría al jefe antes de producir»); los «—» ya no los toma por una falla en la segunda lectura, aunque al principio sí.
- **Sigue confundiendo (para otra ronda):**
  1. **«Para decidir» frente a «Los demás modelos»**: las tarjetas de sobrestock («no produzcas más») y las filas de «Sobrestock» de la tabla dicen lo mismo. Y el botón «**Ver qué producir**» de esas tarjetas contradice su propio «no produzcas más» (`produccion-decisiones.ts`, `accion` de `sobrestock`). Es una frase vieja, no de esta construcción.
  2. **«Entregas por atender 0 · 4 órdenes sin fecha de entrega»**: un 0 al lado de un 4. Mejor: «4 sin fecha» como cifra, o «Sin fecha» como motivo.
  3. **«32 modelos para vigilar»**: no dice qué hace ella. Falta un verbo («mira si vuelven a venderse»).
  4. **«Preparar orden»**: no sabe si crea la orden al tocarla o la deja revisar antes (la deja revisar: abre «Nueva orden» con la cantidad escrita). Un «Abre la orden para que la revises» bajo el botón, o en su `title`, lo diría.
  5. **«Hoy en el Taller»** lo tomó por «lo que hay que hacer hoy»; su frase «ninguna pide algo» es de `lib/ordenes-lista-reglas.ts` (otra sesión).
  6. El total de prendas de las 22 no está en pantalla (suma las 6 que ve). Es la tarea #2 de `docs/pantallas/produccion.md` («faltan ~N prendas»), que se dejó fuera de los 3 cambios.
- **No se recalculan las 9 leyes con un solo agente:** la nota de facilidad subió de 5 a 7; las leyes 2 (una pregunta) y 3 (simplicidad) mejoraron con evidencia, la 8 (quitar) sigue coja por la duplicación de sobrestock.

## Historial
| Fecha | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|
| 2026-10-27 | 4,8 (provisional) | sin calificar | — (los 3 cambios esperan OK de Felipe) |
| 2026-10-27 (tarde) | facilidad 5 → 7 (1 agente, sin recalcular las 9 leyes) | sin calificar | los 3 cambios construidos con el OK de Felipe (commits `b3c70f95e` y `9a35e8c8d`); quedan 5 confusiones de la segunda ciega |
