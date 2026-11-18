# Formidable · Inventario ▸ Recibir mercadería ▸ Recibir un envío de orden de compra   (`/recibir` y `/recibir/envio/[id]`)

- **Fecha / SHA:** 2026-10-12 · fase 5a (`claude/purchase-order-phase5-9b0c82`) · **Dispositivo que manda:** escritorio (el de la tienda)
- **Pregunta que debería resolver (1 frase):** «¿Qué llegó en esta caja, está completo y ya puedo venderlo?» · **Protagonista:** la prenda
- **Veredicto en una línea:** «Una colaboradora nueva la termina sola —crea las prendas, cuenta, marca la dañada y el faltante— pero le cuesta
  encontrar el botón de SU envío, y si sale de la pantalla a medio contar pierde lo contado (la prenda que creó sigue en el catálogo,
  pero la tiene que volver a elegir).»

> Informe parcial, hecho de noche sin el panel del navegador visible: **prueba ciega** con un agente (Opus) que maneja la pantalla real del banco
> por una ventana que devuelve texto y captura (sin memoria entre llamadas: cada llamada repite los pasos), **sin medir el oficio visual** ni
> escéptico. Algunas trabas son de esa ventana y se marcan.

## Notas (0–10, provisionales)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega: recibió ENV-000401 completo («16 prendas al almacén, 1 a cuarentena · falta 1»), con dos prendas nuevas, el polo roto en cuarentena «con arreglo» y el faltante «No vino» · real: sin probar |
| 2 Una pregunta, una respuesta | 5 | [Observado] cinco cosas dicen «Recibir» en la misma pantalla y el botón de la fila no dice de qué envío es; abajo, el formulario a mano tiene «SIGUE AQUÍ» encendido y «Faltan: De quién, Qué llegó», que compite con la tarjeta de envíos |
| 7 Perdonar antes que preguntar | 6 | [Observado] en «Es nueva» las tallas S, M y L vienen marcadas pero el pie dice «Faltan: Tallas» / «Sin elegir: Tallas»; en los vestidos venía marcada una L que no llegó |
| 9 De punta a punta | 5 | [Observado] la prenda creada con «Es nueva» no quedó unida a su línea al volver a entrar: lo contado vive en la pantalla y se pierde al recargar (con la ventana de la prueba pasa en cada llamada, pero en la tienda pasa con un F5, una sesión que vence o una pestaña cerrada) |
| Oficio visual | sin medir | — |

## Los 3 cambios de mayor impacto (esperan tu OK)
1. **Antes →** en la tarjeta «Envíos de órdenes de compra para esta sede», cada fila tiene un botón «Recibir» que no dice de qué envío es, y el
   formulario a mano de abajo arranca con «SIGUE AQUÍ» encendido. **Después →** toda la fila se toca y el botón dice «Recibir ENV-000401»; mientras
   haya envíos por recibir, la guía del formulario a mano no se enciende sola (empieza cuando la persona lo toca). **Ley:** 2 y 1. **Se verifica:**
   la misma prueba ciega llega a su envío al primer toque. **Esfuerzo:** S. **Decide:** Felipe (presentación).
2. **Antes →** lo contado (la prenda elegida o creada, las cantidades, las dañadas, las causas) vive solo en la pantalla: un F5 o salir lo
   borra. **Después →** se guarda en el navegador de la tienda, por envío, hasta recibir (como un borrador; nunca en la base, nunca compartido);
   al volver, «Seguías contando: 11 de 18». **Ley:** 9 (y el principio 9: nada se pierde). **Esfuerzo:** M. **Decide:** Felipe (presentación).
3. **Antes →** «Es nueva» trae las tallas «de siempre» marcadas (S, M y L) aunque no hayan llegado, y aun así dice que faltan tallas.
   **Después →** arranca sin tallas ni colores elegidos y crea solo lo que la persona marca («las que llegaron»). **Ley:** 7 y 1. **Esfuerzo:** S.
   **Decide:** Felipe (presentación; no cambia qué se guarda).

## Lo que no pediste y importa más
Con dos colores y tres tallas, «Es nueva» crea las 6 combinaciones aunque solo llegaron 3 (S y M blanco, L negro): la prenda nace con variantes en
cero que después aparecen en Existencias y en las etiquetas. Contar primero y crear la prenda con lo contado cambiaría el orden de la pantalla:
vale la pena decidirlo antes de que la usen las tiendas.

## Lista aparte (no se ejecuta)
- **Arreglado esta noche (error, no presentación):** en «Llegó esta semana» la recepción de las 22:17 del 12/10 salía con fecha 13/10: la fecha
  corta de Compras cortaba el instante en UTC. Ahora un instante se lee en Lima (`fechaCorta`, con su prueba).
- En «Llegó esta semana», un envío de orden muestra costo «—» y cuenta «6 líneas» (cinco combinaciones buenas + la dañada a cuarentena).
- «Imprimir 17 etiquetas» incluye la prenda dañada que está en cuarentena: ¿se etiqueta ya o cuando se arregle?
- El nombre que se escribe se guarda con mayúscula en cada palabra («Polo Cuello Redondo»): es la regla del catálogo, pero sorprende.
- No hay un «Azul» solo entre los colores: la persona eligió «Azul marino». Crear un color desde la recepción no existe (y quizás no debe).
- «Eres admin: no necesitas autorización» en el formulario a mano (es de antes de esta fase) confundió a una encargada que es líder.
- Las esperas «Está tardando más de lo normal» son del servidor de desarrollo compilando cada ruta la primera vez.
- Trabas de la ventana de la prueba (no de la pantalla): un clic por texto que tomó el primer «Recibir» de la cabecera; elegir en la lista de
  tejido.

