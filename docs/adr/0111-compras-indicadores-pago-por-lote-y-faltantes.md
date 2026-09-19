# ADR-0111 — Compras: indicadores para decidir, pago por lote y cierre de faltantes con nota de crédito

- **Fecha:** 2026-09-18
- **Estado:** Aceptado. **Solo local**: nada de esto está en producción; las migraciones se pegan
  con el prefijo `retail.` y ok explícito de Felipe (CLAUDE.md, «Cómo aplicar SQL a producción»).
- **Decide:** Felipe (D1, D2, D3 y «sin comprobante»). Arquitectura: este documento.
- **Diseño:** `docs/maquetas/compras-2026-09/` (11 pantallas aprobadas; la implementación debe verse igual).

## Contexto

Felipe pidió que cada pantalla de Compras (Proveedores, Comprobantes, Recibir mercadería,
Por pagar) ayude a decidir —indicadores clave— con la mejor UI/UX. Hallazgos previos (verificados
contra producción el 2026-09-18):

1. Producción no tiene datos de este módulo (1 proveedor, 0 comprobantes, 0 pagos, 0 recepciones):
   los indicadores deben decir con honestidad «se calcula con N o más…» en vez de inventar tendencias.
2. La base ya calcula lo que la pantalla no mostraba: `por_recibir_atrasadas`, `facturas_atrasadas`,
   `compras.fecha_estimada_llegada` (y `registrar_compra` ya acepta `p_fecha_estimada_llegada`).
3. El `plazo_credito_dias` del proveedor se guarda y nadie lo lee al registrar un comprobante.
4. «Hoy» era `current_date` (UTC): de 7 pm a medianoche de Lima ya era mañana.
5. Cinco copias de «tarjeta de cifra» en el módulo.

## Decisiones

**D1 — Al recibir, las cantidades arrancan en 0.** Cada línea pasa de «Sin contar» a «Completa» o
«Faltan N»; «Todo llegó» llena un comprobante en un toque. El stock solo sube con lo confirmado
(principio 2). Lo que no se cuenta no suma y sigue pendiente. Cambiar de comprobante con
cantidades anotadas pide confirmación.
*Corrección (2026-09-18, tras probarlo Felipe):* «sin contar» es el campo **vacío**, no el 0. Un 0
escrito es un dato —«se contó y no llegó nada»— y esa línea queda «Faltan N» y puede cerrarse.
Antes el campo mostraba 0 por defecto y una línea que de verdad llegó en 0 nunca ofrecía cerrar el faltante.

**D2 — Faltantes: cierre de línea + nota de crédito del proveedor, como libro append-only.**
Dos tablas nuevas que nunca se editan ni se borran; el saldo y el estado de recepción **siguen
siendo un cálculo** (principio 4). Sirven también, más adelante, para devoluciones al proveedor
(ADR-0094) y descuentos.
- `compra_item_cierres`: «estas N unidades de esta línea no van a llegar» (motivo: `no_llego`,
  `danada`, `error_proveedor`). `pendiente = cantidad − recibido − cerrado`.
- `compra_notas_credito`: documento legal del proveedor (serie-número, fecha, monto con IGV
  desglosado). `saldo = total − pagado − notas_credito`. El IGV de la nota **resta del crédito fiscal**
  del mes en que se registra.
- Una línea cerrada deja de contar como «por recibir»/«atrasada». Cuando `recibido + cerrado ≥
  facturado` el comprobante pasa a `recibida`.
- La nota puede registrarse junto con el cierre o después, desde el comprobante.
- *Corrección (2026-09-18):* en la guía de recepción **no hay un modal por línea que escriba al
  instante**. Cada línea que llegó corta lleva solo una decisión en el panel «Lo que faltó» —«lo espero
  (sigue pendiente)» o el motivo por el que no va a llegar— y **un único botón de confirmar** registra, en
  este orden: `recibir_compras` (si algo llegó), un `cerrar_linea_compra` por línea (siempre la cantidad
  entera que faltó) y **una sola** nota de crédito por comprobante (`registrar_nota_credito_compra`), con el
  monto sugerido = lo cerrado a su costo + IGV. Motivos: varias líneas cortas son lo normal, y el proveedor
  emite una nota por comprobante, no por línea. Si falla algo tras la recepción, la línea sigue pendiente
  (estado válido) y se informa cuál; jamás se reintenta la recepción (sumaría el stock dos veces). Cerrar
  solo una parte de una línea sigue siendo posible desde el detalle del comprobante (modal, sin guía de por medio).
