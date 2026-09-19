# ADR-0131 — Por pagar responde: piezas que se hablan, vista rápida, cascada del pago y reacción al pagar

- **Fecha:** 2026-09-19
- **Estado:** Aceptado. **Producción:** no requiere nada — sin migración, sin RPC nuevo, sin cambio de esquema.
  Todo lo nuevo es presentación sobre las funciones que ya corren (`deuda_por_vencimiento`, `salidas_caja_30d`,
  `por_pagar_tramos`, `registrar_pago_compras`).
- **Decide:** Felipe (aprobó el spike visual y pidió desarrollar la pantalla replicando cada detalle y efecto).
  Arquitectura: este documento.
- **Diseño:** `docs/maquetas/por-pagar-spike-2026-09/` (spike interactivo; parte de la maqueta 02 y la 03 de
  `docs/maquetas/compras-2026-09/`, que siguen mandando en cifras, textos y jerarquías). Mismo modelo que
  ADR-0128 (Proveedores): mismas primitivas (`useContar`, `useFlip`, `anim-entra`, `anim-cajon`, `SegmentoDeslizante`).

## Contexto

Por pagar (ADR-0111) ya respondía «cuánto debo y qué es urgente», pero sus cuatro piezas —cifras, deuda por
vencimiento, salidas de caja y lista— eran islas. «Vencido S/ 6,670» no decía CUÁLES eran; «62 %» no decía QUIÉN;
la tarjeta de caja hablaba de «saber si alcanza» sin responderlo; pagar recargaba todo de golpe, así que no se veía
qué había cambiado; y para decidir a cuál pagar primero había que abrir el detalle de cada comprobante y volver.

## Decisiones

**D1 — Las piezas conversan por un contexto de cliente, no por la URL.** `PorPagarContexto` guarda dos cosas:
`eco` (a qué se está apuntando: un tramo, una semana de caja o un proveedor) y `filtroLocal` (un clic sobre
una barra). Apuntar enciende las filas que suman esa cifra; un clic deja solo esas filas, con un chip para
quitarlo. Los filtros que ya eran de la base (proveedor, vencidas, condición, búsqueda) siguen en la URL.

**D2 — El filtro por tramo o por semana es local, y lo dice.** `listar_compras` filtra por emisión, no por
vencimiento; agregar un rango de vencimiento habría sido un cambio de función en producción. En vez de eso
el filtro actúa sobre las filas de la página que ya llegaron y, si hay más páginas, el chip lo rotula «en esta
página»: no se aparenta que cubre toda la deuda. Las reglas que deciden qué fila cae en qué tramo son las MISMAS
que las de Postgres, reescritas puras en `por-pagar-reglas.ts` (`tramoVencimientoDe` ↔ `deuda_por_vencimiento()`,
`enCubetaCaja` ↔ el `join` de `salidas_caja_30d()`, que ya devolvía `desde`/`hasta` «para filtrar al tocar»),
y probadas contra los casos borde (bordes inclusivos, sin fecha = «vence hoy»).

**D3 — «¿Alcanza la caja?» es solo de pantalla.** Se escribe cuánta caja hay y cada semana muestra cuánto queda
cubierto (`cubrirCaja`, pura) con una frase. El monto no se guarda ni viaja a ningún lado: no hay tabla de caja
disponible en este módulo y no se inventa una.

**D4 — Vista rápida del comprobante.** Tocar una fila abre un cajón (mismo molde que `ProveedorVistaRapida`) con saldo, total/pagado/crédito, la línea de vida (emisión → vencimiento → hoy), el «siguiente paso» (`pasosDeComprobante`, pura y probada) y los **pagos ya registrados** (fecha, medio, referencia y monto; «Sin pagos todavía» si no hay). Los pagos se piden en UNA consulta por toda la página (`getPagosDeCompras`, solo de los comprobantes que ya recibieron alguno) y, si la consulta falla, la lista se dibuja igual y el cajón omite la sección: se registra en el log del servidor. El botón del cajón es «Pagar S/ …» (con el billete), como en el spike. Es solo de líder (ADR-0126).

**D5 — Pagar no hace `router.refresh()` en el modal: lo pide la lista cuando termina de animar.** El modal se vuelve
una confirmación (el círculo y el tilde se dibujan; cada comprobante con su saldo resultante) y solo al cerrarla
avisa a la lista con `{ pagadas, parciales, total }`. La lista sella «Pagada» las filas que quedaron en cero
(900 ms), las pliega (380 ms, Web Animations sobre la altura) y recién entonces pide el dato fresco; las que
quedan con saldo se encienden en verde y su cifra cuenta hasta el valor nuevo. Si el dato llegara a mitad de la
animación, las filas desaparecerían de golpe. La confirmación se cierra sola a los 3.2 s. **No hay «Deshacer»:**
un pago es plata que salió; anularlo es un flujo aparte y con rastro (nunca se borra), no un botón de 7 s.

