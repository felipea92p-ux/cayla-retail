# Formidable · Tienda web ▸ Vitrina ▸ Probador   (`/tienda-web/vitrina/probador`, con sus 4 hojas)

- **Fecha / SHA:** 2026-10-17 · c160bbcd5 (main) · **Dispositivo que manda:** escritorio (Mac mini); 375 px pesa menos (no es Vender, Cambios ni Devoluciones)
- **Pregunta que debería resolver:** «¿Qué le falta a cada prenda para salir en «Arma el tuyo», y cómo se lo doy?» · **Protagonista:** la prenda (su foto)
- **Veredicto en una línea:** «Se entendía y se terminaba sin manual (la ciega dejó 9 de 14 listas y explicó bien las otras 5), pero contaba prendas que la tienda nunca muestra, cada fila había que leerla en dos columnas que a veces se contradecían, y el botón que tocaba estaba al fondo de la página. Los 3 cambios están hechos (2026-10-17, OK de Felipe).»

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega (Sonnet, banco con prendas inventadas y fotos reales): a los 5 s acertó qué es y qué toca; pasó de 4 a 9 listas de 14 y explicó por qué no las otras 5 (4 sin foto, 1 recorte descartado); 0 errores evitables; 13 dudas · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Medido] la única acción principal («Preparar N recortes») vive al final: a 1440×900 queda a 1765 px de arriba y a 1024×768 a 1884 px (con 14 prendas; en producción, después de 25 filas y la paginación). La única pista arriba es la tarjeta «Recortes pendientes», que baja hasta él sin decir que ahí se prepara. «Revisar N» también vive abajo |
| 3 Simplicidad profunda | 4 | [Observado] ninguna fila dice si la prenda sale; deciden Largo y Recorte, y se contradicen: «Listo» en verde junto a «Falta el largo» (3 prendas así en producción a las 11:45). La ciega: «no dice qué falta, y tuve que abrir cada prenda» |
| 4 Lenguaje de tienda | 7 | [Observado] dudas en «recortador (26 MB)» («¿dejo que baje un programa?»), «Sigue aquí» (pieza de la guía de foco), «Vestidos no tiene largo típico»; interpretó bien probador, recorte, largo típico y «2 por foto» |
| 5 Contenido primero | 6 | [Observado] la prenda va en miniatura de 40×48 px y las que no tienen foto son una caja vacía, en la fila y en su hoja (no el ícono de su categoría, ADR-0333; 18 prendas en producción) |
| 6 Lo difícil, a un toque | 6 | [Opinión] la regla («sale con su largo y un recorte listo») está siempre abierta al pie; el porqué de cada prenda no existe sin abrirla, y su hoja no muestra ni rehace sus recortes |
| 7 Perdonar antes que preguntar | 7 | [Medido, código] todo es reversible y nada pide «¿seguro?»; «Preparar» se pausa y no deja cerrar la hoja a la mitad. Pero «Descartar» no trae «Deshacer», «Revisar N» salta a la siguiente sin «Anterior», y un descarte por error es difícil de encontrar (no hay filtro «Descartadas», la fila dice «Sin recorte») |
| 8 Quitar antes de agregar | 4 | [Medido en producción] 36 de las 48 prendas de «Les falta el largo · No entran hasta anotarlo» son accesorios que el probador de la tienda nunca muestra (Accesorios de moda 22, Cinturones 4, Collares, Aretes, Pañuelos…); «Largos típicos» les ofrece caja y «Preparar» recorta sus fotos. La regla de qué entra (arriba, vestido, abajo, encima, bolso) vive solo en la tienda (`apps/tienda/lib/probador.ts`, `zonaDe`) |
| 9 De punta a punta | 5 | [Observado] una prenda sin foto y una con su recorte descartado dicen «Sin recorte» mientras la tarjeta dice «0 pendientes · Las 11 fotos tienen su recorte»; al tocar una tarjeta la lista se filtra sin decirlo (sigue «Prendas 14»); a 375 px quedan números sueltos sin su título |
| **Leyes (promedio)** | **5,7** | leyes 3 y 8 en 4; 2 y 9 en 5 |
| **Oficio visual** | **8** | [Medido, solo la pantalla] pasan blancos, contraste, foco y teclado (38 controles, Tab en orden, Escape cierra), texto mínimo, espaciado, rojos (1), sombras y orden; fallan: «Largos típicos» de 50,9 px junto a la caja de 40 px (el ícono queda encima del texto), «Preparar» 3 px fuera de su borde, y cuatro tamaños entre 12 y 13,5 px en las filas |

