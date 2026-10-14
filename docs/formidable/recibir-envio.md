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

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-12 | fase 5a | 5,8 (provisional, 4 leyes) | sin medir | — |
| 2026-10-13 | `69df902e6` (cara A, ADR-0393) | 7,2 (9 leyes) · leyes 3 y 4: 6 | 8 | el 3 de la fase 4 (un F5 borraba lo contado), por diseño |
| 2026-10-14 | los 3 cambios de la cara A | 7,6 · ley 1: 8 (tope sin real) | 8,5 | los 3 del 2026-10-13 |