**D6 — Reglas de movimiento (revisan ADR-0128 sin cambiarlo).** Se mantienen sus límites: la llegada se anima una
vez y escalonada, nunca en bucle, nunca sobre lo que la persona ya usa (filtrar no re-anima la tabla: las filas
que aparecen después entran con el gesto corto), sin rebote, y movimiento reducido = instante (ya lo garantiza la
regla global con `!important`). Gestos NUEVOS aprobados aquí, todos en `globals.css`: `anim-destello-ok` (la fila
que recibió un pago se enciende en VERDE; el destello rojo de Proveedores significa «lo que acabas de crear»,
éste «plata que salió»), `anim-tilde` (el check de una casilla se dibuja, 320 ms, sin desfase: responde a un
clic), y el pliegue de la fila pagada (JS). Extensiones aditivas de piezas compartidas: `TarjetaCifra`
(`acentoTrazo`, `puntoPulsa`; el contexto pasa de `<p>` a `<div>` porque ahora puede llevar una barra),
`BarraFija` (`visible`: sube 420 ms y baja 240 ms sin cambiar cómo la usa Recibir), `CifraQueCuenta` (formato
`monto`), `FiltrosCompras` (`atajoBuscar`: «/» enfoca el buscador). **Color:** se mantiene el tope de rojo por
pantalla (`MAX_ROJO_POR_PANTALLA`): la onda del puntito la lleva «Vence esta semana» (ámbar), no «Vencido».

**D7 — «Agrupar» se elige al instante y la URL se pone al día detrás.** `agrupar` vive en el contexto para que
«Por urgencia | Por proveedor» deslice las filas (`useFlip`) sin esperar al servidor; `router.replace` sincroniza
la URL en segundo plano, así el enlace se sigue pudiendo compartir.

**D8 — La tabla decide su forma por el ancho de SU contenedor, no por el de la ventana.** Al verla en el panel
del navegador (~530 px de tabla con el menú lateral abierto) el nombre del proveedor quedaba en «Textil…»: seis
columnas fijas no caben en 1024 px de ventana. La lista es ahora un `@container` con tres formas: < 40 rem
tarjeta (como en celular), ≥ 40 rem tabla de 5 columnas con «Pagado» bajo el saldo, ≥ 56 rem las seis columnas de
las maquetas. Solo cambia esta lista (el `Encabezado` compartido decide por ventana y no se tocó; aquí el encabezado
es propio). Desborda igual que antes la fila del buscador en celular: eso sigue pendiente y no es de este ADR.

**D9 — El «Pagar» de una fila tiene la misma cara que «Pagar juntos».** La primera entrega dejó el pago individual
(`RegistrarPagoModal`) con el diseño de siempre y Felipe lo vio «totalmente diferente». Ahora ambos comparten
`PagoPiezas.tsx` (datos del proveedor con «✓ Copiado», tilde, confirmación, tipos) y el individual usa la misma
cabecera, la cascada, el resumen y la confirmación. Lo que conserva del anterior: pagar en VARIOS medios (`LineasPago`,
RPC `registrar_pagos_compra`, todo o nada) y el saldo a favor como un medio más. `BotonPagar` recibe `datos` y `onPagado`
(la fila y el cajón los pasan; el detalle no, y sigue pidiendo el refresh por su cuenta). Tope de tiempo al plegar las
filas pagadas: si la pestaña está oculta `finished` no se resuelve y la fila quedaba a medio plegar sin pedir el dato fresco.

**D10 — El modal de pago es el del spike, con una diferencia a propósito: varios medios de pago.** Tras la D9 Felipe
volvió a ver el modal «que no era el diseño ni las animaciones» (y la D9 se había quedado corta: se comparó por el DOM,
no por imágenes). Se comparó con capturas del spike y del modal real, lado a lado, y se corrigió: cáscara `papel` con
borde fino, SIN sombra y con ✕ (`Modal` `variante="papel"`, aditiva); «Se paga» y «Total» son campos; píldoras de medio
en minúscula, referencia sin monoespaciada, rótulo en sans, atajos siempre a la vista; pie a todo el ancho; y las
animaciones de apertura (la cascada se llena desde 0 y «Pagarás» cuenta desde 0). **El spike solo permite UN medio de
pago; el ERP siempre ha permitido varios** (`registrar_pagos_compra`, todo o nada), así que `MediosDePago`
(`PagoPiezas.tsx`) diseña esa parte con el mismo lenguaje: con un medio es idéntico al spike y «＋ Dividir en otro medio»
agrega líneas con su monto, sus píldoras y su referencia, con una barra del reparto. Verificado con un pago real de
4,720 = 3,000 transferencia (con referencia) + 1,720 efectivo: la base guardó las dos líneas. **Pendiente:** «Pagar
juntos» (varios comprobantes) sigue con UN medio: `registrar_pago_compras` recibe un solo `p_metodo`, y repartirlo en
varias llamadas no sería todo-o-nada. Permitir varios medios ahí exige una función nueva en producción.