## Prueba ciega (2026-10-12, Opus, cuenta de Sandra en Tienda Trujillo, banco)
| Medida | Resultado |
|---|---|
| Lectura de 5 s | «la pantalla para registrar la mercadería que llega»; vio su envío arriba con su botón «Recibir» |
| Primer intento | no: los primeros «Recibir» la llevaron a otra cosa (en parte, la ventana de la prueba) |
| Pasos | 20 |
| Dudas | 18 prendas en la guía contra 17 en la mano; cinco «Recibir»; el formulario a mano encendido; «la compra ya no se puede anular»; tallas marcadas y «faltan tallas»; 6 combinaciones para 3 que llegaron; si la dañada va arriba y abajo; «No vino» o «Se perdió en el camino» |
| Palabras no entendidas | «Abierto» (entendió «alguien ya empezó a contar»), «Patrón» (creyó que era el molde), «Admin», la «—» de la matriz |
| Errores evitables | la prenda creada se «olvidó» al volver; quitar la L tocando «✓ L» no respondió. [Medido] crearla otra vez con el mismo nombre no se puede: la base lo frena en la misma marca (`nombre_duplicado`, también entre dos sedes a la vez) y la hoja ofrece elegir la que ya existe; con un nombre distinto sí quedarían dos |
| ¿Terminó? | sí: «ENV-000401 recibido · 16 prendas al almacén, 1 a cuarentena · falta 1», con «cómo se cerró» y su nota |

## Antes de decir «listo»
- Concurrencia: [Medido] dos personas reciben el mismo envío a la vez → entra una sola vez (stock 4, un movimiento) y la otra lee «Este envío ya se recibió».
- Caída externa: el corte de señal dice «no sabemos si llegó: vuelve a pulsar sin cambiar nada» y el token hace seguro el reintento.
- Persona sin contexto: ciega ✓ (arriba) · real: sin probar.

## Después (2026-10-13, aprobado por Felipe: «Sí, así»)
1. **La fila entera se toca** y el botón dice su envío («Seguir recibiendo ENV-000402»): un clic de mouse sobre el texto de la fila lleva al
   envío (comprobado en el banco con Sandra en Tienda Trujillo). Mientras haya envíos que la persona puede recibir, la guía del formulario a mano
   no se enciende sola (sin «Sigue aquí» ni «Falta: …»); despierta en cuanto se toca. Si todos los envíos los hizo quien mira («La recibe otra
   persona»), la guía se enciende como siempre: no hay nada que recibir arriba.
2. **Lo contado no se pierde: no se guarda en el navegador** (Felipe lo quitó de Recibir en ADR-0129). El aviso antes de salir ya existía en el
   envío (`useSalidaSinGuardar`: recargar, cerrar la pestaña, «atrás» y los enlaces de adentro); la prueba ciega lo perdía porque su ventana
   recargaba la página en cada paso. Sin cambio de código.
3. **«Es nueva» sin tallas marcadas**: XS a Estándar arrancan sin elegir y «Tallas» está en «Falta: …» hasta marcar las que llegaron. El resumen
   «Se crea 1 combinación: Única» ya no sale sin tallas marcadas (decía algo que no iba a pasar).

---

# Re-análisis · la cara A de ADR-0393: contar primero (2026-10-13 · `69df902e6`)

- **Dispositivo que manda:** escritorio (el de la tienda); 375 px sin desbordes [Medido].
- **Pregunta que debería resolver:** «¿Cuántas llegaron de cada cosa, y qué falta para poder venderlas?» · **Protagonista:** la prenda contada.
- **Veredicto en una línea:** «Una persona nueva abre un envío sin aviso, cuenta y cierra en 13 acciones sin retroceder; al final no entiende
  que sus prendas están guardadas pero todavía no se pueden vender.»
- **Lo de la fase 4 que esto cierra:** el cambio 3 de arriba (un F5 borraba lo contado) lo resuelve el diseño: cada número se guarda solo. El
  cambio 1 (de qué envío es cada «Recibir») sigue abierto.

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 7 | [Observado] ciega (Sonnet): terminó la tarea en 13 acciones, 0 retrocesos, sin trabarse · real: sin probar |
| 2 Una pregunta, una respuesta | 8 | [Observado] cada paso tiene un botón principal («Empezar a contar», «Agregar y contar», «Pasar a cerrar», «Cerrar el envío»); el ciego no dudó de qué tocar |
| 3 Simplicidad profunda | 6 | [Observado] al cerrar esperaba «las 5 faldas en el inventario»; la pantalla dice «Todavía nada entró al stock · Esperan sus pendientes» y no lo leyó como «falta esto para venderlas» |
| 4 Lenguaje de tienda | 6 | [Observado] no entendió «Qué prendas son puede quedar para después», ni «Al stock» en la tabla de cierre, ni «Admin · queda a tu nombre» (pieza común del combo Responsable); «fardo» lo interpretó bien como «la caja» |
| 5 Contenido primero | 8 | [Observado] la categoría y su número son lo más grande; la persona contó sin buscar |
| 6 Lo difícil, a un toque | 7 | [Opinión] las causas traen su ayuda; «¿Qué faldas son?» está a un toque y dice que es opcional |
| 7 Perdonar antes que preguntar | 8 | [Medido] se guarda solo, se reabre, el reintento no repite (chaos, semilla 393) |
| 8 Quitar antes de agregar | 7 | [Opinión] la tarjeta «Quién cuenta» ocupa una franja entera para una línea de explicación |
| 9 De punta a punta | 8 | [Medido] vacíos que dicen qué hacer, errores en palabras (tras el chaos), modo oscuro sin hallazgos, 375 px sin desbordes |
| **Leyes (promedio)** | **7,2** | ley 3 y ley 4 en 6 |
| **Oficio visual** | **8** | [Medido] lo que falla es del marco común («Salir» 37×16, el atajo «Ctrl K» en 3,3:1); de la recepción: etiquetas de 11 px del sistema, bordes a 1–2 px y «4 líneas» en 3,8:1 (pieza de «Llegó esta semana», heredada) |

