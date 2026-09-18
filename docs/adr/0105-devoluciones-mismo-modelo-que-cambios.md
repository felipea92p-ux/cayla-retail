# ADR-0105 — Devoluciones con el mismo modelo que Cambios

**Fecha:** 2026-09-18
**Estado:** Aplicado en local (rama `claude/interface-recommendations-8ce365`). **Sin migración
nueva y sin cambios de backend:** solo pantalla y lectura. Se puede desplegar sin orden especial.
**Afecta:** `/devoluciones` completa; `/cambios` (lector compartido, `?item=`, disponibilidad);
`lib/ventas-v2.ts`, `lib/devoluciones.ts`, `lib/devoluciones-reglas.ts`, `lib/cambios-reglas.ts`;
componentes `Devoluciones*`, `ComprasAgrupadas`, `FlujoGuiado`, `BuscadorVentas`.

## Contexto

Felipe aprobó el rediseño de Cambios (ADR-0104) —«me gusta, incluso el proceso de iniciar
cambio»— y pidió repetir la mayoría de sus funciones, flujo y diseño en Devoluciones. La
pantalla de antes era una lista plana de líneas sueltas, un modal por prenda y un bloque de
pendientes sin contexto.

Auditando `crear_devolucion`/`aprobar_devolucion` contra la base local salió lo que cambia el
diseño respecto a Cambios:

1. **Una devolución tiene dos tiempos.** La colaboradora la REGISTRA (`crear_devolucion`, queda
   `pendiente`) y un líder la APRUEBA (`aprobar_devolucion`: recién ahí se mueve el stock, se emite
   la nota de crédito y sale el reembolso). En Cambios todo pasa en el acto.
2. **`crear_devolucion` ya recibe una lista de prendas.** La pantalla de antes creaba una
   devolución por línea, y cada una aprobada emitía su propia nota de crédito parcial (07) en vez
   de una sola —total (06) si se devolvía toda la boleta—.
3. **La base no cruza devoluciones con cambios.** Una línea con un cambio hecho se puede devolver
   (y al revés): la prenda vuelve al stock dos veces. Hoy hay 0 casos locales. Hueco de otra clase
   que el de «venta anulada», que cerró en paralelo `20260918163712` (otra sesión).
4. **Lo que la clienta pagó no es `precio_unitario`.** `venta_items.descuento_unitario` existe y hay
   líneas con descuento reales (149.90 con 15 de descuento). Lo devuelto vale precio menos descuento.

## Decisión

### Modelo de pantalla (igual que Cambios)

Dos bloques que no se mezclan —«Iniciar una devolución» (buscador único, escanear, sin
comprobante) y «Actividad reciente» (15 días, filtros Todas / Con devolución / Sin comprobante)—
más uno propio de las devoluciones, **«Por aprobar»**. Al iniciar una devolución se van los tres y
queda el flujo guiado, en la misma página y sin modal (ADR-0044): **Venta → Prendas → Detalle →
Confirmación → registrada**. «Paso X de 4», foco al título de cada paso, Escape retrocede, y las
validaciones en vivo llevan el foco al campo que falta.

### Lo propio de Devoluciones

- **Varias prendas en una sola devolución**, cada una con su cantidad y su estado. Una sola
  devolución da una sola nota de crédito, total o parcial según lo devuelto.
- **Registrar no mueve nada; el impacto se dice «al aprobarla».** Inventario (piso o cuarentena por
  prenda), caja («al registrarla no se mueve») y, si la venta tiene un comprobante aceptado por
  SUNAT, la nota de crédito (ADR-0100). La caja se valida en la APROBACIÓN, no al registrar.
- **«Por aprobar»**: tarjeta con lo que necesita quien decide —prendas y su estado, cuánto pagó la
  clienta, motivo, quién pidió, y aviso de plazo—. El reembolso es opcional y es la última opción
  (R-37); efectivo con la caja cerrada frena antes de apretar el botón. Solo un líder ve las
  acciones; la base lo vuelve a exigir.
- **R-37, primero un cambio:** en el paso de las prendas, «Cambiar por otra prenda» abre Cambios
  sobre esa misma prenda (`/cambios?item=`), y Cambios ofrece el camino inverso (`/devoluciones?item=`).
- **Motivo de lista cerrada** (No le queda bien / No es lo que esperaba / Tiene un defecto / Cambió
  de opinión / Otro), que compone el texto de `p_motivo` — sin columna nueva.
- **«Anular venta»** pasa al encabezado de cada compra (solo líder, una vez por compra); el modal
  no cambia.

### Decisiones que tomé por Felipe y que se pueden revertir

- **Fuera de plazo NO bloquea, se avisa.** R-38 pone 15 días y en Cambios bloquea. En Devoluciones
  ya hay un líder que aprueba cada una y ninguna regla escrita dice quién decide pasado el plazo:
  se muestra el aviso en la lista, en la solicitud y a quien aprueba, sin inventar un bloqueo nuevo
  sobre algo que la base hoy permite. Bloquear como en Cambios es una línea
  (`estadoPrendaDevolucion`, `devolvible`).
- **El cruce cambio↔devolución se cubre en pantalla**, no en la base: `unidadesDisponibles` descuenta
  lo cambiado y lo devuelto (pendiente o aprobado) en las dos pantallas. La base sigue sin candado
  (BACKLOG).
