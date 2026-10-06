# ADR-0355 · Traslados como billetera de pases (la opción D)

- **Fecha:** 2026-10-06 · **Estado:** construido en la rama `claude/simular-traslados-sedes-999c9c` (cinco actividades, un commit cada una, más el
  cierre). **Sin migración y sin cambios en producción**: solo web. Verificado: `tsc`, ESLint y las pruebas de `apps/web` en verde (372 archivos);
  el flujo completo contra la base local (contar a ciegas, comparar, confirmar al piso y al almacén, cerrar con nota, anular, enviar un pedido y
  «No la tengo») con Playwright a 1.280 y a 375 px, en claro y en oscuro; el auditor del tema (ADR-0336) en 0 hallazgos.
- **Pedido:** Felipe, 2026-10-06: «No me gusta para nada ese diseño, es muy poco visual y tiene mucho texto que casi nadie se parará a leer». Seis
  maquetas en dos rondas (`docs/maquetas/traslados-visual-2026-10/`, con una prueba ciega de la segunda). Eligió la **D · Pases**: «Me gusta la D,
  implementa tal cual en el sistema».
- **Número:** se escribió como ADR-0354 durante la obra (así lo dicen los mensajes de sus commits); al cerrar, `main` ya tenía un ADR-0354 (historial
  de la prenda) y este pasó al **0355**.
- **Reemplaza:** la disposición de ADR-0242 D-1 («Hoy te toca» como bandeja de tarjetas + la lista con buscador). **Complementa:** ADR-0239 (recibir a
  ciegas, D-129 a D-132), ADR-0242 D-3 y D-6.1, ADR-0328 (la firma de quien recibe), ADR-0353 (el lenguaje visual de Movimientos), ADR-0136
  (movimiento), ADR-0284 (guía de foco).

## El problema

La pantalla de Traslados era una lista de filas con chips, cifras y párrafos. Quien está en la tienda con una caja en la mano no la leía: no sabía cuál
era la suya, si ya había llegado ni qué le tocaba. Los pedidos de otras sedes vivían en una tarjeta aparte, encima, con otra forma.

## Decisiones

**1. Cada traslado es un pase de abordar, y la pantalla es una billetera** (`components/traslados-pases/`, `lib/traslados-pases-reglas.ts`).
DECIDÍ: a la izquierda, los pases apilados en tres pestañas —**Te llegan · Envías · Terminadas**— con lo que te toca arriba, un contador ámbar por
pestaña, un anillo del día («Te tocan 3 cosas hoy») y un buscador chico; a la derecha, el pase grande: de qué sede a cuál en letras grandes, el camión
en su punto del viaje, tres datos y un botón. Elegir un pase **navega** a `/inventario/traslados/<id>`: el grupo de rutas `(billetera)` deja la
billetera en el layout y el pase en la página. ← → pasa de caja; en celular se ve una cosa a la vez.
ES COMO ESTÁ PORQUE los enlaces que ya existen (Movimientos, el WhatsApp de la otra sede, «Ver el traslado» al enviar) tienen que seguir abriendo SU
caja, y «atrás» del navegador tiene que funcionar. DESCARTÉ el pase abierto solo con estado del cliente: rompía todos esos enlaces.

**2. El pase gira: al frente se mira, al reverso se hace** (`ReversoPase.tsx`, `useRecepcion.ts`, `lib/traslados-reverso-reglas.ts`).
DECIDÍ: el botón del frente da vuelta el pase. En el reverso se cuenta (− / +, la pistola o la cámara con `EscanerConteo`), se compara al terminar
(«venían 3 · llegaron 2», y nombra lo que no cuadró: «Faltó 1 Falda Ariana M rosado»), se elige piso o almacén y se confirma; el líder escribe la
nota y cierra con la diferencia; quien envió anula con su motivo. Al terminar, el pase vuelve al frente, le cae un **sello de goma** (RECIBIDA, FALTÓ
ALGO, CON NOTA, ANULADA, ENVIADO, NO LA TENGO) y se abre la siguiente caja que te toca.
La lógica de recibir es **la misma** del panel anterior, movida tal cual a `useRecepcion`: guardado por casilla en fila sin el loader (`x-espera: no`),
reintento al volver la red, envío de lo pendiente al salir, firma de ADR-0328, prenda de más. Se borran `TrasladoDetallePanel`, el recorrido y las
tres ventanas (confirmar, cerrar, anular): lo que decían («Entran 14 prendas al piso…», «Se da por perdida 1 prenda…») va escrito en el reverso.
**Conteo a ciegas (D-130) intacto:** un pase que te llega nunca dice cuántas prendas trae; `esCiego` es la única puerta y lo enviado aparece recién
al terminar de contar.