## Los 3 cambios de mayor impacto (esperan tu OK)
1. **Antes →** cerrado sin nada en el stock: «Todavía nada entró al stock · Esperan sus pendientes · Al stock entra lo que tiene tallas y
   colores: resuelve los pendientes de abajo y entra solo». **Después →** un veredicto y una acción: «Las 5 faldas están guardadas en el
   almacén, pero todavía no se pueden vender. Falta decir qué modelo es cada una, con su talla y su color.» y el botón «Separarlas ahora»
   (abre el primer pendiente). **Ley:** 3 y 2. **Se verifica:** el ciego, al terminar, dice qué le falta para venderlas. **Esfuerzo:** S.
   **Decide:** Felipe (presentación).
2. **Antes →** «Abre el fardo y cuenta por categoría. Qué prendas son puede quedar para después: lo esencial es el número.» **Después →**
   «Abre el fardo y cuenta cuántas llegaron de cada tipo de prenda. Qué modelo es cada una lo puedes decir ahora o después.» (mismo texto
   en la puerta de Recibir). **Ley:** 4. **Se verifica:** ninguna duda sobre esa frase en la ciega. **Esfuerzo:** S. **Decide:** Felipe.
3. **Antes →** la tabla de cierre dice «Al stock 0 · 5 para después». **Después →** la columna se llama «Se pueden vender» y el pie, sobre
   el botón, dice «Al cerrar: 0 se pueden vender ya · 5 quedan guardadas para terminar después». **Ley:** 1 y 3. **Se verifica:** la ciega no
   duda en la tabla. **Esfuerzo:** S. **Decide:** Felipe.

## Lo que sobra (ley 8)
- La tarjeta «Quién cuenta» con su explicación larga: se propone dejar el combo y una línea («Cada categoría guarda quién la contó»).

## Lo que no pediste y importa más
Las prendas guardadas sin separar están en el almacén y no en el sistema: si alguien vende una antes de separarla, Vender no la encuentra y
termina en «Prenda sin registrar». El aviso del Inicio se vuelve urgente a los 7 días; vale mirar en la primera semana real cuántos días
pasan entre cerrar y terminar, y si hace falta que el aviso llegue antes.

## Lista aparte (no se ejecuta)
- «Admin · queda a tu nombre» en el combo Responsable confunde a quien se ve como «Líder» abajo (pieza común: decisión aparte).
- La lista de marcas al agregar una categoría: en el banco solo hay «CAYLA»; con 75 marcas en producción, mirar que las del proveedor
  salgan primero (ya lo hace por `marca_proveedores`).

## Prueba ciega (2026-10-13, Sonnet, cuenta de Sandra en Tienda Trujillo, banco propio)
Tarea: «Llegó una caja de Confecciones del Sur que nadie avisó; trae 5 faldas; regístrala y termina de recibirla». La maneja por un arnés que
da captura + lista numerada de lo que se toca (sin leer el repositorio).

| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «Recibir mercadería, donde se anota lo que llega»; eligió «¿Llegó algo sin aviso?» porque nadie avisó |
| Primer intento | ✓ cerró el envío sin retroceder |
| Pasos | 13 (mínimo ≈ 11) |
| Dudas | «CAYLA SAC» como proveedor; «La marca» solo con CAYLA; «Admin» vs «Líder»; costo «sin costo»; «Al stock 0 / 5 para después»; si tenía que tocar «Hacer ahora» al final |
| Palabras no entendidas | «Qué prendas son puede quedar para después»; «Al stock»; «Tallas y colores» como requisito del stock; «Admin» |
| Errores evitables | 0 |

## Antes de decir «listo»
- **Concurrencia:** dos personas contando la misma categoría: gana la última con aviso; dos cerrando: un solo cierre (pruebas de la base con
  dos sesiones reales; doble clic en el navegador, chaos 393).
- **Caída externa:** sin la base de ADR-0393 la pantalla sigue con la fase 4; con la red caída, el mensaje dice que se puede reintentar sin
  repetir (chaos 393).
- **Persona sin contexto:** ciega ✓ (arriba); real: sin probar.

## Los 3 cambios, aplicados con el OK de Felipe (2026-10-14)

1. **Cerrado sin nada en el stock** → «Las 5 prendas están guardadas, pero todavía no se pueden vender» · «Están en el almacén. Para
   venderlas falta decir qué modelo es cada una, con su talla y su color.» · botón «Separarlas ahora» (abre lo primero de «Para
   después»). El texto cambia según lo pendiente (separar, tallas o crear) y en singular. Siempre «prendas»: «las 5 polos» no concuerda.