## Los 3 cambios de mayor impacto
1. **La pantalla cuenta solo lo que entra al probador.** Antes: lista, cifras, «Largos típicos» y «Preparar» toman todas las prendas de la web, también los accesorios que la tienda nunca muestra (36 de 48 «sin largo» en producción). Después: usan la misma regla de zonas que la tienda (arriba, vestido, abajo, encima y bolso), escrita una sola vez para las dos. Leyes 8, 3 y 9. Verifica: con los datos de producción, «Les falta el largo» baja a los 12 Conjuntos; prueba que cruza la regla de la tienda con la del ERP. Esfuerzo M. **Toca la tienda y el ERP: decide Felipe.**
2. **Una palabra por prenda: «Sale» o qué le falta.** Antes: hay que juntar Largo y Recorte, «Listo» en verde se lee «lista» aunque falte el largo, y una prenda sin foto o con su recorte descartado dice «Sin recorte». Después: la columna dice un solo veredicto, en el orden en que se arregla: «Sale» (verde) · «Falta su foto» · «Falta recortar» · «Revisa el recorte» · «Recorte descartado» · «Falta el largo»; la prenda sin foto dibuja el ícono de su categoría (ADR-0333) y las tarjetas dicen su unidad («fotos»). Leyes 3, 4 y 9. Verifica: prueba de todas las combinaciones; la ciega ya no abre cada prenda para saber qué falta. Esfuerzo S. Presentación.
3. **Lo que sigue, arriba.** Antes: «Preparar» y «Revisar» viven al final (1765 px a 1440). Después: la cabecera lleva un solo botón negro con el paso que toca, en orden: «Preparar N recortes» → «Revisar N recortes» → «Anotar N largos» (filtra la lista); sin nada pendiente, no hay botón. Leyes 2 y 1. Verifica: a 1440×900 y 1024×768 el botón está en el primer pliegue. Esfuerzo S. Presentación.

## Lo que sobra (ley 8)
Los accesorios en la lista, en las cifras y en «Largos típicos» (cambio 1). «Colores por fotografiar» pesa como las tarjetas que bloquean y no bloquea: un color sin foto entra igual (se deja, pero no debería competir con las otras tres).

## Lo que no pediste y importa más
Hoy a las 11:23 una cuenta Admin guardó en producción largos típicos para Vestidos (110), Faldas (55) y Enterizos (140): los mismos números que la caja vacía sugiere como ejemplo. El 2026-10-16 se decidió que esas categorías no tengan típico porque una mini y una maxi no miden lo mismo. Con 110 cm, cada mini o midi sale dibujada como maxi: 44 prendas dependen de esos típicos (32 vestidos, 11 faldas, 1 enterizo) y 6 ya tienen su recorte listo. Es tu decisión.

## Lista aparte (no se ejecuta)
Hecho con los arreglos chicos (OK de Felipe, 2026-10-17):
- ✓ La lista dice cuándo está filtrada: «3 de 14» y la píldora que quita el filtro. El patrón de las 13 pantallas con tarjetas que filtran sigue.
- ✓ El ícono de «Largos típicos» al lado del texto. La pieza `<Boton>` sigue dejando la trampa abierta: `<BotonAncla>` y `<BotonEnlace>`
  envuelven en `inline-flex` y `<Boton>` no.
- ✓ «Descartar» trae «Deshacer» en su aviso: el recorte vuelve tal como estaba (`registrar_recorte` con el mismo archivo). La Actividad
  muestra el descarte, pero no el «Deshacer».
- ✓ «recortador (26 MB)» → «un poco más mientras se prepara el recortador»; «La categoría Vestidos no tiene largo típico: sin el suyo, no sale
  en el probador»; y las cajas vacías de «Largos típicos» dicen «Sin típico», no un «Ej.» que invite a llenarlas.

Pendiente:
- «Anterior» en «Revisar N» y un filtro «Descartadas» en las fotos.
- La hoja de la prenda muestra y rehace sus recortes (hoy solo una línea de cuentas).
- «Todo listo.» en «Revisar» antes de decidir.
- «Largos típicos» abre con la primera caja seleccionada (una tecla la reemplaza): `focoEnLaHoja`. El aviso final no dice qué categoría cambió.
- La nota de «Preparar» dibujada a mano (`nota-cayla`), y que diga cuánto tarda la tanda (368 fotos ≈ 12–15 min).
- A 375 px, cada dato de la fila con su título (lo pide `Tabla`).

## Veredicto del escéptico
Un agente con el repo y la base de producción (solo lectura) intentó refutar cada hallazgo:
- **Confirmados (9):** las prendas sin foto como caja vacía, en la fila y en su hoja (ADR-0333); el ícono de «Largos típicos» encima del texto
  (es el único `<Boton>` del repo con ícono y texto sueltos); los «Ej.» de «Largos típicos» que contradicen la decisión del 16; el teclado
  (38 controles en orden y con foco); los números sueltos a 375 px; la lista que se filtra sin decirlo; la fila «Sin recorte» de un recorte
  descartado; «recortador (26 MB)»; y la etiqueta «Sin recorte» de las prendas sin foto.
- **Matizados (4):** el botón al fondo (hay una pista arriba, la tarjeta «Recortes pendientes», y es sobre todo la primera tanda); las «tres
  columnas» son dos (las fotos por color no frenan), y lo peor era el «Listo» verde junto a «Falta el largo»; «Vestidos no tiene» es más
  cosmético que grave; y «Descartar» se puede revertir, pero un descarte por error era difícil de encontrar.