**D11 — Al elegir el medio de pago se muestran los datos de ESE medio.** Antes el modal enseñaba arriba, todos juntos, la
cuenta y el «Yape / Plin» del proveedor; Felipe pidió que aparezcan al elegir el medio. `DatosDelMedio` (`PagoPiezas.tsx`)
los muestra debajo de las píldoras, con «✓ Copiado»: Transferencia → banco, titular, cuenta y CCI; Depósito → banco, titular
y cuenta; Yape/Plin → el celular de ESA billetera (no el WhatsApp del contacto) y el titular; Efectivo y Saldo a favor lo
dicen; Otro no muestra nada. En un pago dividido cada medio muestra los suyos. Si falta el dato que el medio necesita se
dice y se enlaza a la ficha (en otra pestaña, para no perder el pago a medio hacer); si ni siquiera se conocen los datos
del proveedor, calla en vez de afirmar que faltan. El **titular** es el control anti-error: quien paga lo compara con el
nombre que muestra el banco o Yape antes de confirmar. La franja de arriba queda solo con «Paga por» y el crédito.
**Datos:** usa `cci`, `celular_billetera`, `billeteras` y `titular_cuenta` de `proveedores`, que trae `fn_proveedores()`;
los agregó la sesión de Proveedores (su ADR-0134, migración `20260919170000`, ya en producción) y se copiaron SUS tipos
(`lib/proveedores.ts`, `packages/database`) idénticos para que la fusión sea limpia. **Numeración:** este ADR era el 0129;
pasó a 0131 porque el 0129 y el 0130 (regla de movimiento de modales) son de esa rama.

**D12 — Revisión general contra el spike (2026-09-19).** Antes de subir se renderizaron el spike y la pantalla real con los mismos datos y se compararon sección por sección, con 13 comprobantes y un saldo a favor de prueba. Se corrigió: **(1)** las filas de otros proveedores NO se atenuaban al marcar y el eco al apuntar una barra no se veía: al terminar la entrada la fila cambiaba a `anim-revelar`, cuya animación retiene `opacity: 1` y pisa el `opacity-40`/`opacity-50` (y además repetía 240 ms de animación en toda la tabla); ahora la animación de cada fila se fija al montarse y no retiene el estado final; **(2)** buscador del spike (lupa, sin etiqueta, «/» a la vista, ✕) y la línea de resumen «N comprobantes con saldo · S/ … por pagar» que faltaban; **(3)** la tarjeta «Deuda total» medía menos que las otras; **(4)** el cajón: botón corto, ícono en «Abrir comprobante» y la sección de pagos; **(5)** celular: la rejilla de una columna sin `minmax(0, 1fr)` y las etiquetas de «Salidas de caja» ensanchaban toda la pantalla, «Concentración» a ancho completo, «S/ 11,803.60» sin partirse, y la barra fija con los botones en su propia fila y las sugerencias en una fila deslizable. Verificado con medidas (opacidades calculadas, ancho de `main` = 375, cero elementos desbordados) y capturas. Filtros probados uno por uno: tramo, semana de caja, agrupar, búsqueda con resaltado, «Solo vencidas», panel de Filtros, chips, «Pagar con este saldo» (llega con lo marcado), «/», ↑ ↓, Espacio, Enter y Esc. **No verificable en este entorno:** abrir el modal desde `?pagar=` (en `main` tampoco abre en el panel de pruebas, así que no es una regresión).

## Lo que NO cambia

Cifras, columnas, tramos, textos y reglas de negocio. El pago individual de una fila (`RegistrarPagoModal`, que
permite repartir en varios medios) no se toca. «Pagar con este saldo» ahora llega con `?prov=…&marcar=1` y los
comprobantes del proveedor ya marcados.

## Verificación

- `por-pagar-reglas.test.ts`: 32 pruebas (las 13 anteriores + espejos de las funciones de Postgres, caja, plazo,
  pasos, concentración y resaltado). Suite completa: 1 179 pruebas verdes; `tsc` y `eslint` limpios.
- Navegador (dev, sesión de líder, base local): entrada y cifras; eco y filtro por clic contra el tramo 8–30
  (5 de 6 filas, S/ 38,668.60 = la cifra del tramo); selección con aviso «Empezó de nuevo…»; «＋ agregar»; vista
  rápida; modal con cascada y atajos; pago real de un comprobante completo y otro parcial → sello → pliegue →
  dato fresco, con las cifras cuadrando (44,402.20 = 43,802.20 + 1,800 − 1,200). Los comprobantes de prueba
  (`TSTPP-…`) se anularon al terminar, sin borrar nada.
- **Pendiente de ojo humano:** el panel del navegador estaba oculto durante la prueba (el navegador congela
  animaciones y `requestAnimationFrame` en ese estado), así que los conteos y el pliegue se verificaron por medidas
  en el DOM (alturas 76 → 34 → 3 → 1 px), no a simple vista. Falta mirarlo en vivo.
- **Ya existía:** en celular (390 px) la fila del buscador se desborda ~35 px por el botón «Filtros»; pasa igual en `main`.