**3. Los códigos de sede salen del nombre.** «Tienda TRU» → TRU; el Taller se escribe entero (la prueba ciega no entendió «TAL»); una sede sin código
en el nombre («Tienda Lima» en la base local) queda sin «Tienda». DESCARTÉ `public.sedes.codigo` de Dynamic: el de Lima es «003».

**4. Pedidos entre sedes y «Para enviar» también son pases** (`lib/traslados-pedidos-pases-reglas.ts`, `PasePedido.tsx`, `Escenario.tsx`).
DECIDÍ: lo que otra sede te pide va en **Envías** como «LIM te pide 3 prendas», con «No la tengo» y «Enviar a LIM» (maqueta D); lo que subiste para
mandar, como «Para enviar a LIM»; lo que tú pediste, en **Te llegan** mientras siga abierto o pida avisar al cliente o «¿sigue en pie?», y en
**Terminadas** al responderse. Abren en `/inventario/traslados/pedido-<id>` y `enviar-<sede>`; un pedido que ya salió vuelve a la billetera.
Las reglas no cambian: `accionesDe`, `estadoVisible*`, `paraQuien` (el lado que envía nunca ve el nombre del cliente) y las mismas RPC. «Subir al
almacén», «Avisar al cliente» y «¿Sigue en pie?» siguen en sus ventanas. Se borra la tarjeta `PedidosEntreSedes`.

**5. El anillo y el menú cuentan lo mismo.** «Te tocan N» es `numeroDelMenuTraslados`: lo que llega por recibir o revisar (`contarRequierenAccion`)
más lo que te piden (`contarTePiden`). «Para enviar» y lo que pediste se ven pero no suman (como decidió Felipe el 2026-10-04). «Hechas hoy» es lo que
la sede confirmó o cerró hoy como destino y lo que anuló hoy como origen; un pedido respondido no cuenta porque la lista no trae la hora de la
respuesta. Lo exigen dos pruebas.

**6. «Lo siguiente» es el botón del pase recién recibido.** «Bajar estas al piso» o «Imprimir etiquetas» (la regla de ADR-0242 D-6.1, sin cambios)
pasan a ser el botón grande, con su frase encima; «Ver lo que llegó» queda al lado. Si la caja todavía pide revisar, ese botón manda.

**7. Movimiento: excepción a ADR-0136, aprobada por Felipe** («implementa tal cual», 2026-10-06), como la de Movimientos (ADR-0353): el pase que gira,
el sello que cae, las letras que giran como en un aeropuerto al abrir el pase, el camión que corre hasta su punto y el anillo que se llena. Todo corre
**una vez**, con `--ease-cayla`, sin rebote; nada en bucle salvo la señal del atraso (late tres veces y queda quieto). Todo se apaga con
`prefers-reduced-motion`.

**8. El QR y «Guía» en el pase de salida** (actualizado el 2026-10-06). Durante la obra quedaron fuera: dependían de la guía impresa de
ADR-0242 D-3, que no existía, y un QR que no lleva a nada sería peor que ninguno. Ya existe (rama `claude/traslados-guia-impresa`, ver la
actualización de ADR-0242): el frente del pase que sale lleva el QR «va en la caja», como en la maqueta, y el reverso, «Guía» junto a
«Avisar por WhatsApp». Ninguno de los dos dice cuántas van.

## Lo que se mira para saber que funciona

- `lib/traslados-pases-reglas.test.ts`, `traslados-reverso-reglas.test.ts`, `traslados-pedidos-pases-reglas.test.ts`, `sugerencias-traslados.test.ts`.
- La guía de foco: el pase y la billetera, `aplicada` (`lib/guia-de-foco-pantallas.ts`): al contar, la prenda que sigue se enciende y el pie nombra las
  que faltan, con la misma regla que apaga «Terminé de contar» (lo exige una prueba).
- `pnpm --filter web tema:auditar -- --cuenta admin --ruta '/inventario/traslados,/inventario/traslados/[id]' --escenarios`: 0 hallazgos.

## Lo que queda abierto

- ~~**La guía impresa con QR** (ADR-0242 D-3)~~: construida el 2026-10-06 (punto 8 y la actualización de ADR-0242).
- **PR #808** («Colgar en el piso», ADR-0339) cambia textos de Traslados que aquí no se tocaron («Bajar estas al piso»): al fusionar, gana su texto.
- **`/formidable`** sobre el pase: ver la bitácora del día.
