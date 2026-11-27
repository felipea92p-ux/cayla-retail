# Formidable · Producción ▸ «Producción más clara» (ADR-0708, PR #2043)

Rutas: `/produccion` (Resumen), `/produccion/eficiencia`, `/produccion/ordenes` con «Nueva orden», `/produccion/insumos` con sus cuatro hojas
(«Llegó una compra», «Nueva tela», «Nuevo avío», «Lo que ya tenías»).

- **Fecha / SHA:** 2026-11-26 · `7df2dcc97` (rama `claude/produccion-pantallas-revision-9c5ccd`) · **Dispositivo que manda:** escritorio (el Mac mini del Taller); 375 px se midió y pesa menos.
- **Qué es este informe:** la corrida de `/formidable` sobre el rediseño, **hasta la propuesta**. No se implementó nada: los cambios esperan el OK de Felipe (candado 1 de la skill).
- **Veredicto en una línea:** «Las cinco pantallas se leen bien en 5 segundos y las tareas se terminan; lo que falla son frases que dicen algo que no es («color vino y beige», «2 órdenes en curso», «Comprar tela»), un precio que ya no dice "sin IGV" y dos hojas que pierden lo escrito con un Escape.»
- **Ninguna ley queda bajo 5.** Las más bajas: ley 7 en «Llegó una compra» (5), ley 8 y ley 9 en Eficiencia (5), ley 9 en «Llegó una compra» (5).
- **Escala usada:** medidor y revisor de leyes, la sesión (Playwright aislado, sin agente). **7 agentes ciegos** (Sonnet, uno por pantalla u hoja, solo con capturas; cada uno usó 1 o 2 lecturas de imagen y nada más) y **1 escéptico** (14 hallazgos: 12 confirmados, 2 matizados, 0 refutados). Son más agentes que el tope «medio» de la skill (4): la tarea pidió una ciega por pantalla.
- **Ciega: pasa con salvedades en las siete · real: sin probar.** Por eso la ley 1 no pasa de 8 en ninguna.
- **Datos:** banco propio `supabase_db_cayla-prod-clara`, datos inventados cargados por la interfaz (2 telas, 2 avíos, 1 compra a crédito, 3 órdenes). Entró como `felipe@cayla.local`, líder y Admin: una colaboradora sin el módulo no ve estas pantallas, y quien no es líder no ve «Llegó una compra».
- **Lo que ya estaba anotado y no se repite aquí** (backlog de la rama): el punto medio de la cabecera y de «· opcional»; «Qué fabricar primero» y Eficiencia con planilla, sin datos en este banco; el paso 3 de Nueva orden sin rediseñar; «Ningún modelo todavía»; alto distinto de «Costó el metro» y «Cuánto había»; las seis opciones montadas de «Se cuenta en» a 375 px.

## Cómo se midió

- `medir-oficio.js` de la skill, acotado a `<main>` (pantallas) o a la hoja (`[role="dialog"]`), a **1440 × 900** y **375 × 812** (este con tacto emulado, puntero grueso). No se midió a 1024 × 768.
- Foco: Tab real, hasta 45 paradas por vista; en cada parada se comparó el estilo con foco y sin foco del control y de sus dos contenedores.
- Escape: en cada hoja, vacía y con datos escritos.
- Zona de toque real: el script de la skill mide la caja del control; una segunda sonda sumó el `::before`/`::after` y el `label` que la agrandan. Eso descartó los falsos positivos (ver «Refutado o matizado»).
- **No se corrió:** `pnpm focus`, `pnpm sugerir` ni `scripts/rendimiento/ui.mjs` (la consigna de la auditoría prohíbe `pnpm` en este worktree); modo oscuro; 1024 px; ninguna acción que guarde (nada se registró, creó ni abrió).

Capturas y medidas (carpeta de trabajo de la sesión, no versionada): `…/scratchpad/formidable/caps/`, `medidas-1440.json`, `medidas-375.json`, `medir.mjs`, `sonda.mjs`.

## Notas por pantalla (0–10)