- *Causa del defecto anterior:* el modal se montaba en un portal pero dentro del `<form>` de la guía; React
  propaga eventos por el árbol de componentes y no por el DOM, así que el «enviar» del modal disparaba también
  el `onSubmit` de la guía y registraba TODA la recepción al cerrar una sola línea.

**D2, segunda corrección (2026-09-18) — la nota de crédito se ordena y lo que no baja una deuda queda
como SALDO A FAVOR del proveedor.** Felipe probó la guía de recepción y de ahí salieron tres reglas:
- *La decisión del faltante vive en la MISMA fila.* Una línea que llega corta abre «¿qué pasó?» (lo espero, o el
  motivo por el que no va a llegar); «Guardar» la deja visible en la columna Estado; el confirmar no se habilita
  hasta que cada fila corta tenga su decisión. Al final de la guía solo queda la nota de crédito. «Guardar» guarda
  en la guía, no en la base: los cierres son irreversibles y todo se registra junto, en UNA transacción
  (`recibir_y_cerrar_compras`, que orquesta `recibir_compras` + `cerrar_linea_compra` + `registrar_nota_credito_compra`).
- *Nota por faltante: una por comprobante y solo con el comprobante resuelto al 100 %* (recibido + cerrado = facturado),
  con al menos un cierre y sin pasar de lo cerrado a su costo + IGV (+ S/ 1 de margen). Las aplica
  `fn_insertar_nota_credito_compra`, el único punto por donde pasan todas las notas (más un índice único parcial
  `compra_notas_credito_faltante_unica`). Devolución, descuento y «otro» no las llevan (SUNAT permite varias notas
  por factura; una regla de «una sola en total» bloquearía una devolución posterior legítima): solo se exige que
  ninguna suma de notas pase del total del comprobante. `cerrar_linea_compra` ya no registra la nota.
- *Lo que la nota no baja de la deuda queda a favor del proveedor.* Una factura AL CONTADO nace pagada (saldo 0), así
  que antes la base rechazaba cualquier nota sobre ella. Ahora la nota primero baja la deuda de SU comprobante
  (`compra_notas_credito.aplicado = min(monto, saldo)`) y el resto (`monto − aplicado`) entra al libro append-only
  `proveedor_creditos` (tipos `nota_credito` +, `aplicacion` −, `reembolso` −). **El saldo a favor no se guarda: es la
  suma del libro.** `compras.saldo` sigue siendo ≥ 0 y su significado no cambia (`compras.notas_credito` suma lo
  APLICADO), así que Por pagar y Proveedores no se tocan. Se usa como medio de pago (`saldo_a_favor`) en los tres
  lugares donde se paga —`registrar_pagos_compra`, `registrar_pago_compras` (nuevo `p_credito`) y `registrar_compra`—
  con candado por proveedor: dos pagos simultáneos no gastan el mismo saldo. Un reembolso del proveedor es un registro
  (`registrar_reembolso_proveedor`) que baja el saldo; no mueve caja. El saldo a favor no es plata que salga de caja.
  Se ve en la lista de Proveedores (columna «Saldo a favor»), en su ficha (saldo + historial), en Por pagar y en el
  modal de pago, donde viene ofrecido y activado. Migraciones: `20260918215000` a `20260918218000`.
- *Límites declarados:* el saldo es por proveedor (no por factura) y en soles; el reembolso no integra caja; la
  etiqueta «esperando nota de crédito» existe en el detalle del comprobante, no en las listas.

**D3 — Pago por lote.** Un solo pago (una transferencia) que se aplica a varios comprobantes **del
mismo proveedor**. Cada aplicación es una fila de `compra_pagos` (el historial por comprobante
sigue intacto) y todas comparten `pago_grupo_id`: conciliar con el banco = comparar una línea con
una suma. El pago individual de siempre (`registrar_pago_compra`) no cambia. Todo o nada, con
candado por comprobante y token de idempotencia. Si el monto es menor al total, la aplicación
sugerida cubre primero el más vencido (editable).

**«Recibir sin comprobante» se mantiene como excepción.** Se llama «Ingreso sin comprobante», vive
en Inventario, y **sale de la tarjeta del Inicio y del menú «+ Nuevo»**: queda una sola puerta
«Recibir mercadería» (con comprobante). Motivo: es el único camino que guarda proveedor + guía +
costo para lo que llega sin comprobante (`Ajustar inventario` no guarda ninguno de los tres);
la producción propia NO entra por aquí (`cerrar_produccion`). Nunca se usó en producción.

