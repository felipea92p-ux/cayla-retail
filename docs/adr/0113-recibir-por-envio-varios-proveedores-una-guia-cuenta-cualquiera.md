# ADR-0113 — Recibir mercadería por ENVÍO: varios proveedores, una guía, cuenta cualquier colaborador

- **Fecha:** 2026-09-18
- **Estado:** Aceptado. **Solo local**: las migraciones `20260919120000` y `20260919121000` NO están en
  producción; se pegan con el prefijo `retail.` y ok explícito de Felipe (CLAUDE.md, «Cómo aplicar SQL a
  producción»). Antes, la rama de Compras (ADR-0111) tiene que estar en producción: `recibir_envio` la
  llama.
- **Decide:** Felipe (envío con varios proveedores, guía única, origen de lo fuera de comprobante,
  «cualquier persona cuenta en la puerta», indicadores bajo «¿Qué llegó?»). Arquitectura: este documento.
- **Diseño:** `docs/maquetas/recibir-envio-2026-09/` (adaptada del diseño que Felipe eligió, con la
  identidad de CAYLA; su README dice en qué manda la pantalla construida) y la pantalla en `/recibir`.

## Contexto

1. **Una guía = un lote = un proveedor** (ADR-0035). `recibir_compras` levanta «Una recepción cubre
   facturas de un solo proveedor» y `lotes.proveedor_id` es NOT NULL; la lista atenuaba a los otros
   proveedores en cuanto se marcaba uno. Pero lo que llega a la puerta es un **envío** —una agencia, una
   guía, varios bultos— y en él vienen comprobantes de proveedores distintos. Los proveedores no traen «su»
   guía: la recepción es por envío (Felipe).
2. **Solo un líder podía recibir contra comprobante.** `/compras/*` está detrás de un layout solo-líder
   (montos, pagos, notas de crédito), así que el colaborador —quien de hecho abre la caja— solo tenía el
   «Ingreso sin comprobante». ADR-0075 ya le permite *leer* las compras de su sede y `recibir_compras` ya
   valida con `fn_puede_operar_ubicacion`: lo único que lo impedía era la pantalla.
3. **Lo fuera de comprobante no decía de dónde venía** (ADR-0076: el proveedor de la guía se daba por
   hecho), y la mercadería de **otra sede de CAYLA** que viaja en el mismo envío no tenía camino.
4. **Un doble toque en «Recibir» duplicaba el stock**: ni `recibir_compras` ni el formulario mandan token de
   idempotencia (a diferencia de ventas y cambios).

## Decisión

**D1 — El envío agrupa lotes; el lote sigue siendo de UN proveedor.** Tablas nuevas `envios` (guía, ubicación,
quién, cuándo, `token_cliente`) y `lotes.envio_id`. Del lote cuelgan el lead time del reorden
(`lotes.fecha_recepcion` + `movimientos.compra_item_id`), las vistas de recepción por proveedor y su
confiabilidad: con el lote intacto nada de eso cambia.

**D2 — Una sola RPC atómica: `recibir_envio`.** Agrupa los ítems por el proveedor de cada comprobante (lo
deduce el servidor, nunca el cliente), llama a `recibir_compras` una vez por proveedor —sin reescribirla: sus
topes, su costo promedio y sus candados siguen mandando—, registra lo fuera de comprobante y lo de otra sede,
y ejecuta los cierres y notas de crédito, todo en UNA transacción. Si algo falla no queda nada (ni el token:
el intento fallido no lo consume). Idempotente por `p_token`.

**D3 — Una guía por envío.** Un solo campo, que se copia a cada lote.

**D4 — Lo fuera de comprobante lleva su origen.**
- *De un proveedor* (`envio_extras`: movimiento, proveedor, `es_regalo`): entra al lote de ese proveedor, o
  abre uno si ese proveedor no trajo comprobante. Un **regalo** entra al stock sin costo, no toca el costo
  promedio y no cuenta como «sin costo» faltante (fue intencional).
- *De otra sede de CAYLA* (`envio_traslados`): **no se ingresa como prenda suelta**. Se cuenta y confirma el
  traslado en tránsito (`registrar_recepcion_traslado` + `confirmar_traslado`, ADR-0068), porque el stock del
  origen ya bajó al enviarlo; ingresarlo de nuevo duplicaría el de la empresa (principios 2 y 4). Si el origen
  no registró el traslado, primero tiene que hacerlo. Lo contado que no coincide queda para que un líder lo
  cierre, como siempre.