| Pantalla u hoja | Pregunta que resuelve | Leyes | Oficio | Ley 1 (ciega) |
|---|---|---|---|---|
| Resumen | ¿Qué necesita mi decisión hoy? | **7,6** | **9** | 7 |
| Eficiencia | ¿Cuánto cuesta de verdad cada prenda? | **6,9** | **8** | 6 |
| Órdenes | ¿Dónde está cada orden y cuál pide atención? | **7,4** | **9** | 8 |
| Nueva orden | ¿Qué se fabrica y cuántas? | **7,4** | **7** | 8 |
| Insumos | ¿Qué se está acabando y cuánto queda? | **7,3** | **8** | 7 |
| Hoja «Llegó una compra» | ¿Qué llegó, de quién y cómo se paga? | **6,9** | **8** | 7 |
| Hoja «Nueva tela» | ¿Qué tela es, cómo se compra y en qué colores? | **7,6** | **8** | 7 |
| Hoja «Nuevo avío» | — | sin calificar (sin ciega) | **8** | sin probar |
| Hoja «Lo que ya tenías» | — | sin calificar (sin ciega) | **8** | sin probar |

Ninguna llega al estado `formidable` del tablero (leyes y oficio ≥ 8 y pasada real hecha).

### Detalle de las leyes

| Ley | Resumen | Eficiencia | Órdenes | Nueva orden | Insumos | Llegó una compra | Nueva tela |
|---|---|---|---|---|---|---|---|
| 1 Sin manual | 7 | 6 | 8 | 8 | 7 | 7 | 7 |
| 2 Una pregunta | 8 | 8 | 8 | 7 | 7 | 9 | 9 |
| 3 Simplicidad profunda | 7 | 6 | 6 | 8 | 7 | 7 | 8 |
| 4 Lenguaje | 7 | 6 | 7 | 7 | 7 | 7 | 7 |
| 5 Contenido primero | 8 | 9 | 8 | 7 | 8 | 8 | 8 |
| 6 Lo difícil, a un toque | 9 | 8 | 8 | 9 | 8 | 8 | 8 |
| 7 Perdonar | 9 | 9 | 8 | 8 | 8 | **5** | 9 |
| 8 Quitar | 6 | **5** | 7 | 7 | 6 | 6 | 6 |
| 9 Punta a punta | 7 | **5** | 7 | 6 | 8 | **5** | 6 |
| **Promedio** | 7,6 | 6,9 | 7,4 | 7,4 | 7,3 | 6,9 | 7,6 |

Evidencia que sostiene cada nota baja o alta (lo demás se desprende de la prueba ciega, más abajo):

- **Ley 2** [Medido]: una sola acción primaria (`.btn-primario`) en Resumen, Órdenes, Insumos y en las cuatro hojas; **dos** en Nueva orden («+ Nueva orden» de la cabecera sigue a la vista junto a «Abrir orden»); ninguna en Eficiencia, que es de lectura.
- **Ley 3, Órdenes 6** [Medido, código + Observado]: el motivo de «Falta tela» dice algo que no es (cambio 1 de Órdenes) y la ciega se lo repitió tal cual a su jefa.
- **Ley 6** [Medido]: todo «¿Por qué?» y todo «?» abre con un clic y recibe foco con Tab; ninguno depende del mouse encima.
- **Ley 7** [Medido]: Resumen, Eficiencia y la lista de Órdenes no escriben nada. «Nueva tela» y «Nuevo avío» preguntan «¿Salir sin guardar?» solo si hay algo escrito. **«Llegó una compra» y «Lo que ya tenías» se cierran con un Escape con cinco datos escritos, sin preguntar** (medido a 1440 y a 375).
- **Ley 8, Eficiencia 5** [Observado]: con un solo componente del costo, «De qué se forma» y «En qué se fue la plata» repiten la misma cifra con una barra al 100 %; «Prendas buenas 16» y «Salieron buenas: Todas» dicen lo mismo dos veces.
- **Ley 9, Eficiencia 5** [Medido, código]: el aviso «Todavía no se puede leer la planilla» sale ante **cualquier error** de la consulta (`lib/eficiencia.ts:28`) y no dice qué hacer ni quién lo resuelve.
- **Ley 9, «Llegó una compra» 5** [Medido, código]: el rótulo visible del precio ya no dice «sin IGV» y el total suma 18 % (cambio 1 de la hoja).
- **Ley 9, vacíos cuidados** [Observado]: «Nada se está agotando. Ningún modelo pide fabricar ahora.» y «Ninguna orden coincide con lo que elegiste. Limpiar filtros» dicen qué pasa y qué hacer. Sin desbordes a 1440 ni a 375 (`scrollWidth` = ancho en todas las vistas).

