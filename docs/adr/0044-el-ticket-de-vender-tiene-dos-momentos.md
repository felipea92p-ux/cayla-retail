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

## Adenda (mismo día) — tercer momento «descuento», precio de solo lectura, íconos

Felipe pidió (tarde del 2026-09-14) que el precio unitario no se edite en la caja, un
apartado de descuento «por código o a mano con el % requerido, global o por prenda»,
basurero en cantidad «1», sin flechitas en el campo, «Ticket actual» grande, íconos por
apartado en los colores del sistema y las animaciones «de shadcn, tal vez ya
existentes». Decisiones: **1-A** solo % manual ahora (los códigos necesitan una tabla
que no existe — paso propio), **2-B** volver a traer shadcn/GSAP (ADR-0045), **3-A** el
descuento vive en «armar», sobre el total.

- **El descuento viaja como `descuento_unitario` por línea**, la columna que
  `venta_items` ya tiene y `registrar_venta` ya recibe: un % se vuelve monto por unidad
  con 2 decimales (`descuentoUnitarioPorPorcentaje`), «todo el ticket» o solo las
  prendas marcadas (`aplicarDescuento`), y el chip «−10 %» se lee desde el monto
  (`porcentajeDeLinea`). 18 pruebas en `vender-reglas.test.ts`. Verificado contra la
  base local: Boleta B001-000005 con dos líneas `79.90 / 7.99 / 71.91` y total 143.82.
- **Tercer momento «descuento»** del ticket, dentro del panel: atajos 5·10·15·20·25·50 o
  un % a mano, «Aplicar a» con la lista de prendas marcables (`elegidas: null` es todo
  el ticket; `[]` es "ninguna todavía" — sin esa distinción, desmarcar la última
  volvería a significar "todas"), adelanto «Quedaría en», «Aplicar descuento» apagado
  con su motivo y «Quitar descuento» cuando lo alcanzado ya tenía uno. Dos entradas: la
  fila sobre el total y el «% Desc.» de cada línea.
- **El precio lo fija el catálogo** — la línea lo muestra de solo lectura (tachado + el
  que se cobra cuando hay descuento). Candado de pantalla: `registrar_venta` todavía
  acepta el precio que manda el navegador; el candado real (comparar contra
  `variantes.precio` en la RPC) sigue en el BACKLOG.
- **Íconos en los colores del sistema**: `lucide-react` (de vuelta con ADR-0045) para lo
  genérico y Yape/Plin dibujados a mano en monocromo. Todo hereda `currentColor` (tinta /
  tinta-60 según el estado): el morado y el azul de las marcas no entran — tres colores,
  y el rojo es acento, no logo.
- **Movimiento**: el reflujo `Flip` de las líneas (ADR-0038, el mismo que tenía el POS V1)
  vive en el padre con `useGSAP`; el ticket sigue sin hooks y solo recibe el ref. El
  total se asienta al cambiar (`anim-asentar`, re-montado por `key`), el apartado y el
  cobro se revelan (`anim-revelar`), el botón principal lleva `alza-cayla`.
- Basurero en cantidad «1» (el «−» no tiene a dónde bajar), campo sin flechitas
  (`appearance: textfield`), y un solo título grande por momento.

## Adenda (mismo día) — pago mixto y vuelto

«Yape + efectivo» es la venta más común de la tienda y los métodos eran excluyentes. La
base ya lo soportaba: `registrar_venta` recibe `p_pagos` como lista, exige que sume igual
que los ítems al centavo y graba una fila por medio en `venta_pagos` (`monto > 0`);
`fn_ventas_del_dia` ya mostraba «efectivo + yape». Faltaba la pantalla.

- **`PagoAplicado = { metodo, monto, recibido? }`** (lib, reexportado desde el padre).
  `recibido` es solo del efectivo y solo de pantalla: lo que la clienta entregó, para
  calcular el vuelto. A la RPC viaja únicamente `filter(monto > 0).map({ metodo, monto })`
  — si viajara lo entregado en vez de lo que cubre, `registrar_venta` rechazaría por no
  cuadrar; y una fila bajada a cero mientras se combinaba reventaría el `monto > 0`.
- **Reglas con tests (30/30):** `restanteDePagos` a 2 decimales (negativo si se pasan),
  `vueltoDe` solo en efectivo y nunca negativo, y `motivoBloqueoCobro` con dos escalones
  nuevos en el orden del recorrido: caja cerrada → ticket vacío → sin pagos («Elige cómo
  pagó la clienta.») → «Falta cubrir S/X.» → «Los pagos superan el total.» → factura sin
  RUC. Primero la plata, después el papel.
- **Ticket:** tocar un ícono AGREGA su fila con lo que falta cubrir (una por medio; el
  ícono queda marcado y apagado); combinar es bajar un monto y tocar otro medio. Cada
  fila: ícono, monto editable, quitar. En la de efectivo, «Recibido» con teclas que
  **suman** billetes (+10 +20 +50 +100 +200), «Exacto», campo para corregir y «Vuelto»
  grande. Debajo, «Cubierto ✓» / «Falta cubrir S/X» / «Se pasa por S/X». «Confirmar cobro»
  solo se enciende con restante 0; si escanean durante el cobro, total y restante
  cambian en vivo. `pagos` vuelve a `[]` al cerrar «Venta registrada».
- **`LineasPago` (Compras) no se reutilizó**, a propósito: es un formulario contable
  (monto en texto, medio en `<select>`, campo «Referencia», copy de facturas); el POS es
  táctil. Hacerlo calzar habría sido cambiarle la forma, no sumarle un prop. Se le copió
  lo bueno: reglas puras aparte y el copy «Falta … / Se pasa por …».

Verificado en navegador con venta real: 2 prendas (S/159.80) → Yape bajado a 50 → Efectivo
toma 109.80 → +100 +20 recibidos → «Vuelto S/10.20» → Boleta **B001-000006** → en
`venta_pagos` dos filas (`efectivo 109.80`, `yape 50.00`) → «Ventas de hoy» dice
«efectivo + yape». Nota chica: el campo numérico muestra `109.8`, no `109.80` — es cómo
pinta un `<input type="number">`; el monto guardado es 109.80.

