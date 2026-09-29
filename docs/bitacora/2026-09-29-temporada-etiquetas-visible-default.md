## 2026-09-29 (Nuevo producto: «Temporada y etiquetas» ya no arranca escondido)

Qué hice: en el paso «¿Cómo es?» de Nuevo producto, el grupo «Temporada y etiquetas · opcional» aparecía plegado y había
que tocarlo para ver la temporada y las etiquetas. Ahora arranca abierto (`masAbierto` parte en `true` en
`NuevoProductoForm.tsx`). Sigue siendo plegable: al plegarlo, la línea dice lo elegido («— Verano, 2 etiquetas») como antes.
También actualicé los comentarios y el ADR-0260, que decían «plegadas».

Por qué así: plegado se pasaba de largo; quien crea la prenda no sabía que ahí se elige la temporada. Abierto, lo opcional
se ve; el costo es que el paso mide más de alto. Se dejó plegable (en vez de quitar el pliegue) para no perder la línea
resumen ni el espacio cuando alguien ya lo llenó y quiere ver el resto. Sin migración: solo web.

Felipe se lleva: abrir Catálogo ▸ Productos ▸ Nuevo producto, elegir una categoría y pasar al paso 2 → «Temporada y
etiquetas» se ve desplegado, con Temporada y Etiquetas a la vista. Tocar el título lo pliega y muestra la línea resumen.
No se verificó en el navegador ni con `tsc`: este worktree no tiene las dependencias instaladas (`tsc` da miles de errores
de módulos que no existen, ninguno de este cambio). El cambio es un solo valor inicial; el estado abierto es el de tu
segunda captura.