### Oficio visual, lo medido

Doce comprobaciones aplicables por pantalla (once en las hojas; «sin sombras» no aplica con el vidrio Serena). Dos umbrales de la skill chocan con piezas del sistema y se ajustaron, dicho aquí para que se pueda descontar: «≤ 4 tamaños de letra» se contó como falla desde 8 (la escala del repo ya tiene cinco escalones más el título) y «≤ 3 radios» desde 6.

| Vista | Fallan | Cuáles |
|---|---|---|
| Resumen | 1 de 12 | Un hueco de 1,3 px al desplegar un «¿Por qué?» (fuera de escala). |
| Eficiencia | 2 de 12 | Letra de 11 px en las cifras del gráfico y 10,5 px en su eje (pieza `BarrasTiempo`, de antes); 9 tamaños de letra a la vez (11 a 72 px). |
| Órdenes | 1 de 12 | La píldora «Piden atención» es más baja que las pestañas y el buscador de su misma fila. |
| Nueva orden | 4 de 12 | A 375 px, casillas de cantidades de 48 × 36 y «Llenar todas con» de 72 × 40, y segmentados de 35,5 px (bajo 44); tres bordes izquierdos a 336, 337 y 338 px; 9 tamaños de letra; 8 radios distintos. |
| Insumos | 2 de 12 | 9 tamaños de letra; a 375 px, huecos de 11 y 8,6 px. |
| Llegó una compra | 2 de 11 | Segmentados de 39 px a 375; el texto de «Factura», «Serie» y «Número» arranca a 378, 380 y 383 px en la misma fila. |
| Nueva tela | 2 de 11 | Segmentado de 39 px a 375; los rótulos de la tabla de colores quedan 1 px a la izquierda de sus cajas. |
| Nuevo avío | 2 de 11 | Segmentado de 36 px a 375; el mismo desvío de 1 px en la tabla de colores. |
| Lo que ya tenías | 2 de 11 | Alturas distintas en la misma fila (48 y 40 px, ya anotado); los campos plegados quedan 2 px adentro de los de arriba. |

**Pasa en todas** [Medido]: contraste del texto (0 casos bajo 4,5 : 1), foco visible en todas las paradas de Tab (anillo de 2 px, tinta o pizarra), Tab en orden visual, Escape cierra la hoja, ningún control bajo 24 px de zona real con mouse, rojo ≤ 2 por vista, sin desborde horizontal.
**Sin blocker.** El chrome global (lateral, buscador, «Cerrar sesión» de 34 × 34 a 375 px, `h1` de la cabecera 1 px corrido) no baja ninguna nota.

## Prueba ciega

Siete agentes sin contexto, una pantalla cada uno, con una tarea dicha «por la jefa» en palabras del Taller. Ninguno leyó el repo.

| Pantalla | 5 s | Primer intento | Pasos | Dudas | Signos o palabras no entendidos | ¿Terminó? |
|---|---|---|---|---|---|---|
| Resumen | Coincide: «tres cosas que están mal» | Sí, empezó por «Ver la orden →» | 5 | 7 | 14 | A medias |
| Eficiencia | Coincide: «S/ 20.91… el costo por prenda» | Sí | 7 | 9 | 16 | A medias (no supo decir si va bien o mal) |
| Órdenes | Coincide | Sí | 6 | 7 | 9 | Sí, casi del todo |
| Nueva orden | Coincide: vio los tres pasos y la ficha | Sí | 3 | 7 | 11 | A medias, casi sí |
| Insumos | Coincide | Sí; sumó bien el lino (161,92 m) | 6 | 7 | 16 | A medias (dudó entre dos botones) |
| Llegó una compra | Coincide | Sí | 13 | 11 | 18 | A medias, casi sí (duda de fondo: el IGV) |
| Nueva tela | Coincide | Sí | 10 | 10 | 14 | A medias |

### Las citas más reveladoras, textuales

