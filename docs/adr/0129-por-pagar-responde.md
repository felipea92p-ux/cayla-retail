# ADR-0129 — Por pagar responde: piezas que se hablan, vista rápida, cascada del pago y reacción al pagar

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

**D4 — La vista rápida no trae el historial de pagos.** Tocar una fila abre un cajón (mismo molde que
`ProveedorVistaRapida`) con saldo, total/pagado/crédito, la línea de vida (emisión → vencimiento → hoy) y el
«siguiente paso» (`pasosDeComprobante`, pura y probada). `CompraResumen` no trae los pagos y pedirlos en cada
clic sería una consulta más por fila; el historial completo sigue en el detalle, al que el cajón enlaza. Es solo
de líder (ADR-0126).

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