2. **La frase de arriba** (al contar y en la puerta) → «Abre el fardo y cuenta cuántas llegaron de cada tipo de prenda. Qué modelo es
   cada una lo puedes decir ahora o después.»
3. **El cierre** → la columna «Al stock» se llama «Se pueden vender» (la celda dice «N guardadas»), y sobre el botón: «Al cerrar: 0 se
   pueden vender ya · 3 quedan guardadas para terminar después.»

Reglas puras con prueba: `veredictoDelCerrado`, `resumenDelCierre` y `textoResumenDelCierre` (`lib/recepcion-conteo-reglas.ts`). Las guías
de `/recibir` y `/recibir/envio/[id]` dicen lo mismo (bienvenida, tabla del cierre y «Lo que sigue») y se recorrieron de nuevo.

**Verificación.** [Observado] Segunda ciega (Sonnet, misma tarea, sin el repositorio): 14 acciones, 0 retrocesos. Al terminar dijo con
sus palabras: «están contadas y guardadas en el almacén, pero NO están listas para vender; falta que alguien diga qué modelo es cada
falda, con su talla y su color». Ya no dudó de la frase de arriba ni de la columna del cierre. [Medido] A 1440 px, en el cierre y en el
cerrado: 0 blancos bajo el mínimo, 0 contrastes bajos y una sola acción principal por vista.

| Eje | Antes | Después | Evidencia |
|---|---|---|---|
| 1 Sin manual | 7 | 8 | [Observado] dos ciegas ✓; la segunda entiende el estado final · real: sin probar (tope 8) |
| 3 Simplicidad profunda | 6 | 8 | [Observado] el veredicto se lee como «falta esto para venderlas» |
| 4 Lenguaje de tienda | 6 | 7 | [Observado] sin dudas en la frase ni en la columna; quedan «Dijeron» y «Admin» (pieza común) |
| 8 Quitar antes de agregar | 7 | 7 | [Observado] con un solo pendiente, «Separarlas ahora» y «Hacer ahora» hacen lo mismo |
| **Leyes (promedio)** | **7,2** | **7,6** | las demás leyes, sin cambio |
| **Oficio visual** | **8** | **8,5** | [Medido] lo que falla es del marco común |