**Resumen**
1. «Una orden está atrasada» y «Falta tela para cortar» están en dos columnas. Dudé si están relacionadas (¿la orden atrasada es por la tela?). No lo sé.
2. «Comprar tela»: dudé entre que compre de verdad al tocarlo o que solo me lleve a una pantalla para pedirla. No sé cuál de las dos.
3. «Ningún modelo todavía / No hay modelos para producir»: no sé qué significa.

**Eficiencia**
1. «Si vamos bien o mal»: no hay ninguna palabra como "bien", "mal" o un semáforo.
2. «Todavía no se puede leer la planilla»: dudé si es algo que me toca arreglar a mí o si es un problema del sistema. No veo botón para hacer nada.
3. «Planilla»: dudé si es una hoja de Excel que alguien tiene que subir, o los sueldos del personal.

**Órdenes**
1. Respuesta a la jefa: «…falta tela: faltan 10.9 metros de lino lavado, color vino y beige». (No existe lino beige en el Taller: beige es el color de la prenda.)
2. «Lleva ahí: Desde hoy»… Si se debía entregar hace 4 días y lleva «desde hoy» en «Por plotear», me parece raro.
3. Punto marrón arriba de «Por plotear»: no sé si avisa algo importante o es decoración.

**Nueva orden**
1. «Entrega: Sin fecha» (en B): dudé entre que sea obligatoria o no. Dice «Todo listo», así que parece que no lo es.
2. «Las ventas no piden nada ahora ¿Por qué?»: dudé entre que fuera un aviso que me bloquea o algo que puedo ignorar.
3. «Llenar todas con [1]»: no sé si es botón o casilla de escribir.

**Insumos**
1. «Llegó una compra» vs. «Anotar compra»: no sé si «Anotar compra» es avisar que hay que comprar o que ya llegó.
2. «Alcanza para 24 semanas» / «—»: … el «—» como que no se sabe o no aplica.
3. «MÁS ▾» (arriba): no sé qué hay adentro.

**Llegó una compra**
1. No sé si el 14.80 ya incluye IGV, porque abajo dice «Total con IGV»… Si ya lo incluía, el total estaría inflado.
2. «¿YA LA PAGASTE?» con una palomita verde ya marcada. Dudé entre que ya estuviera pagada, porque tiene palomita, o que no.
3. «Precio». Dudé entre precio por metro o por el total de los 40 metros.

**Nueva tela**
1. En la caja del nombre ya dice «Popelina blanca» en gris. No sé si es un texto de ejemplo o si ya está escrito.
2. Con solo la imagen A no habría sabido que los 60 metros y los 9.80 van dentro de la fila del color.
3. «SE PIERDE AL CORTAR · OPCIONAL»… dudé si 0 significa «no se pierde nada» o «no lo sé».

Palabra que se repitió en tres ciegas: **«plotear»** («no sé qué es»). Es palabra del oficio; una persona del Taller probablemente la conoce. Queda para la pasada real.

## Los 3 cambios de mayor impacto, por pantalla

«Quién decide»: **texto o distribución** = lo puede hacer quien integra, con el OK de presentación de Felipe; **dueño** = toca dinero, stock, permisos o una regla de negocio. «Origen»: nuevo de esta rama o venía de `main` (veredicto del escéptico).

### Resumen

1. **El recuadro cuenta lo mismo que la lista.** *Antes:* «2 órdenes en curso» (cuenta la muestra) y al tocarlo, Órdenes dice «En curso 1 · Muestras 1». *Después:* «1 orden y 1 muestra en curso», o solo las órdenes. *Dónde:* `apps/web/lib/produccion-en-orden.ts:62-64` (el tipo `OrdenEnCurso`, línea 51, no trae `esMuestra`; se le pasa sin filtrar en `app/(app)/produccion/page.tsx:115`). *Ley:* 9 y 1. *Verifica:* la cifra del recuadro es igual a la de la pestaña a la que lleva. *Esfuerzo:* S. *Decide:* texto. *Origen:* nuevo.
2. **La tela que falta dice para qué orden es.** *Antes:* «Falta tela para cortar · Lino lavado, color Vino»; que es para Falda Renata vive solo bajo «¿Por qué?». *Después:* la línea de la tarjeta dice «Lino lavado, color Vino, para Falda Renata». *Dónde:* `apps/web/lib/produccion-decisiones.ts:634-636` (`de: i.nombre`; el modelo ya está en `porque`). *Ley:* 3 y 1. *Verifica:* la ciega repetida responde «la orden atrasada está frenada por la tela». *Esfuerzo:* S. *Decide:* texto. *Origen:* venía de main.
3. **«Comprar tela» dice lo que hace.** *Antes:* un botón sin flecha que no compra: lleva a Insumos. *Después:* «Ver en Insumos →», con la misma flecha que «Ver la orden →» (ya existe para el caso de pedidos atrasados, en la misma línea). *Dónde:* `apps/web/lib/produccion-decisiones.ts:639` (falta `ver: true`). *Ley:* 1 y 4. *Esfuerzo:* S. *Decide:* texto. *Origen:* el botón venía de main; la flecha que lo deja distinto es nueva.

