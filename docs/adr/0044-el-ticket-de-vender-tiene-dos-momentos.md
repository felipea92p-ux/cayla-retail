# ADR-0044 — El ticket de Vender tiene dos momentos: armar y cobrar

**Fecha:** 2026-09-14
**Estado:** Aplicado en `main` local desde la rama `feat/pos-ticket-progresivo`
(commits `2a1c490`, `56eaf1a`, `fd4bcdc`, `b11d7f6`). Solo pantalla: no toca
`registrar_venta`, el IGV, RENIEC ni la emisión del comprobante.
**Afecta:** `apps/web/components/PuntoDeVentaTicket.tsx` (panel derecho, sesión B
según ADR-0043), `PuntoDeVenta.tsx` (padre: dos estados y una derivación),
`lib/vender-reglas.ts` (nuevo, con test) y `components/Ayuda.tsx` (un prop aditivo).

## Contexto

Con el ticket vacío, el panel derecho ya mostraba todo el cobro desplegado: los
cinco métodos de pago, Boleta/Factura, el DNI de la clienta y dos «(!)» encendidos.
La pantalla pedía decisiones antes de que existiera la venta, y las señales perdían
sentido porque estaban prendidas desde el segundo cero.

Tres causas medidas en el código, no supuestas:

1. **No existía el concepto de momento.** El pie del ticket se renderizaba entero
   siempre; `carrito.length` solo decidía entre el estado vacío y la lista.
2. **Los (!) no eran advertencias: eran `Ayuda`**, el botón de docencia que la
   BITÁCORA del 2026-07-19 regó por nueve pantallas. Están encendidos siempre por
   diseño — pero usan el glifo «!» y se leen como alertas.
3. **Nunca «faltaba» nada porque `efectivo` venía preseleccionado.** La única
   condición real de bloqueo era `facturaSinRuc`, y el botón la aplicaba en
   silencio: gris y mudo.

Referencia que Felipe puso sobre la mesa: Dynamics 365 Store Commerce resuelve esto
con pestañas dentro del carrito (Líneas / Cliente / Entrega / Pagos) — muestra lo que
corresponde a cada momento.

## Decisión

**El ticket tiene dos momentos y el padre es su dueño.**

- **«armar»**: solo las líneas del ticket y el total. El estado vacío queda tal cual.
  El botón principal dice «Cobrar» y lleva al momento siguiente.
- **«cobrar»**: aparece recién al tocar «Cobrar». Primero *cuánto y cómo pagó la
  clienta* (los cinco métodos), después el *comprobante* con el documento **adentro**
  (`fieldset`/`legend`: el DNI o el RUC solo tienen sentido para la boleta o la
  factura que se va a emitir). «← Ticket» vuelve sin perder lo elegido. El botón
  pasa a «Confirmar cobro».
- **El cobro va dentro del panel, no en un modal**: el total queda siempre a la
  vista y el panel es la unidad que cambia de momento, como las pestañas de D365.
  Un modal habría dejado el panel casi vacío y encadenado dos modales seguidos
  («Cobrar» → «Venta registrada»).

**Un solo motivo de bloqueo, derivado una vez.** `motivoBloqueoCobro`
(`lib/vender-reglas.ts`) devuelve *por qué* el botón está apagado —o `null`— en el
orden del recorrido real: caja cerrada → ticket vacío → (solo en «cobrar») falta
método → factura sin RUC. Ese único valor alimenta tres cosas: el `disabled` del
botón, la línea que lo explica debajo (`aria-describedby`) y el freno dentro de
`cobrar()`. Antes cada una tenía su propia condición y ninguna hablaba.

**El método de pago no viene preseleccionado.** `metodoPago` arranca en `null` y
vuelve a `null` después de cada venta: un «efectivo» que nadie eligió es un dato
fantasma en el cuadre de caja — el mismo problema que el BACKLOG ya denuncia con el
descuento. Cuesta un toque más por venta; a cambio, el método registrado es una
decisión de la colaboradora, no un default heredado.

**Los (!) se ganan su lugar.** `Ayuda` acepta `tono="falta"`: mismo glifo, mismo
globo, pero ya encendido en rojo y con `aria-label` «Falta: …». Quien lo pinta
decide *cuándo* (solo mientras falte el método, o el RUC de la factura) y el globo
dice *qué falta* — conservando una línea de la docencia original. El default deja
las otras ocho pantallas byte a byte iguales (verificado con `renderToString`).

**El hijo sigue siendo render puro** (ADR-0043): sin estado, sin hooks, sin
`memo()`, sin contexto. `momento` vive en el padre porque cerrar «Venta registrada»
lo devuelve a «armar», y `metodoPago` porque `cobrar()` lo manda a la RPC.

Se descartó: un modal para el cobro (arriba); pestañas visibles «Líneas / Cobro»
en la cabecera (una segunda forma de navegar para dos estados que ya navega el
botón); dos (!) por bloque —uno de ayuda y uno de alerta— (dos glifos iguales al
lado con significados distintos); y esconder el DNI de la boleta detrás de un
«+ Agregar DNI» (un campo opcional visible cuesta menos que un toque cuando la
clienta sí lo da).