**Vocabulario.** «Comprobante» en todo el módulo; «factura» solo cuando el tipo lo es.

**Día de corte en Lima.** `fn_hoy_lima()` (migración `20260918200000`) reemplaza `current_date` en
todo cálculo de vence/venció/atrasada. En TypeScript, `hoyLima` (`lib/traslados-reglas.ts`).

**Una sola tarjeta de cifra.** `TarjetaCifra` (ADR-0101) se extiende; `Indicador`, `Cifra` y
`TarjetaIndicador` en Compras migran a ella.

## Contrato SQL (schema `retail`; nombres y columnas exactos)

Todas: `security definer`, `set search_path = retail, public, extensions`, `revoke ... from public,
anon; grant execute ... to authenticated` (ADR-0078), y el mismo candado de sede/rol que las
funciones vecinas (`fn_puede_operar_ubicacion(...)`, y `fn_es_lider()`/equivalente para lo financiero
de Proveedores). Migraciones con `set search_path = retail, public, extensions;` al inicio, sin
prefijo `retail.` en los nombres de tabla (CLAUDE.md). Aplicar a la base local **sin** `db reset`.

### Escritura y modelo (agente `db-escritura`, timestamps `20260918201000`–`20260918169999`)

- `compra_pagos.pago_grupo_id uuid null` (índice parcial).
- `registrar_pago_compras(p_proveedor_id uuid, p_metodo text, p_aplicaciones jsonb, p_referencia text default null, p_fecha date default null, p_token uuid default null) returns uuid`
  — `p_aplicaciones = [{"compra_id": uuid, "monto": numeric}, …]`; devuelve `pago_grupo_id`. `p_fecha` null = `fn_hoy_lima()`.
  Valida: mismo proveedor, comprobantes vigentes con saldo, `0 < monto ≤ saldo`, sin duplicados, ≥1 aplicación. Idempotente por token.
- Tablas `compra_item_cierres(id, compra_item_id, cantidad int > 0, motivo, nota, usuario_id, created_at)` y
  `compra_notas_credito(id, compra_id, cierre_id null, serie_numero, fecha, subtotal, igv, monto, motivo, nota, usuario_id, created_at)`
  (`unique (compra_id, serie_numero)`). RLS de solo lectura como `compra_pagos`; sin update/delete.
- `cerrar_linea_compra(p_compra_item_id uuid, p_cantidad int, p_motivo text, p_nota text default null, p_nota_credito jsonb default null) returns jsonb`
  — `p_nota_credito = {"serie_numero": text, "fecha": date, "monto": numeric}` (el IGV se desglosa con el porcentaje de la compra);
  devuelve `{"cierre_id": uuid, "nota_credito_id": uuid|null}`. `p_cantidad ≤ pendiente`.
- `registrar_nota_credito_compra(p_compra_id uuid, p_serie_numero text, p_fecha date, p_monto numeric, p_motivo text, p_nota text default null, p_cierre_id uuid default null) returns uuid`
  — `monto ≤ total − pagado − notas previas`. Solo líder.
- Snapshot de `compras` y vistas: nuevas columnas `compras.notas_credito numeric`, `compras.cerrado_cantidad int`;
  `compras_resumen` las expone; `compra_items_resumen` expone `cerrado` y `pendiente` lo descuenta;
  `saldo`, `estado_pago`, `estado_recepcion` y `atrasada` los consideran; triggers de snapshot extendidos.
  `recibir_compras`: el tope por línea es `cantidad − recibido − cerrado`.
- `compras_resumen.vencida` y los filtros por vencimiento de `listar_compras`: `current_date` → `fn_hoy_lima()`.

### Lectura (agente `db-lectura`, timestamps `20260918210000`–`20260918219999`)

Usan `fn_hoy_lima()` y las columnas del snapshot de `compras` (`saldo`, `pagado`, `estado`, `vencida`…) para
seguir correctos cuando aterrice D2.