- **Refutado (1):** la caja de búsqueda sí muestra el foco: lo dibuja su contenedor (el medidor mira solo el elemento enfocado).
- **Lo que se nos escapó (5):** la pantalla no sabía qué categorías entran al probador (cambio 1); la fila y sus recortes no se conectan desde la
  hoja de la prenda; «Largos típicos» abre con la primera caja seleccionada; la nota de «Preparar» dibujada a mano; y «Todo listo.» en «Revisar»
  antes de decidir.

## Recalificación tras los 3 cambios y los arreglos chicos (2026-10-17, OK de Felipe)
Hechos en la rama `claude/formidable-vitrina-probador`, medidos en el mismo banco y al mismo ancho:
- **Solo lo que entra:** la tabla de grupos y la zona del probador pasan a `packages/shared/src/categorias-de-la-tienda.ts`; la tienda la usa
  igual (sus 516 pruebas pasan) y el ERP deja solo las prendas, los típicos y las fotos que el probador usa (`soloLoQueEntra`, con su prueba
  que cruza cada prefijo de la tienda) [Medido]. En producción, «Les falta el largo» debería bajar de 48 a los 12 Conjuntos (se mira al publicar).
- **Una palabra por prenda:** la columna «En el probador» dice «Lista» o lo primero que le falta; las 4 prendas sin foto dicen «Falta su foto»
  y llevan el ícono de su categoría, los vestidos con recorte dicen «Falta el largo» (antes «Listo» en verde) [Medido]. `veredictoDelProbador`
  coincide con `estaLista` en todas las combinaciones (prueba).
- **El paso que toca, arriba:** «Preparar 3 recortes» queda a 152 px de arriba a 1440×900 (antes 1765) y a 268 px a 1024×768 (antes 1884);
  sin nada que recortar ni revisar, el botón pasa a «Anotar 3 largos» y filtra la lista con su píldora [Medido].
- **Arreglos chicos:** «Largos típicos» mide 39,3 px junto a la caja de 40 (antes 50,9); la lista filtrada dice «3 de 14» y lleva la píldora
  que quita el filtro; «Descartar» trae «Deshacer» en su aviso (el recorte vuelve tal como estaba); «recortador (26 MB)» pasa a «un poco más
  mientras se prepara el recortador»; «La categoría Vestidos no tiene largo típico…»; y las cajas vacías de «Largos típicos» dicen «Sin
  típico», no un «Ej.» [Medido].
- Leyes: 2 → 8, 3 → 7, 4 → 8, 5 → 7, 7 → 8, 8 → 7, 9 → 7; 1 y 6 sin cambio → **7,2** (provisional). Oficio: falla solo la jerarquía de las
  filas (Opinión) → **9** (provisional). **Falta repetir la ciega sobre la pantalla nueva** y la pasada con una colaboradora real.
- La guía interactiva se puso al día (pasos de «Preparar», «Revisar», «Anotar largos» y la palabra de cada prenda) y su huella se aceptó
  después de comprobar en el navegador que cada pieza existe en su estado. El recorredor (`guias:recorrer`) no arrancó NINGUNA demo en este
  entorno, tampoco la de Looks, que no se tocó: queda anotado aparte.

## Prueba ciega
| Medida | Resultado |
|---|---|
| Lectura de 5 s | Pasa en lo esencial: «una lista de prendas de la tienda en línea… completar lo que le falta (largo, fotos por color y recorte)»; creyó que también debía completar las fotos por color, que no frenan |
| Primer intento | En parte: de 4 a 9 listas de 14; las 5 que faltan, bien explicadas (4 sin foto, 1 recorte que descartó por un pedazo de fondo) |
| Pasos | 49 comandos (con exploración; el mínimo ronda 15) |
| Dudas | 13: «le falta algo» sin decir qué, «Sin recorte» en las sin foto, «0 pendientes» con una fila «Sin recorte», la tarjeta que filtra en silencio, «recortador (26 MB)», «Sigue aquí»… |
| Palabras no entendidas | «Sigue aquí» (pieza de la guía de foco); probador, recorte, largo típico y «por revisar», bien interpretadas |
| Errores evitables | 0. Dos toques sin efecto y «subir» que subía poco son de la herramienta de prueba, no de la pantalla. El «Quedaron huecos» del Top Estela lo puse yo en el banco para tener uno por revisar |

## Antes de decir «listo»
- **Concurrencia:** dos personas preparando a la vez: gana el último recorte de cada foto (`on conflict (foto) do update`), el otro archivo queda suelto en el almacén, sin estado imposible. Revisar toma la fila con `for update`. Dos largos a la vez: gana el último.
- **Caída externa:** si el recortador (jsdelivr y Hugging Face) no responde, cada foto falla, la hoja se pausa sola tras varias seguidas y dice «casi siempre es la conexión»; lo hecho queda guardado. Si la base no responde, la página dice «No se pudieron leer las fotos del probador».
- **Persona sin contexto:** la ciega lo resolvió en parte, sin errores; real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-17 | c160bbcd5 | 5,7 | 8 | — (primera medición) |
| 2026-10-17 | rama `claude/formidable-vitrina-probador` | 7,2 (provisional) | 9 (provisional) | los 3 cambios y los arreglos chicos |