**Lo que sobra (ley 8):** el recuadro «1 tela no alcanza · Ya está en Por resolver» bajo el título «Lo demás está en orden» (`lib/produccion-en-orden.ts:88-92` y `140-141`): el título contradice al recuadro. Propuesta: que diga cuántas alcanzan o que no salga cuando su asunto ya está arriba.

### Eficiencia

1. **El aviso de la planilla dice qué pasó y qué sigue.** *Antes:* «Todavía no se puede leer la planilla · Mientras tanto se ven los materiales por prenda.» ante cualquier error. *Después:* tres líneas: qué pasó («No se pudo leer la planilla»), qué se ve igual (los materiales) y qué hacer («Vuelve a intentar; si sigue, avísale a quien administra el sistema»), con «Reintentar». *Dónde:* `apps/web/components/EficienciaTallerPanel.tsx:82-86`; la causa, `apps/web/lib/eficiencia.ts:28`. *Ley:* 9. *Esfuerzo:* S. *Decide:* texto. *Origen:* venía de main (la rama acortó el texto).
2. **Una frase de veredicto con lo que sí se sabe.** *Antes:* la cifra, el chip «Sin período anterior para comparar» y cuatro datos sueltos. *Después:* bajo la cifra, «Todas salieron buenas y la entrega fue a tiempo. Aún no hay otro mes para comparar.» *Dónde:* `apps/web/lib/eficiencia-textos.ts:63` y `121-133`. *Ley:* 3. *Verifica:* la ciega contesta «¿vamos bien o mal?». *Esfuerzo:* S–M. *Decide:* texto; **poner una meta de costo contra la cual decir «bien» o «mal» es regla de negocio y dinero: dueño.**
3. **Con una sola parte del costo, no se repite.** *Antes:* «De qué se forma: Materiales S/ 20.91» (barra llena) y «En qué se fue la plata: Tela y avíos 100 %», más «Prendas buenas 16» y «Salieron buenas: Todas». *Después:* si solo hay materiales, esos dos bloques se pliegan en una línea («Todo es tela y avíos: S/ 334.54») y queda un solo dato de calidad («16 prendas, todas buenas»). *Dónde:* `apps/web/components/EficienciaTallerPanel.tsx:184` y `211-232`; `apps/web/lib/eficiencia-textos.ts:127-131`. *Ley:* 8. *Esfuerzo:* M. *Decide:* distribución.

**Aparte (pieza del sistema, de antes):** letra de 11 y 10,5 px en `apps/web/app/estilos/graficos-tiempo.css:140` y `148`; `letra.md` no exceptúa los gráficos y el archivo figura como deuda en `lib/letra-suelta-archivos.ts:25`.

### Órdenes