**D5 — Cuenta cualquier colaborador de la sede.** La pantalla vive en `/recibir`, fuera de `/compras`.
`recibir_envio` conserva las reglas de sus RPC: opera la sede (`fn_puede_operar_ubicacion`), cerrar una línea
como `cerrar_linea_compra`, la nota de crédito solo líder (`fn_puede_registrar_compras`, es dinero). Un
colaborador solo recibe comprobantes destinados a SU sede (la misma regla con que ya los ve).
- **Sin dinero para quien no es líder:** la página se arma en el servidor y a un colaborador los montos y
  costos le llegan en cero (`comprobanteSinMontos` / `lineaSinCosto`), ni siquiera salen al navegador.
- **Quién decide qué pasa con lo que faltó** es una decisión *de la pantalla*, no de la base: un colaborador
  cuenta y lo que falta queda pendiente («Sigue pendiente»); el líder decide si se espera o se cierra, como
  en Traslados (cuenta cualquiera, un líder cierra las diferencias). Relajarlo no requiere migración.

**D6 — Los cuatro indicadores** (por recibir, unidades pendientes, atrasadas, la más atrasada) viven
**debajo de «¿Qué llegó?»** y desaparecen al marcar un comprobante, para dejarle toda la pantalla a quien
cuenta.

Además: la lista se **marca** (casillas, filtros Todas / Atrasadas / Próximas), cada comprobante es un bloque
plegable con su avance, un **escaneo** suma 1 al comprobante que trae esa prenda (SKU o código de barras, la
misma pistola del POS y de Conteo), y la barra fija dice Esperadas · Contadas · Sin contar · Faltantes ·
Fuera de comprobante (D1 y D2 de ADR-0111 se conservan: «sin contar» ≠ «faltan»).

## Descartado

- **Quitar el NOT NULL de `lotes.proveedor_id` / varios proveedores por lote:** mezclaría en una fila el costo,
  el atraso y el faltante de proveedores distintos y rompería las métricas por proveedor.
- **Que la pantalla parta el envío en N llamadas a `recibir_compras`:** si la segunda falla, la primera ya
  está en el stock (una recepción a medias).
- **Una columna «regalo» en `movimientos`:** el libro es núcleo (principio 1); el atributo solo aplica a lo
  que llega fuera de comprobante y vive en `envio_extras`.
- **Una excepción en el layout de Compras para abrir solo `/compras/recibir`:** un layout no se vuelve a
  ejecutar al navegar entre sus páginas, así que un colaborador que entró por Recibir llegaría a las pantallas
  de dinero por un enlace interno. Moverla a `/recibir` deja el candado de Compras intacto. `/compras/recibir`
  redirige (307, conserva `?compra=` y `?prov=`).
- **Ingresar lo «interno» como prenda suelta** (ver D4).

## Consecuencias / pendiente

- **Producción:** aplicar `20260919120000` y `20260919121000` (con `retail.` y ok de Felipe) **después** de
  la rama de Compras (ADR-0111). Probar antes con un envío real de prueba: toca stock y, con cierres, el saldo.
- **Verificado:** 29 pruebas contra el Postgres local (`pnpm pruebas:recibir-envio`, en transacciones con
  rollback: un lote por proveedor, idempotencia, atomicidad, quién cuenta, regalo sin costo, envío interno con y
  sin diferencia, RLS), 24 pruebas de las reglas de la pantalla (`envio-reglas.test.ts`) y un envío de punta
  a punta desde la pantalla como líder (2 proveedores, un regalo y un traslado del Taller).
- **`RecepcionCompraFormV2.tsx` y `compras/recibir/page.tsx` quedan sin uso** (la ruta redirige). Se borran
  cuando la sesión de Compras confirme que no los está tocando.
- **El historial** («Recibidas recientemente») todavía lista una fila por comprobante (los de un mismo envío
  comparten guía); agruparlo por envío es lo siguiente.
- **Sin hacer:** borrador local del conteo, miniaturas de prenda, foto de la guía, «Imprimir». Y ni
  `recibir_compras` ni `recibir_lote` sueltos tienen token: hoy solo `recibir_envio` es idempotente.
- **Cruce conocido:** ADR-0107 de la rama `modulos-por-tienda` (un comprobante repartido entre tiendas,
  `compra_item_destinos`) reescribe las mismas funciones. `recibir_envio` es por ubicación, así que encaja: el
  tope por tienda se agrega dentro de `recibir_compras`, no aquí.