## Consecuencias

- Escanear durante «cobrar» **sigue agregando al ticket**: el conteo de la cabecera
  y el total se actualizan en vivo. Nada se bloquea (regla cruzada con el panel
  izquierdo).
- El foco no se mueve solo al entrar a «cobrar»: hacerlo le quitaría el foco al
  campo de escaneo, que es justamente lo que la regla anterior protege.
- La docencia de los dos (!) originales ya no está disponible una vez completado el
  paso — en el POS, no en el resto de la app. Si hace falta un lugar permanente para
  esa explicación, es una decisión aparte (¿un «?» en la cabecera del cobro?), no un
  tercer glifo al lado.
- `facturaSinRuc` sigue midiendo solo si el RUC está vacío (no su validez): el
  campo ya muestra el motivo cuando el número es inválido y `registrar_venta` es la
  última palabra. No se cambió a propósito — este ADR es sobre *cuándo y cómo* se
  muestra el cobro, no sobre qué acepta.

## Verificación

- `motivoBloqueoCobro`: 7 pruebas en `lib/vender-reglas.test.ts` — cada regla y el
  orden entre ellas («el ticket vacío manda sobre el método»). 102/102 en la suite.
- `Ayuda` con tono por defecto: `renderToString` de la versión anterior vs. la nueva,
  con y sin título — byte a byte idéntico.
- `tsc`, `eslint` y el pre-commit del repo en verde en los tres commits.
- Recorrido en navegador con sesión real (Felipe Alvarez · Líder · Tienda Lima) y la
  base local compartida, medido en el DOM en cada paso: vacío (0 métodos, 0 DNI, 0 (!),
  botón `disabled` con `aria-describedby` → «Agrega una prenda para cobrar.») → prenda
  («Cobrar S/79.90» encendido, sin motivo) → Cobrar (cabecera «← Ticket · Cobro · 1
  prenda», un solo (!) «Falta: Elige cómo pagó la clienta», Boleta sin (!), DNI opcional
  adentro, «Confirmar cobro» apagado con motivo, 0 px de desborde horizontal) → segunda
  prenda desde el catálogo **durante el cobro** («2 prendas», S/159.80 en vivo) →
  Efectivo (se apagan el (!) y el motivo, botón encendido) → Factura sin RUC ((!) en
  Comprobante + «La factura necesita el RUC de la empresa.») → Boleta → «← Ticket»
  (2 líneas, sin cobro) → Cobrar (Efectivo y Boleta conservados) → Confirmar cobro →
  «Venta registrada · S/159.80 · 2 prendas · Boleta B001-000001 emitida» → «Nueva
  venta» → «armar», vacío, y en la venta siguiente el método vuelve a estar sin elegir.
- Facturación (`/vender/facturacion`): los tres `Ayuda` de la pantalla llevan la clase
  original exacta; la venta de la demo aparece como «Boleta B001-000001 · pendiente de
  enviar». Sin errores de consola.
- Nota de arnés, no de la app: el panel del navegador de la sesión dejó de entregar
  clics físicos al escalar el viewport; las interacciones se dispararon con
  `element.click()` sobre el DOM real (mismos handlers de React) y se leyó el estado
  después de cada una.

## Adenda (mismo día) — en escritorio el POS es una pantalla fija

Felipe pidió que el ticket ocupe toda la altura visible y que la página no
scrollee: el catálogo con su scroll propio, la pantalla quieta. Commits `7b47aa4`
(padre) y `9eb5b66` (ticket).

- La raíz de `PuntoDeVenta` toma `lg:h-[calc(100dvh-9rem)]`: lo que queda bajo la
  cabecera fija de AppShell, siendo 9rem el `pt-24 + pb-12` de su `<main>`. Se
  eligió calcular sobre ese padding y **no tocar AppShell** (un `<main>` a altura
  fija cambiaría el scroll de todas las pantallas). Si ese padding cambia, este
  número cambia con él — está dicho en el comentario del código.
- La grilla pasa a `lg:grid-rows-[minmax(0,1fr)]`. Con la fila implícita (`auto`)
  los paneles nunca encogen por debajo de su contenido, la fila crece y la raíz
  (`overflow-hidden`) la recorta en silencio: el scroll interno que el catálogo
  **ya tenía** (`min-h-0 flex-1 overflow-y-auto` alrededor de la grilla, archivo
  de la sesión A) no se activaba por eso. No hizo falta tocar ese archivo.
- El aside pierde `lg:max-h-[42rem]` y gana `lg:min-h-0`: cabecera y pie fijos,
  solo el medio scrollea.
- Solo en `lg:`. En celular/tablet la pantalla sigue apilada con scroll de página:
  dos scrolls internos uno debajo del otro serían peores que uno solo.

Medido a 1280×800 y 1100×650: `scrollHeight` de la página = viewport (no scrollea);
raíz de 96 px a 48 px del borde inferior; escáner siempre visible; catálogo con
407/2153 px (y 202 px en el viewport bajo); ticket con 8 líneas scrollea por dentro
con el pie (total + botón) pegado abajo, también en el momento «cobrar».