1. **El motivo de «Falta tela» deja de inventar un color.** *Antes:* «Faltan 10.9 m de lino lavado, color vino y beige». *Después:* «Faltan 10.90 m de lino lavado, color vino» (y, si se quiere, «para el beige»). *Dónde:* `apps/web/lib/ordenes-lista-reglas.ts:172-174` parte el nombre por « · » y une lo demás con « y »; el tercer trozo es el color de la PRENDA, que agrega `apps/web/lib/orden-pagina-reglas.ts:1149`. La prueba `lib/ordenes-lista-reglas.test.ts:196-200` fija la lectura equivocada y hay que corregirla con el texto. De paso, «10.9 m» aquí y «10.90 m» en el Resumen. *Ley:* 3 y 9. *Esfuerzo:* S. *Decide:* texto. *Origen:* nuevo.
2. **El punto ámbar dice qué avisa.** *Antes:* un punto sobre «Por plotear», con su texto solo para lector de pantalla. *Después:* la segunda línea del tramo lo dice: «24 prendas, 1 pide atención». *Dónde:* `apps/web/components/ordenes-lista/OrdenesLista.tsx:273-277`. *Ley:* 1 y 6. *Esfuerzo:* S. *Decide:* distribución. *Origen:* nuevo.
3. **«Piden atención» se lee como filtro y se alinea.** *Antes:* una píldora más baja que las pestañas y el buscador; dos ciegas dudaron si era dato o botón. *Después:* «Solo las que piden atención», con la altura de su fila. *Dónde:* `apps/web/components/ordenes-lista/OrdenesLista.tsx:298-303`. *Ley:* 1; oficio, alturas. *Esfuerzo:* S. *Decide:* distribución. *Origen:* nuevo.

### Nueva orden

1. **El paso 3 dice que se puede dejar.** *Antes:* «Fases: Las de siempre · Tela: Sin elegir · Entrega: Sin fecha» junto a «Todo listo para abrir la orden». *Después:* el título del paso lleva «Puedes abrirla así y completarlo después». *Dónde:* `apps/web/components/orden-produccion/NivelDos.tsx:38-46` y `apps/web/lib/orden-pasos-reglas.ts:20`. *Ley:* 1. *Esfuerzo:* S. *Decide:* texto. **Si una orden debe poder abrirse sin fecha de entrega es regla de negocio: dueño** (una orden sin fecha nunca sale como atrasada).
2. **Un solo botón principal.** *Antes:* «+ Nueva orden» de la cabecera sigue oscuro con el formulario abierto, junto a «Abrir orden». *Después:* mientras el formulario está abierto, el de la cabecera baja a secundario o no se dibuja. *Dónde:* `apps/web/components/ordenes-lista/OrdenesLista.tsx:223`. *Ley:* 2. *Esfuerzo:* S. *Decide:* distribución. *Origen:* venía de main.
3. **Sin consejo, la línea de las ventas no parece un aviso.** *Antes:* un recuadro «Las ventas no piden nada ahora ¿Por qué?» antes de la tabla. *Después:* «Sin sugerencia de las ventas: pon tú las cantidades.» *Dónde:* `apps/web/lib/nueva-orden-consejo-reglas.ts:19`. *Ley:* 4 y 8. *Esfuerzo:* S. *Decide:* texto. *Origen:* nuevo.

### Insumos

1. **Una acción, un nombre.** *Antes:* «Llegó una compra» (cabecera), «Anotar compra» (tarjetas de «Por acabarse») y «Llegó más de este color» (fila) abren la misma hoja. *Después:* las tarjetas dicen «Llegó una compra». *Dónde:* `apps/web/components/InsumosPanel.tsx:193-194`, `236-237`, `702-703`; la hoja, línea 509. *Ley:* 4, 8 y 1. *Esfuerzo:* S. *Decide:* texto. *Origen:* «Anotar compra» es nuevo.
2. **La raya de «Alcanza para» dice por qué no hay dato.** *Antes:* «—». *Después:* «Nadie la pide» (como ya dice el Resumen) o «Sin consumo todavía». *Dónde:* `apps/web/components/InsumosPanel.tsx:596-601`. *Ley:* 3 y 9. *Esfuerzo:* S. *Decide:* texto.
3. **«Más» con una sola opción.** *Antes:* un menú «Más» que solo guarda «Lo que ya tenías». *Después:* el botón con su nombre, o el menú solo cuando tenga dos opciones. *Dónde:* `apps/web/components/InsumosPanel.tsx:213-214`. *Ley:* 8 y 1. *Esfuerzo:* S. *Decide:* **Felipe** (lo pidió así en la maqueta; se propone revisarlo, no se cambia solo).

### Hoja «Llegó una compra»

