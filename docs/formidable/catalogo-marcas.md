# Formidable · Catálogo ▸ Marcas   (`/productos/marcas`)

- **Fecha / SHA:** 2026-10-10 · `3977ae87f` (rama `claude/sad-shtern-5916e4`, PR #930, aún sin fusionar) · **Dispositivo que manda:** escritorio (Mac mini); 375 px se adapta.
- **Pregunta que debería resolver:** «¿Qué marcas tenemos, cuáles usamos y quién nos trae cada una?» · **Protagonista:** la marca.
- **Veredicto en una línea:** «Se entiende en 5 s y la tarea se cumple; los números de arriba no cuadran a la vista y sobran herramientas cuando la lista es corta.»
- **Cómo se midió:** medidor del DOM a 1440, 1024 y 375 px con Chromium sin ventana (el panel del navegador estaba oculto); una prueba ciega (Sonnet, con un robot
  que bloqueaba toda escritura a la base) sobre una página temporal con 89 marcas inventadas; y un escéptico que leyó el código y las mediciones (2 agentes en total).
  La base local solo tiene 5 marcas: la ciega no se pudo hacer con datos reales.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: a los 5 s dijo «lista de marcas con su proveedor, con buscador y filtros» (correcto); completó la tarea con la respuesta correcta en 5 toques. Retrocedió una vez (borrar la búsqueda para filtrar). · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Medido] una sola acción primaria a la vista («Nueva marca») · [Opinión] la pregunta se contesta con la lista |
| 3 Simplicidad profunda | 8 | [Visto] el estado va como veredicto («Ya la usamos», «Nadie la ha usado todavía»). Queda crudo «Sin productos activos · 1 descontinuado» |
| 4 Lenguaje de tienda | 6 | [Observado] dudó con «Resumen», «· 0 prod.» y con el total («Todas 89» no incluye las desactivadas; «Sin productos» no incluye las «Sin proveedor»: 24 + 62 ≠ 89). [Código] la misma cifra se llama «Todas», «Marcas activas» y «89 marcas activas» |
| 5 Contenido primero | 8 | [Medido] la marca en serif de 20 px y el monograma son lo más pesado de cada tarjeta; tres filas de herramientas antes de la primera marca |
| 6 Lo difícil, a un toque | 9 | [Visto] la ayuda «!», el resumen colapsado y el motivo de «Desactivar» viven bajo un toque |
| 7 Perdonar antes que preguntar | 7 | [Código] «Desactivar» pide confirmación aunque «Reactivar» lo deshace (patrón de todo el catálogo, `confirmar-catalogo.ts`) |
| 8 Quitar antes de agregar | 6 | [Código] el índice A–Z se dibuja aunque la lista sea corta (27 letras para las 3 «Sin proveedor») y el pie «Mostrando 1–4 de 4» repite el conteo con una sola página |
| 9 De punta a punta | 6 | [Medido] oscuro: 0 hallazgos en 7 escenarios; 375 px sin desborde. [/chaos] un nombre de 300 letras se guarda sin aviso y su aviso de éxito desborda la página; al cerrar la hoja con Escape el foco cae al inicio |
| **Leyes (promedio)** | **7,2** | ley 1 en 7 (sin colaboradora real) |
| **Oficio visual** | **6** | [Medido] de 8 comprobaciones fallan 6, pero 2 solo por piezas compartidas o controles deshabilitados (el «!» de 20 px de `Ayuda`, el «/» del buscador, los «…» de la paginación) y no cuentan; fallan de la pantalla: filas con alturas distintas (buscador 40, «Desactivadas» 31,5, «Resumen» 34,9), texto chico propio («La trae» 10 px, «Ir a» 11 px) y un radio suelto (13 px del monograma). «Bordes casi alineados» parece falso positivo (filas sin relación) |

