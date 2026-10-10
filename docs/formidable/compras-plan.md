# Formidable · Compras ▸ Plan de campaña   (`/compras/plan`, con su hoja de categoría, el paso a paso, «Poner el tope» y «Nueva campaña»)

- **Fecha / SHA:** 2026-10-10 · `b274c507` (rama `claude/elegant-bose-201880`, ya fusionada en `main` como `b4edf77d`) · **Dispositivo que manda:**
  escritorio (Mac mini o laptop de quien compra). 375 px se mide, pesa poco: es una pantalla del líder.
- **Pregunta que debería resolver (1 frase):** «¿Cuánto le compro al proveedor de cada categoría para diciembre?» · **Protagonista:** la categoría y su
  «Comprar N».
- **Veredicto en una línea:** «Se entiende en 5 s qué es y se completa al primer intento, pero el número que más decide la compra («Lo que sobra») se
  llena a ciegas, y la respuesta de la hoja queda fuera de la vista mientras se escribe.»
- **Escala de esta corrida:** medición del DOM a 1440, 1024 y 375 px (yo) · **una** prueba ciega (1 agente, Sonnet, en el navegador local con datos
  inventados) · **un** escéptico (1 agente, Opus, código + navegador). Sin revisor de leyes en agente: lo hice yo. Base local restaurada después.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 5 | [Observado] ciego: a los 5 s dijo «planificación de compras de diciembre por categoría, con tres escenarios»; completó la tarea al primer intento (19 acciones). Pero puso «Lo que sobra = 60» sin saber qué era, y con el margen de CAYLA ese número infla la compra (ver «Lo que no pediste»). · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Medido] según el estado hay 0 primarios (todas las que más venden con plan) o hasta 10 «Armar plan» primarios a la vez (`FilaCategoria.tsx:55`); nunca uno |
| 3 Simplicidad profunda | 5 | [Medido] el porqué dice «se compra para cubrir 62 de cada 100 diciembres posibles» (un cuantil); «Lo que sobra» es un parámetro crudo, sin veredicto en su lugar |
| 4 Lenguaje de tienda | 6 | [Observado] no entendió «Por llenar primero»; dudó con «Hay hoy», «Curva de tallas · Suma 100 %» y «Lo que sobra». [Opinión] «en la red» y «escenarios» son jerga |
| 5 Contenido primero | 4 | [Medido] la lista empieza en y = 930 px a 1024 × 768 (bajo el pliegue) y en y = 818 a 1440 × 900; en la hoja, «Comprar N · S/» empieza en el px 911 de 1350 y se ven 802 |
| 6 Lo difícil, a un toque | 6 | [Medido] la explicación del cálculo y la de la curva están siempre a la vista; no hay «¿Por qué?» que las guarde |
| 7 Perdonar antes que preguntar | 4 | [Observado] Escape o clic fuera con la hoja a medio llenar la cierra y se pierde todo, sin preguntar; en el paso a paso, «Saltar», otra categoría o «Tabla» también lo pierden (`PasoAPaso.tsx:73, 169`). El ERP ya tiene la pieza: `useSalidaSinGuardar` |
| 8 Quitar antes de agregar | 6 | [Opinión] «En enero, al lado, lo que se vendió de verdad» en el subtítulo antes de que empiece la campaña; las 7 cajas de la curva siempre abiertas aunque vienen propuestas |
| 9 De punta a punta | 5 | [Medido] (chaos) un `?plan=` que no existe dice «no hay ninguna campaña» y no deja salir; un número enorme da un error técnico; si la respuesta se pierde dice «No se guardó nada» aunque se guardó; a 375 px las píldoras del aviso se salen de su tarjeta |
| **Leyes (promedio)** | **5,1** | dos leyes en 4 (contenido primero, perdonar) |
| **Oficio visual** | **7** | [Medido] 7 pasan, 3 fallan: alineación (las 3 cajas de diciembre a 354, 339 y 321 px de alto y saltan mientras se llenan), jerarquía (6 tamaños de texto propios), alturas de una fila (el selector de campaña mide 30,5 px junto a «Exportar» de 40). Lo que falla del marco global no cuenta: el «/» del buscador 3,6 : 1, la opción inactiva del segmento «modo» 4,13 : 1, la lupa del buscador que no pone el foco |

## Los 3 cambios de mayor impacto
Felipe dio el OK el 2026-10-10 («Termina lo que te falta e implementa»). Ninguno cambia el cálculo ni una regla de dinero.
1. **La hoja dice la respuesta mientras escribes y no pierde lo escrito.** Antes: «Comprar N · S/» al fondo, fuera de la vista; Escape lo borraba todo.
   Después: la respuesta va en el pie fijo, junto a «Guardar»; los campos en una grilla que no salta; salir con cambios pregunta («¿Salir sin guardar?»),
   también en el paso a paso. Leyes 5 y 7, oficio. Esfuerzo M. Se verifica: escribir sin hacer scroll y ver la cifra; Escape con cambios pregunta.