1. **El precio vuelve a decir «sin IGV», y de qué es.** *Antes:* rótulo visible «Precio»; «sin IGV» quedó en la etiqueta oculta y en el «?» del paso, y el total suma 18 % («Total con IGV»). *Después:* «Precio del metro, sin IGV» a la vista (el texto ya existe para el lector de pantalla). *Dónde:* `apps/web/components/insumos-taller/LlegoUnaCompraModal.tsx:203-207`; el total, línea 319. *Ley:* 9 y 3. *Verifica:* la ciega ya no pregunta si 14.80 lleva IGV. *Esfuerzo:* S. *Decide:* texto, **pero cambia cómo se lee una cifra de dinero: avisar a Felipe.** *Origen:* **nuevo; en main el «sin IGV» estaba bajo el campo.**
2. **No se pierde lo escrito con un Escape.** *Antes:* cinco datos escritos + Escape = hoja cerrada, sin preguntar. *Después:* «¿Salir sin guardar?», como en «Nueva tela» (`useSalidaSinGuardar` + `antesDeCerrar`). *Dónde:* `apps/web/components/insumos-taller/LlegoUnaCompraModal.tsx:164` y `apps/web/components/InsumoModales.tsx:93`. *Ley:* 7. *Esfuerzo:* S. *Decide:* distribución (estado de interfaz; no toca qué se guarda). *Origen:* venía de main.
3. **«¿Ya la pagaste?» no nace con un visto.** *Antes:* la pregunta lleva el visto verde de la guía desde que abre (porque «Queda por pagar» viene elegido): se lee «sí, pagada». *Después:* rótulo que no es pregunta, «El pago». *Dónde:* `apps/web/components/insumos-taller/CompraDelInsumo.tsx:128`. *Ley:* 4 y 1. *Esfuerzo:* S. *Decide:* texto. *Origen:* la etiqueta venía de main.

### Hoja «Nueva tela»

1. **El ejemplo del nombre no lleva color y se lee como ejemplo.** *Antes:* «Popelina blanca» en gris: parece ya escrito e invita a poner el color en el nombre, cuando los colores van en el paso 3. *Después:* «Ej.: Popelina stretch». *Dónde:* `apps/web/lib/sugerencias-insumos.ts:15-19` (los cinco ejemplos llevan color) y `apps/web/components/insumos-taller/NuevaTelaModal.tsx:229`. *Ley:* 9 y 4 (también es de `/sugerir`). *Esfuerzo:* S. *Decide:* texto. *Origen:* venía de main.
2. **El vacío de colores dice lo que viene.** *Antes:* «Todavía no elegiste ninguno.» *Después:* «Elige un color: ahí pones cuánto tienes y cuánto te costó.» *Dónde:* `apps/web/components/insumos-taller/NuevaTelaModal.tsx:310` (el mismo texto en «Nuevo avío»). *Ley:* 1 y 9. *Esfuerzo:* S. *Decide:* texto. *Origen:* nuevo.
3. **«Se pierde al cortar» dice qué hacer si no se sabe.** *Antes:* «0 %» en gris, sin pie. *Después:* pie «Si no lo sabes, déjalo vacío». *Dónde:* `apps/web/components/insumos-taller/PiezasDeLaTela.tsx:290`. *Ley:* 4. *Esfuerzo:* S. *Decide:* texto. *Origen:* nuevo.

### Hojas sin prueba ciega

**«Nuevo avío»** (medida; sin ciega): ① el mismo vacío de colores que «Nueva tela»; ② «Sigue» queda pegado a «Nombre» cuando lo que sigue es «Clase» [Observado en la captura; es la pieza de la guía de foco, se reporta, no se toca aquí]; ③ las seis opciones a 375 px (ya anotado).

**«Lo que ya tenías»** (medida; sin ciega): ① **viene con el primer insumo de la lista ya elegido** y la guía lo da por hecho (`apps/web/components/InsumoModales.tsx:34`), ver «Lo que no pediste»; ② se cierra con Escape con datos escritos (cambio 2 de «Llegó una compra»); ③ al abrir, la lista del combo queda desplegada y tapa «Cuánto había» y «Costó» [Medido: `listbox` abierto al abrir, a 1440 y a 375].

## Lo que no pediste y importa más

**«Lo que ya tenías» abre con «Botón nácar 1.8 cm, color Blanco» ya elegido** (el primero por orden alfabético) y con el visto verde. Quien escribe la cantidad y el costo sin mirar arriba le suma saldo y costo a un insumo que no era, y eso es stock y dinero. Viene de main (`InsumoModales.tsx:26` allá, `:34` aquí). Propuesta: que abra sin nada elegido cuando no se llegó desde un insumo. **Decide Felipe** (cambia cómo nace un ingreso de stock).