## Los 3 cambios de mayor impacto (esperan el OK de Felipe; nada está hecho)
1. **Que los números cuadren y se llamen igual.** Antes: «Todas 89» · «Ya las usamos 24» · «Sin productos 62» · «Sin proveedor 3», y «89 marcas activas» / «Marcas activas»
   en otros lados. Después: «Activas 89» en los tres lugares; «Sin productos» y «Aún sin productos» con UNA misma palabra que deje claro que no incluye las «Sin
   proveedor»; «· 0 prod.» → «0 productos»; el vacío que dice «Toca «Todas»» sigue el nombre nuevo. **Ley 4 y 1.** Se verifica repitiendo la ciega: cero dudas sobre el total. **S.** Presentación: decide Felipe.
2. **Quitar lo que sobra cuando la lista es corta.** Antes: índice A–Z y «Mostrando… · de X a Y» siempre. Después: el índice aparece solo cuando la lista pasa de
   ~12 marcas (también dentro de un filtro) y el pie solo cuando hay más de una página. **Ley 8.** Se verifica con la base local (5 marcas) y con 89. **S.**
3. **Una fila de herramientas de una sola altura, y «Resumen» que diga qué abre.** Antes: tres alturas en la misma fila y un «Resumen» que la ciega leyó como
   «informe». Después: «Resumen» como píldora con el mismo alto que «Desactivadas» y un nombre que diga qué hace (p. ej. «Ver cifras»), «La trae» a 11 px y el
   monograma con el radio de 12 px de las demás piezas. **Oficio + ley 4.** Se verifica midiendo de nuevo. **S.**

## Lo que sobra (ley 8)
- El botón «Resumen» muestra los mismos cuatro números que las píldoras. Felipe eligió colapsarlo (2026-10-10); si nadie lo abre, se quita.

## Lo que no pediste y importa más
El «!» de ayuda (`components/Ayuda.tsx`) se parece a una alerta (círculo con «!» que se pone rojo) y está en el título de muchas pantallas. La ciega no supo si
era ayuda o alerta y no lo tocó, y además mide 20 × 20 px (bajo el mínimo de 24). Es una pieza de todo el ERP: se decide en `/unificar`, no en Marcas.

## Lista aparte (no se ejecuta)
- «Desactivar» sin confirmación y con «Deshacer» en el aviso, **en todo el catálogo a la vez** (Familias, Tallas, Tejidos, Patrones, Etiquetas, Marcas): decisión de Felipe sobre el patrón.
- Al cerrar la hoja «Editar» con Escape, el foco cae al inicio de la página en vez de volver a su botón (/chaos TEC-06, gravedad 4).
- Un nombre de marca de 300 letras se guarda sin límite y su aviso de éxito desborda la página (/chaos ENT-03, gravedad 2–3; venía de antes del rediseño).
- «Sin productos activos · 1 descontinuado»: traducirlo a lo que la persona haría.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | Coincide: «lista de marcas con su proveedor, con buscador y filtros» |
| Primer intento | Parcial: un retroceso (borrar la búsqueda antes de filtrar) |
| Pasos | 5 de tocar o escribir (+3 de mirar); mínimo ~4 |
| Dudas | «89 marcas activas» frente a «Desactivadas 2»; «Ya las usamos 24» + «Sin productos 62» ≠ 89; «Resumen»; el «!»; el punto de «Sin proveedor» |
| Palabras no entendidas | «Resumen», «Más», «Desactivadas», «Ir a», «· 0 prod.» |
| Errores evitables | 0 (un toque por texto falló por el robot: la tarjeta del resumen cerrado seguía en la página, oculta) |

## Antes de decir «listo»
- **Concurrencia:** doble clic en «Guardar» de «Editar» → una sola petición y un solo cambio (/chaos DC-01, resistió). Dos personas editando la misma marca: no corrido (pausado).
- **Caída externa:** cortar la red y perder la respuesta al guardar: **no corrido** (la corrida de /chaos se pausó porque otra sesión escribió en la base local).
- **Persona sin contexto:** ciega pasa; colaboradora real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `3977ae87f` | 7,2 | 6 | — (primera medición) |