- `resumen_compras()`: sin cambiar `RETURNS`; solo `current_date` → `fn_hoy_lima()`.
- `resumen_compras_extra() returns table(unidades_pendientes bigint, valor_por_recibir numeric, dias_mas_atrasada int, documento_mas_atrasada text, proveedor_mas_atrasado text, compras_mes numeric, compras_mes_anterior numeric, igv_mes numeric, top_proveedor_id uuid, top_proveedor_nombre text, top_proveedor_pct numeric)` — una fila. `igv_mes` = IGV de facturas del mes menos el IGV de las notas de crédito del mes (si la tabla ya existe).
- `deuda_por_vencimiento() returns table(tramo text, comprobantes int, monto numeric)` — siempre 4 filas: `vencida`, `0_7`, `8_30`, `mas_30`.
- `salidas_caja_30d() returns table(orden int, etiqueta text, desde date, hasta date, comprobantes int, monto numeric, es_vencido boolean)` — 6 filas: Vencido, 4 semanas desde hoy, Después.
- `por_pagar_tramos(p_proveedor_id uuid default null, p_condicion text default null, p_solo_vencidas boolean default false, p_busqueda text default null) returns table(tramo text, comprobantes int, saldo numeric)` — `vencidas` | `semana` | `despues`; mismos filtros que `listar_compras`.
- `resumen_recepciones(p_desde date default null) returns table(unidades_recibidas bigint, recepciones int, dias_entrega_promedio numeric, comprobantes_recibidos int, entregas_completas int, faltante_unidades bigint, faltante_comprobantes int)` — una fila; `p_desde` null = 90 días atrás.
- `listar_recepciones_compras(p_proveedor_id uuid default null, p_desde date default null, p_hasta date default null, p_busqueda text default null, p_limite int default 30) returns table(lote_id uuid, fecha_recepcion timestamptz, ubicacion_nombre text, proveedor_id uuid, proveedor_nombre text, numero_guia text, recibido_por uuid, compra_id uuid, documento text, unidades_llegaron int, unidades_facturadas int, faltante int, dias_demora int)` — una fila por (lote, comprobante).
- `resumen_sin_comprobante(p_ubicacion_id uuid default null) returns table(unidades_mes bigint, recepciones_mes int, unidades_sin_costo_mes bigint, ultima_recepcion timestamptz, ultima_ubicacion text)`.
- `recepciones_sin_comprobante(p_ubicacion_id uuid default null, p_limite int default 20) returns table(lote_id uuid, fecha_recepcion timestamptz, ubicacion_nombre text, proveedor_nombre text, numero_guia text, nota text, recibido_por uuid, unidades int, costo_unitario_promedio numeric, sin_costo boolean)`.
- Proveedores (financiero = solo líder, `NULL` si no lo es, igual que hoy):
  - `fn_proveedores()` (drop + create): columnas actuales + al final `facturado_12m numeric, saldo_vencido numeric, dias_desde_ultima_compra int, entregas_por_recibir bigint`.
  - `fn_proveedores_resumen() returns table(activos int, desactivados int, deuda_total numeric, con_saldo int, con_vencidas int, top_proveedor_id uuid, top_proveedor_nombre text, top_pct numeric, top3_pct numeric, sin_compras_90d int)`.
  - `fn_proveedor_metricas_compras(uuid)` (drop + create): columnas actuales + `facturado_12m numeric, monto_vencido numeric, entregado_completo_pct numeric, dias_entrega_promedio numeric, dias_entrega_muestra int, dias_pago_real_promedio numeric, dias_pago_muestra int` (`dias_pago_real_promedio` es `NULL` con menos de 2 comprobantes pagados por completo).
  - `fn_proveedor_costo_evolucion(p_proveedor_id uuid, p_limite int default 6) returns table(producto_id uuid, referencia text, compra_id uuid, documento text, fecha date, costo_unitario numeric)` — la referencia más comprada a ese proveedor, por `compra_items`, orden cronológico.
  - `fn_proveedor_devoluciones(p_proveedor_id uuid) returns table(unidades bigint, ultima date)` — prendas en estado `devuelta_proveedor` (ADR-0094).

## Pantallas y archivos

Ver `docs/maquetas/compras-2026-09/README.md` (correcciones que mandan sobre las imágenes incluidas).

## Consecuencias / pendiente

- **Producción:** las migraciones `20260918200000`–`20260918219999` se pegan con `retail.` y ok de Felipe;
  D2 toca el saldo (dinero): probar antes con datos reales de un comprobante de prueba.
- Los indicadores dependientes de historial (días de pago, % entregado completo, tendencia de costo)
  aparecen con muestra mínima; con menos, la pantalla lo dice.
- Sin pruebas de UI automáticas: la verificación visual se hace contra las maquetas.