## Lista aparte (no se ejecuta)

- «Lleva ahí · Desde hoy» junto a «Hace 4 días» desconcierta (dato del banco: la orden se creó hoy con fecha pasada).
- «Todas 1» y «Por plotear 1» se leyeron como posible doble cuenta.
- «Urgente» y «Atrasada» en la misma fila: ¿dos avisos o uno?
- La fila del título de paso en las hojas junta cinco signos («① ◉ Qué llegó · Sigue · ? · 1»); la ciega de la compra listó 18 signos no entendidos.
- «Emisión del papel: 26 de noviembre» no dice si se puede cambiar.
- «Llenar todas con [1]»: el 1 gris se lee como valor (pieza compartida, `components/alta-producto/MatrizCantidades.tsx:225`).
- «Tejido · conviene»: «conviene» se leyó como «casi obligatorio» (pieza de la guía de foco).
- «Admin · queda a tu nombre»: dudaron tres ciegas (pieza de todo el ERP).
- «Rinde 3.47 metros por kilo» y «Valor de lo guardado · Mostrar»: entendidos a medias.
- A 375 px: casillas de cantidades de 48 × 36 y segmentados de 35,5 a 39 px (piezas compartidas).
- En la sonda, el saldo de «Botón nácar, color Blanco» pasó de 623 a 620 entre dos lecturas: otra auditoría escribía en el mismo banco a la vez. Ninguna cifra de este informe depende de ese dato.

## Refutado o matizado

- **REFUTADO:** «?» de 14 × 14 px bajo el mínimo. Agranda su zona con `::before` a 32 px (mouse) y 44 px (dedo), `app/estilos/ayuda-cabecera.css:46-51, 76-90`.
- **REFUTADO:** más de dos rojos en Insumos (4) y en «Llegó una compra» (4). Eran «Retirar color» dentro de menús plegados y los dos trazos de la opción elegida de un segmentado.
- **REFUTADO:** cajas de texto de 42 px a 375. Lo medido es el `<input>` de adentro; su caja tiene `min-height: 44px` (`app/estilos/tacto.css:12-27`). Inferido del CSS.
- **REFUTADO:** texto de 10,5 y 11,5 px. Es el signo «?» dentro de su círculo, exceptuado con `letra-fija` en su CSS.
- **MATIZADO:** «Abrir calendario» de 20 × 20 con mouse: es la pieza del campo de fecha; no se midió su zona agrandada.
- **MATIZADO:** el interruptor (38 × 22), «Separar por talla» (21 px de alto) y la casilla (20 × 20): agrandan su zona (`tacto.css:49-59`) o viven dentro de un `label`.
- **MATIZADO (H4 del escéptico):** la falta de «¿Salir sin guardar?» y su diferencia con «Nueva tela» venían enteras de main.
- **Ruido del script, sin contar:** 1 a 3 px entre textos `sr-only`, el interior de píldoras y el texto dentro de una caja.

## Antes de decir «listo»

- **Concurrencia:** sin probar (no se guardó nada; es terreno de `/chaos`).
- **Caída externa:** observada sin querer: Eficiencia sin poder leer la planilla muestra los materiales y avisa, pero el aviso no dice qué hacer (cambio 1 de Eficiencia). Base caída: sin probar.
- **Persona sin contexto:** las siete ciegas leyeron bien la pantalla en 5 s y completaron o casi completaron su tarea. Colaboradora real: **sin probar**. Otra cuenta que no sea líder y Admin: **sin probar**.

## Historial

| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-11-26 | `7df2dcc97` | Resumen 7,6 · Eficiencia 6,9 · Órdenes 7,4 · Nueva orden 7,4 · Insumos 7,3 · Llegó una compra 6,9 · Nueva tela 7,6 | 9 · 8 · 9 · 7 · 8 · 8 · 8 (avío 8, saldo 8) | — (los cambios esperan el OK de Felipe) |

Informes anteriores de estas pantallas, que no se tocaron: `produccion-resumen.md` (2026-10-27, leyes 4,8), `produccion-nueva-orden.md` (5,4) y `produccion-modulo.md` (línea base 5,5 y la medición del 2026-10-15).
