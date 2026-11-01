# 2026-10-31 — Guardar es un acto explícito: un Enter de costumbre ya no crea nada

**QUÉ HICE.** En la hoja «Nuevo avío», con todo lleno, **un solo Enter en el campo del nombre creaba el avío y
cerraba la hoja** — y esa hoja fija la unidad para siempre al primer lote. Ahora el Enter en un campo de texto no
guarda: hay que pulsar el botón. Vale para 16 hojas (las 10 que estaban expuestas y las 6 que ya se protegían a
mano), y queda un candado para que la número 17 no nazca sin ello.

**POR QUÉ ASÍ.** Porque es de HTML, no de una pantalla: un `<form>` con un botón `type="submit"` se envía al pulsar
Enter en cualquier caja de texto de adentro, y en este ERP casi todo botón dentro de un formulario es de envío. No
es una regla nueva del repo: **el mismo gesto estaba copiado a mano en seis formularios**, con comentarios que
decían exactamente esto («Crear un producto es un acto explícito»; «Enter NUNCA envía el formulario desde una
celda»). Lo que faltaba era que fuera UNA pieza y que la tuvieran las hojas que la necesitan.

**QUÉ SE ROMPERÍA SIN ESTO.** Un avío, una tela, una orden de compra o un gasto creados sin querer, por la
costumbre de cerrar un campo con Enter. En «Nuevo avío» además es irreversible: la unidad queda fija.

---

## El informe de `/chaos` se equivocaba en la causa, y medirlo lo destapó

El hallazgo decía que el culpable era el combo: «escribo la clase → Enter → Enter» por el `if (!abierto) return;`
de `ComboBuscable`. Al reproducirlo con **teclado de verdad** salió otra cosa:

| Lo que probé | Qué pasó |
|---|---|
| Enter con el foco en el **combo** y su lista cerrada | **no guarda** |
| Enter con el foco en **«Nombre»**, hoja completa | **guarda y cierra la hoja** |

O sea: el combo es una puerta más, pero la grande es el envío implícito del formulario, y arreglar solo el combo
habría dejado el agujero abierto con cualquier otro campo. Si me hubiera fiado del informe, el arreglo no habría
servido de nada.

## Qué se hizo

1. **Una pieza**, `components/ui/enterNoGuarda.ts`, con su decisión en texto plano (`hayQueFrenarElEnter`) para
   poder probarla: las pruebas de este repo corren **sin DOM**, así que mira el `tagName` y no
   `instanceof HTMLInputElement` —que es como estaban cinco de las seis copias, imposibles de probar—.
2. **Las 10 hojas expuestas** la llevan: Nuevo avío, Nueva tela, Editar tela, Nueva orden de compra, Nueva orden de
   insumo, Gasto del viaje, Papeles por completar, Roles (sus tres formularios), Recibir mercadería y Alta al vuelo.
3. **Las 6 que ya lo hacían a mano** usan la pieza (ADR-0358, «una función, una pieza»): seis copias eran seis
   sitios donde el día de mañana una se queda atrás.
4. **`ComboBuscable`** deja de soltar el Enter con su lista cerrada: lo consume y reabre la lista, que es lo que ya
   hacen sus dos hermanos (`Desplegable` y `ComboResponsable`). Así la tecla siempre tiene dueño, y la puerta del
   combo queda cerrada también en las hojas que todavía están en deuda.
5. **El candado** (`lib/enter-no-guarda.test.ts`): toda hoja con un `<form onSubmit>` lleva la guardia. Lo que de
   verdad debe enviarse con Enter —un buscador, el asistente, el login— se declara con su motivo.

## La deuda, contada

Quedan **130 formularios** sin la guardia. Repartirla es un despliegue módulo por módulo, no un PR: este cierra las
hojas que `/chaos` señaló y deja el número contado, de modo que **una hoja nueva no puede nacer sin ella** (si el
número sube, el candado se pone en rojo y dice cuál se coló). El número solo baja.

## Cómo se verificó

Primero la medición con teclado real (arriba), después el arreglo, y al final la misma secuencia:

| En «Nuevo avío», hoja completa | Antes | Ahora |
|---|---|---|
| Enter en el nombre | **creó el avío** y cerró la hoja | no pasa nada; la hoja sigue abierta y el foco se queda |
| Dos Enter seguidos | creó el avío | no pasa nada |
| Pulsar «Crear el avío» | crea | crea (`BOT-01`, comprobado en la base) |

**165 224 pruebas** en verde (776 archivos), `typecheck`, `knip`, `knip:produccion` y `lint`. La base se restauró a
su foto.

**Un tropiezo que vale anotar:** intenté poner la guardia en los 10 archivos con un script de reemplazo y rompió
tres (el JSX con llaves anidadas no se edita con expresiones regulares). Lo reverti entero y los hice a mano, uno
por uno. Más lento y sin un solo archivo roto.