- **El plazo se lee por color, igual en las dos pantallas (pedido de Felipe, 2026-09-18).** Verde
  mientras la compra está dentro del plazo —también en los últimos días, que se dicen con el texto
  «Vence en N días»— y rojo cuando venció. Vale para el chip de la fila, la validación del plazo y el
  chip de la tarjeta «Por aprobar». Sale de una sola fuente (`estadoPrendaVendida`,
  `estadoPrendaDevolucion`, `validarCambio`, `validarDevolucion`) con `tono` y `icono` (reloj / triángulo),
  así que el color nunca va solo. Se quitó el escalón ámbar de «por vencer»: si se quiere de vuelta, es
  cambiar `tono` en esas dos funciones. Rojo aquí no bloquea en Devoluciones (`devolvible` sigue en
  `true`): solo dice que un líder decide. Ojo: `globals.css` limita el rojo a 2 por pantalla; una
  búsqueda con varias compras vencidas puede pasarlo.

### Piezas compartidas (lo que evita dos copias)

- `getVentasRecientes` (antes `getVentasParaCambio`): un solo lector para las dos pantallas, con lo
  que Devoluciones necesita (devoluciones ya hechas por línea, descuento, comprobante aceptado) y
  `ventaItemId`. Reemplaza a `getLineasVentaParaDevolucion`, que tenía el mismo defecto de pedir
  todas las líneas de la sede sin orden (PostgREST corta en 1000).
- `FlujoGuiado` (encabezado con pasos, botones, panel de validaciones, hooks de foco y Escape),
  `ComprasAgrupadas` (lista por día y compra), `BuscadorVentas` (antes `CambiosBuscador`).
- En `cambios-reglas.ts`: estado `aviso` que no frena, `EstadoVisual`, `unidadesDisponibles`.

## Se descartó

- **Una columna estructurada `devoluciones.motivo_codigo`:** habría tocado `crear_devolucion` en
  paralelo con la migración de la otra sesión sobre esa misma función. Queda en BACKLOG para
  después de fusionar.
- **Un token de idempotencia en `crear_devolucion`** (como el de `registrar_cambio`, ADR-0032):
  también es backend. La pantalla apaga el botón y bloquea el doble clic con un `ref`; si la red se
  corta después del commit, el reintento sale con «ya se devolvieron…» —dice la verdad, pero
  confunde—. BACKLOG.
- **Mostrar «Pendiente» como filtro de la actividad:** ya tiene su propio bloque, «Por aprobar».
- **Prellenar el reembolso con lo pagado:** el botón «Todo (S/ X)» lo pone a pedido de quien
  aprueba; sugerirlo solo empujaría a devolver plata, la última opción.

## Consecuencias

- Sin migración: se puede fusionar y desplegar sin el orden especial de ADR-0104.
- Cambios cambia poco: usa el lector y las piezas compartidas, y una prenda con devolución
  registrada ya no ofrece «Iniciar cambio».
- El texto del motivo de las devoluciones nuevas es uno de cinco fijos (+ detalle); las viejas
  siguen con texto libre. Un `group by motivo` ya sirve para las nuevas.
- Al fusionar con `claude/blissful-mccarthy-3b06e5` (candado de venta anulada, solo base): sin
  choque de código; solo BACKLOG/BITÁCORA, y ese BACKLOG pide una pantalla que distinga ventas
  anuladas —ya lo hace esta—.

## Verificación

- 437 pruebas unitarias (26 nuevas en `devoluciones-reglas.test.ts`; las de Cambios pasaron de 35
  a 39), `tsc`, `eslint` y `next build` en verde.
- **Las 9 consultas nuevas contra el PostgREST local, como Felipe (líder) y de solo lectura**
  (token firmado con el secreto local; el script vive fuera del repo): relaciones embebidas,
  `descuento_unitario`, estado del comprobante, `?item=`, pendientes y cifras, con 16 prendas
  reales. La cifra «Valor devuelto» (S/ 234.80) coincide con la suma en SQL.
- La pantalla REAL `/devoluciones` renderiza con la sesión de Felipe (11 compras, 3 indicadores).
- Navegador, con datos de ejemplo en una ruta temporal, a 1024/768/390 px: lista, filtros,
  búsqueda con estados (ya cambiada, ya devuelta, pendiente, vence en 2 días, fuera de plazo, venta
  anulada), los 4 pasos, bloqueo sin motivo (foco al motivo) y sin destino (foco al destino), varias
  prendas, fuera de plazo que avisa sin frenar, el payload exacto a `crear_devolucion`, el error de
  la base (con foco), la pantalla de éxito, «Revisar y aprobar», reembolso mayor a lo pagado (avisa),
  efectivo con caja cerrada (frena; con Yape no), y la vista de integrante (sin acciones de líder).
  El flujo de Cambios se re-verificó tras el refactor.
- **Pendiente:** el clic real sobre `/devoluciones` con datos reales. El panel oculto del navegador
  no hidrata las páginas del menú (limitación conocida); el salto `?item=` se comprobó con datos
  reales solo del lado del servidor y con la ruta de ejemplo del lado del cliente.