2. **Las preguntas de la hoja en palabras de tienda.** Antes: tres cajas «Venderías» que parecían opciones, «Lo que sobra» sin explicación, un cuantil
   en el porqué. Después: una pregunta que agrupa los tres diciembres, «Lo que sobra» dice qué es y qué produce («con 60 %, sobrar casi no te cuesta: se
   compra para un diciembre bueno»), el porqué sin «de cada 100», cada caja con su nombre para el lector de pantalla, «Hay hoy» sin «en la red» y «Las
   que más venden, sin plan» en vez de «Por llenar primero». Leyes 1, 3 y 4. Esfuerzo M. Se verifica: el mismo recorrido ciego, sin esas dudas.
3. **La primera vista lleva a la lista y a una sola acción.** Antes: subtítulo de 3 líneas, aviso alto, 0 o hasta 10 primarios. Después: subtítulo de
   una línea (lo de enero solo cuando empieza), aviso más corto con píldoras que caben, UNA acción primaria («Empezar por <la que más vende sin plan>»),
   las filas en secundario y el selector a la altura de «Exportar». Leyes 2, 5 y 9, oficio. Esfuerzo S. Se verifica: medir dónde empieza la lista a
   1024 × 768 y contar los primarios.

## Lo que sobra (ley 8)
- La frase «En enero, al lado, lo que se vendió de verdad» antes de que empiece la campaña: no ayuda a decidir hoy.
- Las 7 cajas de la curva siempre abiertas: vienen propuestas por el sistema (va a la lista aparte: plegarlas con un resumen «XS 1 · S 1 · M 3…»).

## Lo que no pediste y importa más
**«Lo que sobra» decide cuánto se compra, y hoy lo escribe cada quien, por categoría, sin dato.** Con el margen de CAYLA (Vestidos: precio 143,23,
costo 55,33), desde un 18 % el sistema ya compra por encima del 75 % de los diciembres posibles, y desde un 39 % compra para el diciembre bueno
(`cuantilCritico`, `plan-compra-reglas.ts:183`). El ciego puso 60 sin saber qué era. Propuesta (regla de dinero: decide Felipe): un solo porcentaje de
CAYLA, lo que de verdad se recupera en la liquidación de enero, fijado por un líder y puesto como valor de partida en cada categoría.

## Lista aparte (no se ejecuta sin que Felipe lo mande)
1. Plegar la curva de tallas con un resumen por talla (ley 8).
2. Global · `Buscador`: un clic en la lupa no pone el foco en la caja y lo tecleado se pierde (`Buscador.tsx:132`, `e.target === e.currentTarget`).
3. Global · `SegmentoDeslizante forma="modo"`: la opción inactiva mide 4,13 : 1.
4. Una fila con plan no dice que se puede corregir (sin flecha ni texto).

## Refutados o matizados por el escéptico
- F1 matizado: a 1440 × 900 la primera fila entra justo en el borde (y = 818, no 846); dos de las cuatro cifras son la respuesta total, no marco.
- F2 matizado: con los datos del local había 0 primarios; en una campaña sin planes hay 5 (y en producción, hasta 10).
- F8 matizado: de la pantalla solo es el selector de 30,5 px; «Poner un tope» (24 px) e «Ir a Conteo» (29 px) cumplen el mínimo y son de sus piezas.
- F10 matizado: «flojo / normal / bueno» e «Inversión al costo» son lenguaje de quien compra; la jerga real es «en la red», «escenarios» y el cuantil.
- F11 confirmado pero global (Buscador): no baja la nota de esta pantalla.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «Pantalla de planificación de compras de diciembre por categoría, con tres escenarios; sigue buscar abrigos y armar su plan; «Exportar» saca la lista» — coincide |
| Primer intento | Sí, sin retroceder (el buscador no filtró la primera vez: clic en la lupa, defecto global) |
| Pasos | 19 acciones + un scroll (mínimo razonable ~16) |
| Dudas | «Armar plan» (¿guarda o abre?), «Diciembre flojo / normal / bueno» (¿tres cajas o elegir una?), «Lo que sobra · Lo vendes al % de tu precio» (no supo qué poner: puso 60), «Curva de tallas · Suma 100 %» (¿la toco?), «Exportar» (¿es la lista del proveedor?) |
| Palabras no entendidas | «Hay hoy», «Curva de tallas», «Lo que sobra», «Por llenar primero» |
| Errores evitables | El buscador no filtró al primer intento (global) |

## Antes de decir «listo»
- **Concurrencia:** dos personas guardando la misma categoría: la última pisa a la otra sin aviso (chaos NAV-05, gravedad 2). Se arregla con el candado
  de versión de ADR-0193 (migración B4; producción espera el OK puntual de Felipe).
- **Caída externa:** sin internet, la hoja avisa y conserva lo escrito (chaos RS-01); si la respuesta se pierde, decía «No se guardó nada» aunque se
  guardó (chaos RS-03): se corrige con el aviso honesto del sistema.
- **Persona sin contexto:** el ciego completó la tarea; real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-10 | `b274c507` | 5,1 | 7 | — (primera medición) |