**Lista aparte, nueva (no se ejecuta sin que Felipe lo mande):**
- Con un solo pendiente, el botón del veredicto y el «Hacer ahora» de la fila hacen lo mismo (la ciega dudó si eran distintos).
- «Llegó esta semana» lee los lotes: un envío cerrado sin nada en el stock no aparece, y la ciega creyó que nada había llegado hoy.
- «Recibir sin guía» (una orden directa) y «¿Llegó algo sin aviso?» conviven en la puerta y se confunden (lo toca #1040).

## Prueba ciega (2026-10-14, Sonnet, cuenta de Sandra en Tienda Trujillo, base propia, diseño de la maqueta A)
Tarea: «Llegó un paquete que Compras no avisó, no sabemos de quién es; trae 4 casacas sin marca. Regístralo y termina de recibirlo; Compras
responde que es de Confecciones del Sur».

| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «la pantalla para anotar lo que llega»; encontró «¿Llegó algo que no está en la lista?» como su caso |
| Primer intento | ✓ cerró ENV-000004 sin retroceder |
| Pasos | 13 (10 clics, 1 escritura, 2 teclas solo para desplazarse); mínimo ≈ 9 |
| Al final | ✓ explica sola que las 4 casacas están guardadas, que todavía no se venden y que falta decir qué modelo es cada una («Hacer ahora») |
| Nota de la ciega | 8/10 |
| Dudas | la tarjeta sin aviso queda bajo el pliegue con una lista de Compras arriba; si «Sin marca» y el costo vacío estaban bien; el buscador «Buscar entre Casacas · Sin marca» bajo el contador (no lo tocó: es opcional) |

**Lista aparte, de esta ciega (no se ejecuta sin que Felipe lo mande):** con envíos de Compras y pendientes arriba, la tarjeta sin aviso
queda bajo el pliegue a 900 px de alto; el costo vacío en un envío sin aviso podría decir «llega con la factura» también a quien ve el
dinero (hoy dice «S/ sin costo»).

## Re-análisis 2026-10-29 — las piezas «B» (ADR-0575)

- **Fecha / SHA:** 2026-10-29 · `2a4e72e55` · **Dispositivo que manda:** escritorio (1440 × 900), con 1024 × 768 y 375 × 812 medidos.
- **Pregunta:** «¿Qué llegó en esta caja, cuadra con lo que dijeron y a cuánto lo vendo?» · **Protagonista:** el número de cada categoría (Contar) y la prenda con su precio (Cerrar).
- **Veredicto en una línea:** «Contar se entiende y se termina sola; el precio casi no se encuentra, y con el papel de la compra al lado el Dial queda bajo el pliegue.»

### Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 6 | [Observado] ciega (Opus, 1440): terminó contar e identificar; 16 toques, 1 vuelta atrás y 2 toques perdidos; **no encontró el precio** hasta volver a Contar y abrir la «›» · real: sin probar |
| 2 Una pregunta, una respuesta | 6 | [Medido] una sola primaria por paso; pero el Dial empieza en y = 901 a 1440 × 900 con el papel al lado (y = 1359 a 1024 × 768) y arriba hay dos rieles de avance seguidos (Trayecto y «1 Contar — 2 Cerrar») |
| 3 Simplicidad profunda | 7 | [Medido] los veredictos están («cuadra · 2», «faltan 1 de 2»), pero el mismo veredicto se dice 4 veces en Contar (aro, chip, frase, barra) |
| 4 Lenguaje de tienda | 7 | [Observado] «1 de 2» del chip de la prenda (identificadas) se leyó como lo contado; «Nada» bajo «Después» confundió; «Identificadas» y «Dijeron» se entendieron |
| 5 Contenido primero | 6 | [Medido] el contador queda bajo el acordeón y «Quién cuenta» cuando la tarjeta es angosta; en Cerrar la Vitrina nace plegada |
| 6 Lo difícil, a un toque | 7 | [Observado] el ⓘ de «Quién cuenta» y «Distinto por talla o color» funcionan; el problema no es lo difícil, es lo principal escondido (ley 1) |
| 7 Perdonar antes que preguntar | 7 | [Observado] el Dial devuelve con Escape; al cambiar 1 → 2 una prenda pierde su talla en silencio (de antes del rediseño); Enter en el precio saca el cursor de la caja |
| 8 Quitar antes de agregar | 5 | [Medido] alfileres de sede y segmento preguntan lo mismo; la Balanza repite el Podio; veredicto ×4; dos rieles |
| 9 De punta a punta | 6 | [Observado] un toque en «Pasar a cerrar» se perdió por un salto de la página; la etiqueta de precio parpadea al cambiarlo; nada dice que el precio se guarda al cerrar |
| **Leyes (promedio)** | **6,3** | una baja: la ley 8 en 5 |
| **Oficio visual** | **7** | [Medido] nuevas del rediseño: «Distinto por talla o color» de 172 × 20 px (bajo 24), cabecera del acordeón 1 px corrida, huecos de 11 y 21,2 px en Podio y Vitrina. Heredadas del sistema: versalitas de 11 px, 16 radios, «Cambiar» de 20 px. Contraste: 0 fallas reales (el «Salió» 1,22:1 es un falso positivo: el script toma el fondo de la parada) |

### Los 3 cambios de mayor impacto (esperan tu OK; todos de presentación)
1. **El Dial a la vista sin bajar.** **Antes →** con el papel al lado, el acordeón apilado y «Quién cuenta» empujan el contador bajo el pliegue
   (y = 901 a 1440 × 900). **Después →** acordeón al lado del Dial desde 680 px de tarjeta (cabe junto al papel); apilado, solo la categoría abierta
   muestra sus prendas y «Quién cuenta» va en una línea; bajo el número, «Toca el número para escribirlo». **Ley:** 2 y 5. **Se verifica:** el
   Dial empieza antes de y = 600 a 1440 × 900 y antes de y = 768 a 1024 × 768. **Esfuerzo:** S.
2. **El precio se encuentra y se entiende.** **Antes →** la Vitrina está en una fila plegada que se abre con una «›» sin texto; la etiqueta roja no
   dice «Precio de venta»; alfileres y segmento preguntan lo mismo; nada dice que se guarda al cerrar; la etiqueta parpadea y Enter saca el cursor.
   **Después →** las categorías con prendas identificadas nacen abiertas en Cerrar (la «›» dice «Precio y costo»); «Precio de venta» sobre la
   etiqueta; solo el segmento «Solo Trujillo | Todas» (sin alfileres); bajo el precio, «Se guarda al cerrar el envío»; la etiqueta ya no se vuelve
   a montar; «Distinto por talla o color» de 32 px. **Ley:** 1, 4, 8 y 9. **Se verifica:** repetir la misma ciega: encuentra el precio sin volver
   atrás. **Esfuerzo:** M. **Decide:** Felipe (presentación; no cambia qué se guarda ni cuándo).
3. **Decir cada cosa una vez.** **Antes →** en Contar el veredicto se repite 4 veces; el chip de la prenda dice «1 de 2» sin decir de qué; en Cerrar
   la Balanza repite el Podio. **Después →** el aro dice el veredicto y queda una sola frase corta al lado («Si no coincide, al cerrar dices por
   qué»); el chip dice «1 de 2 identificadas»; en Cerrar se quita la Balanza (el Podio y la barra de abajo ya lo dicen). **Ley:** 8, 3 y 4.
   **Se verifica:** contar las veces que aparece el veredicto (1 + la barra) y la ciega no confunde los «1 de 2». **Esfuerzo:** S.

### Lo que sobra (ley 8)
Los alfileres de sede (el segmento ya lo dice) · la Balanza de Cerrar (el Podio por categoría y la barra lo dicen) · el chip largo del veredicto en Contar.

### Lo que no pediste y importa más
Al cambiar la cantidad de una prenda que ya tiene tallas (1 → 2), sus tallas se borran sin avisar (`cambiarCantidadPrenda`, de antes del
rediseño): la persona pierde trabajo y no lo nota hasta Cerrar, donde el precio ya no se puede poner. Debería preguntar o conservar las tallas
que siguen valiendo; toca qué se guarda, así que lo decides tú.

### Lista aparte (no se ejecuta)
- El salto que hizo perder un toque en «Pasar a cerrar» (candidatos: «Faltan: …» del pie de la guía que se acorta, «Guardando…», el acordeón): reproducirlo antes de arreglarlo.
- Dos rieles arriba (Trayecto y «1 Contar — 2 Cerrar»): decidir si los pasos pasan a ser parte del Trayecto.
- Elegir «Todas» sin haber escrito un precio enciende «Las demás sedes» aunque todavía no cambió nada (se va con el cambio 2, al quitar los alfileres).
- La hoja de tallas dice «Todo listo» con «Contaste 1 de 2» (de antes).
- «Nada» bajo «Después» en Cerrar: «No queda nada para después».

### Prueba ciega (2026-10-29, Opus, cuenta de Felipe —Admin— en Tienda Trujillo, base local, 1440 × 900)
| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «la hoja para recibir el envío; contar la falda que falta y pasar a cerrar» (no vio dónde va el precio) |
| Primer intento | ✗ volvió una vez de Cerrar a Contar para poner tallas y poder poner el precio |
| Pasos | 16 toques (14 útiles, 2 perdidos) |
| Dudas | «1 de 2» (¿contadas o identificadas?), la «›» sin texto, la etiqueta roja como campo, alfileres contra segmento, si el precio quedó guardado |
| Palabras no entendidas | ninguna del todo; «Nada» y «Para después» las interpretó bien con dudas |
| Errores evitables | 1: subir la prenda de 1 a 2 le borró la talla |

**Escéptico (Opus, solo código):** 9 confirmados, 4 matizados, 1 no verificable (el salto), 0 refutados; de antes del rediseño: el pliegue de la
fila, la talla borrada, «Todo listo» y la Balanza.

### Antes de decir «listo»
- **Concurrencia:** el Dial guarda por la misma función con versión (`guardar_conteo_envio`): dos personas en la misma categoría no se pisan en silencio; no se probó a mano en esta pasada.
- **Caída externa:** si la base no responde, guardar el número vuelve a intentarlo al volver la red (`RefrescoTrasCorte`); el precio no se guarda hasta cerrar.
- **Persona sin contexto:** ciega ✓ · real: sin probar.

## Los 3 cambios del 2026-10-29, aplicados con el OK de Felipe («Sí, haz los 3 cambios»), `02b2ef6fe`

| Cambio | Antes | Después (medido a 1440 × 900, cuenta Admin) |
|---|---|---|
| 1 · El Dial a la vista | Dial en y = 901 (bajo el pliegue); a 1024 × 768, y = 1359 | Dial en y = 623 y el número termina en y = 759, sobre la barra (y = 782). El acordeón va al lado desde 640 px de tarjeta y el aro baja a 224 px en una tarjeta angosta; a 1024 × 768, y = 1080: **no llega a la meta (< 768)** porque bajo 1280 px el papel de la compra va arriba (decisión del 2026-10-28) |
| 2 · El precio se encuentra | la Vitrina en una fila plegada con «›» sin texto; la etiqueta sin título; alfileres + segmento; parpadeo y Enter que sacaba el cursor; «Distinto por talla o color» de 20 px | nace abierta en Cerrar, «Precio y costo» con nombre, «Precio de venta» bajo la etiqueta, solo el segmento, «se guarda al cerrar el envío» a la vista, sin parpadeo, Enter deja el cursor en la caja, los dos enlaces de 32 px |
| 3 · Cada cosa una vez | el veredicto 4 veces en Contar; «1 de 2» sin decir de qué; la Balanza repetía el Podio | el veredicto 2 veces (el aro y la barra) y una frase corta solo si no cuadra; «1 de 2 identificadas»; sin Balanza |

**Segunda ciega (Opus, misma cuenta y envío, 1440 × 900):** encontró el precio sola, **5 clics y 0 vueltas atrás** (la primera: 16 toques y 1 vuelta). Dudas que quedan:
la etiqueta roja «parecía decorativa» (la tocó para probar), «Solo Trujillo | Todas» no deja ver cuál está elegido (pieza del sistema, `SegmentoDeslizante`),
«Ganas por prenda» se actualiza al salir de la caja y no mientras se escribe, «Seguir recibiendo» tarda ~3 s en abrir el envío.

**Notas nuevas:** leyes **7,2** (1: 7 · 2: 7 · 3: 8 · 4: 7 · 5: 7 · 6: 7 · 7: 8 · 8: 7 · 9: 7) · oficio **7,5** (quedan los huecos de 11 y 21,2 px en Podio y Vitrina y la cabecera del acordeón 1 px corrida).

**Lista aparte nueva (no se ejecuta):** que la etiqueta de precio se vea escribible (un lápiz o el borde de una caja al pasar el mouse); que
«Ganas por prenda» siga lo que se escribe; el contraste de lo elegido en `SegmentoDeslizante` (pieza del sistema: pasa por `/unificar`); el papel
de la compra bajo 1280 px (¿abajo o plegado?) para que el Dial llegue a la vista en una laptop.

## Re-análisis 2026-11-02 — Contar en tres columnas (ADR-0604)

- **Dispositivo que manda:** escritorio. **Pregunta:** «¿Cuántas llegaron de este modelo, y qué me falta para cerrar?» **Protagonista:** el modelo que se tiene en la mano.
- **Veredicto:** «Una persona nueva cuenta, reparte tallas y dice lo que no llegó al primer intento y sin tocar nada de más. Lo que más pesa es la cantidad de cifras a la vista.»
- **Método:** medidor propio a tres anchos, dos pruebas ciegas (Opus antes de los cambios, Sonnet después), un revisor de leyes que también hizo de escéptico, y `/chaos`. Felipe dio el OK por adelantado: «aplica todos los cambios que sugieran».

| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 (tope sin real) | [Observado] 2.ª ciega: primer intento, 9 toques, 0 errores. La 1.ª: 20 toques, 2 errores, no terminó |
| 2 Una pregunta, una respuesta | 7 | [Medido] un solo botón principal a la vez («Pasar a cerrar» es secundario hasta que no quede nada por contar) |
| 3 Simplicidad profunda | 7 | [Medido] Cuadra, Faltan N, No llegó, Entra al stock. Queda crudo «Diferencia en lo contado» |
| 4 Lenguaje de tienda | 7 | [Observado] «Dijeron», «Re stock» y «Reparte» se entienden por el contexto; «¿Era otra prenda?» no se entendió |
| 5 Contenido primero | 7 | [Medido] foto de 84 px y nombre arriba; en la fila, el nombre entero en su línea |
| 6 Lo difícil, a un toque | 7 | [Observado] lo que falta para cerrar pasó de un `title` que nadie vio a una línea a la vista |
| 7 Perdonar antes que preguntar | 8 | [Medido] Deshacer al quitar una talla, en «Llegaron», en «Poner en cero» y en «Solo la cantidad» |
| 8 Quitar antes de agregar | 5 | [Medido] una misma cifra sale cuatro veces (fila, cifra, Dial, botón). Lo pidió Felipe mirando la maqueta: no se tocó |
| 9 De punta a punta | 7 | [Medido] sin aviso, reabierto, red cortada y sesión vencida probados. Terminal sin firma de respaldo, sin probar |
| **Leyes (promedio)** | **7,0** | ley 8: 5, decisión de Felipe |
| **Oficio visual** | **7** | [Medido] ver abajo |

**Oficio, medido:** dos contrastes de 1,08:1 en «Salió» y «En camino» son falsos: el medidor compara el texto con el disco de su parada, y el texto va debajo. Lo que ya no falla: los enlaces de la placa subieron a 24 px, el borde de los atajos a `borde-control` entero, las etiquetas de las cifras a 14 px, los espacios a múltiplos de 4. Lo que queda por decisión: varios radios (24, 20, 14, 12) son los de las piezas del sistema.

**Lo que cambió por la 1.ª ciega y el revisor:** las tarjetas ya no parecen una pregunta (sin el círculo de elegir, «Contando» o «Solo estos»); escribir en el buscador no cambia el contador y Enter lleva al primero; la tabla sube a la vista y el cursor llega a su primera celda; «menos de 1%» en vez de «0%»; «corrige lo contado a N» en vez de «Dejar N»; «Solo la cantidad» dice que no se vende hasta poner tallas; sin contar, el botón dice «Siguiente» y no es el principal; al final de un filtro, «Es el último: ver todos»; el resumen va después de lo que se cuenta bajo 1.040 px; «Contarla» lleva a esa categoría y lo decidido en Cerrar no se pierde al ir y volver.

**Lo que sobra (ley 8), sin tocar porque lo eligió Felipe:** las tres cifras al lado del Dial; «N de M» bajo el Trayecto; la barra de avance del resumen, que repite el Trayecto; las cifras de las tarjetas.

**Lo que no pediste y importa más:** en la prueba de `/chaos`, reabrir un envío contaba dos veces lo que ya estaba en el stock, y cerrar con tallas en Tienda LIM no se podía. Los dos están arreglados y probados cerrando de verdad.

**Lista aparte (no se ejecuta):** en Cerrar, «No vino» y lo demás se pierden al recargar; «Cerrar» con 54 filas sigue siendo largo; abrir otra categoría cambia lo que se cuenta, que a la 2.ª ciega la sorprendió una vez; `¿Era otra prenda?` no se entendió.

### Prueba ciega 2026-11-02

| Medida | 1.ª (Opus, antes) | 2.ª (Sonnet, después) |
|---|---|---|
| Lectura de 5 s | coincide | coincide |
| Primer intento | no: volvió atrás y perdió lo decidido | **sí** |
| Pasos | 20 (mínimo 13) | **9** |
| Dudas | 14 | 9 |
| Palabras no entendidas | 8 | 10, casi todas deducidas bien |
| Errores evitables | 2 | **0** |

### Antes de decir «listo»

- **Concurrencia:** dos pestañas sobre el mismo modelo: gana el último y avisa; la tabla no se entera hasta recargar (ADR-0604, límite 7). **Caída externa:** red cortada: lo dice, ofrece «Reintentar» esté donde esté la persona y reintenta al volver la conexión. **Persona sin contexto:** ciega ✓, real sin probar.

## Re-análisis 2026-11-03 — lo que Felipe eligió de la «lista aparte» (ADR-0604, actualización c)

- **Dispositivo que manda:** escritorio. **Pregunta:** «¿Cuántas llegaron de este modelo, cuánto costó y qué me falta para cerrar?»
- **Veredicto:** «Una persona nueva termina un envío de 75 líneas al primer intento: ve el costo arriba, dice qué pasó con lo que faltó, un F5 no le borra nada y encuentra el precio plegado sin volver atrás.»
- **Lo que cambió, por decisión de Felipe:** el costo en la cabecera, el número que no se transforma, abrir una categoría sin mover lo que se cuenta, «Cambiar de prenda», sin las cifras repetidas, Cerrar con lo que pide una decisión primero y lo que cuadra plegado, lo decidido que sobrevive a recargar y «Nos debe» por prenda.

| Eje | Antes | Ahora | Evidencia |
|---|---|---|---|
| 1 Sin manual | 8 | 8 (tope sin real) | [Observado] 3.ª ciega: cerró al primer intento; lectura de 5 s coincide |
| 4 Lenguaje de tienda | 7 | 7 | [Observado] «Cambiar de prenda» se entendió sin tocarlo. Quedan «fardo» y «CLAURE» |
| 7 Perdonar antes que preguntar | 8 | 8 | [Medido] «Empezar de cero» se deshace; lo que no es una cantidad no se guarda |
| 8 Quitar antes de agregar | 5 | 7 | [Medido] sin las tres cifras junto al aro ni «N de M» bajo el Trayecto. Se quedan las barras: las pidió Felipe |
| 9 De punta a punta | 7 | 8 | [Medido] F5 en Cerrar no pierde nada; la deuda dice la prenda de punta a punta. Terminal sin firma de respaldo, sin probar |
| **Leyes (promedio)** | **7,0** | **7,3** | las demás, sin cambio |
| **Oficio visual** | **7** | **7** | sin volver a medir: se quitó, no se agregó. [Medido] 0 hallazgos solo en oscuro a 1440 px |

**Cerrar, medido a 1440 px con 75 líneas:** de casi 16.000 px a 2.215 px con 8 filas que piden algo; abriendo lo plegado, 9.615 px. Sin desborde a 375 y 1024 px.

**Lo que cambió por esta ciega:** al volver de Cerrar se sigue en el mismo modelo; «Corregir el costo» lleva a la caja con el cursor puesto; el rótulo cortado «Se vend…» pasó a «A vender».

### Prueba ciega 2026-11-03 (Sonnet, cuenta de Felipe en Tienda Lima, ENV de 75 líneas casi contado, 1440 × 900)

Tarea: terminar de contar dos modelos, decir cuánto costó uno, decir que lo que faltó no vino, recargar a mitad, poner un precio solo en su tienda y cerrar.

| Medida | Resultado |
|---|---|
| Lectura de 5 s | ✓ «recibir un envío: decir cuántas llegaron de cada modelo y pasar a cerrar» |
| Primer intento | ✓ cerró; volvió a Contar solo para mirar la tabla de tallas, como pedía la tarea |
| Pasos | 67 acciones hasta cerrar. 11 se fueron en buscar dónde «anotar» el costo: la tarea decía «anótame», y lo leyó como escribirlo en el sistema. El costo lo vio al primer vistazo |
| Dudas | el costo como dato o como campo; «Crearlo con sus tallas ahora»; si «Pasar a cerrar» ya cierra; el sello del precio no parece una caja (de antes); si el costo escrito se guardó; CAYLA o CLAURE sin datos; «Por terminar» tras cerrar (de antes) |
| Palabras no entendidas | «CLAURE»; «fardo», «por crear» y «se promedia» las dedujo bien |
| Errores evitables | 1: estando en una búsqueda plegó sin querer la categoría y el siguiente toque cayó en «Agregar categoría» (lo canceló) |
| F5 en Cerrar | ✓ siguió en Cerrar, con los «No vino» puestos y «Lo que habías decidido sigue aquí» |
| Precio dentro de lo plegado | ✓ lo encontró con «Ver las 49 que cuadran» → «Precio y costo», sin volver atrás |

**Lista aparte, de esta ciega (no se ejecuta sin que Felipe lo mande):** el sello del precio de venta no parece una caja; no hay nada que diga que un costo cambiado se guarda al cerrar (el precio sí lo dice); Tab desde el costo deja seleccionado el de la siguiente prenda; después de cerrar, «Por terminar · 74 pendientes» hizo dudar de si faltaba algo.

### Antes de decir «listo»

- **Concurrencia:** dos pestañas donde una cierra: un solo cierre, la otra lee «Este envío ya se recibió». Dos sesiones sobre la misma deuda: `pruebas:nos-debe`, caso C1, corre en el CI. **Caída externa:** lo decidido en Cerrar no depende de la red; sin almacén en el navegador, la pantalla sigue sin borrador. **Persona sin contexto:** ciega ✓, real sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-12 | fase 5a | 5,8 (provisional, 4 leyes) | sin medir | — |
| 2026-10-13 | `claude/formidable-compras-oc-9b0c82` | sin volver a medir (falta una nueva prueba ciega) | sin medir | los 3 (el 2, ya resuelto) |
| 2026-10-13 | `69df902e6` (cara A, ADR-0393) | 7,2 (9 leyes) · leyes 3 y 4: 6 | 8 | el 3 de la fase 4 (un F5 borraba lo contado), por diseño |
| 2026-10-14 | los 3 cambios de la cara A | 7,6 · ley 1: 8 (tope sin real) | 8,5 | los 3 del 2026-10-13 |
| 2026-10-29 | `2a4e72e55` (piezas «B», ADR-0575) | 6,3 · ley 8: 5 · ley 1: 6 | 7 | — (3 propuestos, esperan el OK) |
| 2026-10-29 | `02b2ef6fe` (los 3 cambios) | 7,2 · ley 1: 7 (tope sin real) | 7,5 | los 3 del 2026-10-29 (el 1, a medias a 1024 × 768) |
| 2026-11-02 | rama `claude/mockup-receiving-merchandise-3f444e` (tres columnas, ADR-0604) | 7,0 · ley 1: 8 (tope sin real) · ley 8: 5 | 7 | el 1 del 2026-10-29 (a 1024 × 768 el Dial ya no queda bajo el papel) |
| 2026-11-03 | ADR-0604 act. c | 7,3 · ley 1: 8 (tope sin real) · ley 8: 7 | 7 | la lista aparte del 2026-11-02 |
