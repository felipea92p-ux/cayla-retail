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

## Historial
| Fecha | SHA | Leyes | Oficio | Cambios cerrados |
|---|---|---|---|---|
| 2026-10-12 | fase 5a | 5,8 (provisional, 4 leyes) | sin medir | — |
| 2026-10-13 | `claude/formidable-compras-oc-9b0c82` | sin volver a medir (falta una nueva prueba ciega) | sin medir | los 3 (el 2, ya resuelto) |
