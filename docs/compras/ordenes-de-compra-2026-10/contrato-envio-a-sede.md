# Contrato · el envío a una sede (ADR-0362, fase 3)

Felipe pidió la noche del 2026-10-12 «desarrollar de corrido» las fases que siguen. La fase 3 se construye sobre el diseño ya escrito en
ADR-0362 (decisiones 9–12, 19, 22, 34, 39–45 y el «Contrato provisional con la sesión de Recepción») y lo que el ADR no decide lo
decido aquí por defecto, marcado **[provisional]**: Felipe lo revisa al volver. Nada de esta fase se aplica en producción sin él.

## Qué es un envío

Una **guía**: lo que sale hacia **una sola sede** (decisión 12), con número de guía opcional, en un solo viaje. Puede llevar líneas de
**varias órdenes y varios proveedores** (decisión 11). La mercadería de una orden «directo a la tienda» va solo a esa tienda; la de una
orden «Por repartir» (llega a Lima, que no es una sede: ahí nada es stock, decisión 10 y 22) se reparte en una guía por sede. El envío
nace **«en camino»**; la sede lo **abre** y lo **cierra** al recibirlo (fase 4, no aquí). Se anula solo mientras está en camino. El
comprobante no bloquea (decisión 9): se envía con o sin papel. Un envío no mueve stock: el stock entra cuando la sede recibe (fase 4).

## La base (migración `20261012225000_compras_envios.sql`)

**Tablas** (RLS encendido, SIN políticas: se leen y escriben solo por funciones `security definer`):
- `retail.despachos`: `id`, `numero` (correlativo de la empresa, `ENV-000001`; anular no libera el número), `ubicacion_destino_id`
  (sede activa, obligatoria), `numero_guia` (texto opcional, hasta 40), `estado` (`en_camino` | `abierto` | `cerrado` | `anulado`),
  `nota` (hasta 500), `despachado_por` (persona, `fn_actor_persona_id(true)`), `despachado_en`, `abierto_por/en`, `cerrado_por/en`
  (los llena la fase 4), `anulado_por/en`, `motivo_anulacion` (obligatorio si `anulado`, hasta 300), `token_cliente` (único),
  `huella_envio`, `version`.
- `retail.despacho_items`: `id`, `despacho_id`, `orden_compra_item_id` (NOT NULL), `compra_item_id` (nulo: el comprobante no bloquea),
  `cantidad` (entero > 0), y CONGELADOS al enviar: `categoria_id`, `marca_id`, `descripcion`, `precio_unitario` (el neto de la orden:
  (precio × cantidad − descuento) / cantidad, a 2 decimales; quien recibe lo ve y lo corrige en la fase 4, decisión 18).
- Candado de esquema: lo enviado vigente de una línea pedida (envíos `en_camino`, `abierto` o `cerrado`) no pasa de **lo pedido o lo
  facturado, lo que sea mayor** (lo de más del papel se acepta, decisión 43) — trigger diferido con `for update` sobre la línea pedida.
  Una línea de una orden «directo a la tienda» solo va a esa tienda.

**Funciones** (todas piden el módulo Órdenes de compra, decisión 34; firman con `fn_actor_persona_id(true)` y una clave nueva
`orden_compra_envio` en `acciones_sin_responsable`, como la decisión 39):
- `retail.crear_envio(p_ubicacion_destino_id uuid, p_lineas jsonb, p_numero_guia text default null, p_nota text default null,
  p_token uuid default null) returns jsonb` → `{ "despacho_id", "numero" ("ENV-000012"), "sede", "unidades", "avisos": [] }`.
  `p_lineas`: `[{ "orden_compra_item_id": uuid, "cantidad": entero > 0 }]`. Valida: sede activa; cada línea de una orden `generada`;
  una orden «directo» solo a su tienda; cantidad ≤ lo que le queda por enviar (pedido o facturado, lo mayor, menos lo ya enviado);
  `compra_item_id` se llena con la línea del comprobante vigente de esa línea pedida si hay UNA sola (si hay varias o ninguna, queda nulo
  [provisional]). Idempotente con token + huella como `registrar_comprobante_orden`. Anota en Actividad sin montos.
- `retail.anular_envio(p_despacho_id uuid, p_version integer, p_motivo text) returns jsonb`: solo `en_camino`; motivo obligatorio.
- `retail.fn_envios_por_abrir(p_ubicacion_id uuid)` → los envíos `en_camino` a esa sede (para la fase 4; lo puede leer quien tiene
  Órdenes de compra o Recibir).
- `retail.fn_envio_detalle(p_despacho_id uuid) returns jsonb` → cabecera, líneas con su orden (`OC-…`), proveedor, categoría · marca ·
  descripción, cantidad y precio (Órdenes de compra o Recibir).
- `retail.fn_ordenes_compra_por_enviar()` → por orden `generada`: `orden_compra_id`, `unidades_por_enviar` (para la píldora «Por
  enviar» de la lista, sin cambiar la firma de `fn_ordenes_compra`).
- `fn_orden_compra_detalle` suma, por línea, `enviado` y `por_enviar`, y a la orden `envios` (`id`, `numero`, `sede`, `numero_guia`,
  `estado`, `despachado_en`, `unidades`).
- **Candados nuevos de la fase 1 que faltaban:** `editar_orden_compra` rechaza si la orden tiene algún envío (aun anulado: sus líneas
  cuelgan de las de la orden, igual que un comprobante); `anular_orden_compra`, si tiene uno vivo (`en_camino`, `abierto`, `cerrado`).
- **Una orden «directo» puede no tener envío (decisión 48):** la guía es opcional; la tienda recibe directo contra la orden (fase 4).

**De quién es la deuda (decisión 46, Felipe 2026-10-12) y «Por repartir» (la actividad 9 de la fase 2, pasada aquí):** para TODA orden,
la tienda que gestiona el comprobante es la sede asignada de QUIEN HIZO LA ORDEN (`colaboradores.ubicacion_asignada_id` de `creada_por`);
si no tiene, «Llega a»; si tampoco, la sede de quien registra; si nada, «Elige desde qué sede trabajas». La regla vive en una sola función,
`retail.fn_orden_compra_gestora(p_orden_id)`, que usan `registrar_comprobante_orden` y `fn_orden_compra_detalle` (campo `deuda_de`, para
que la pantalla diga de quién queda la deuda). `registrar_comprobante_orden` acepta una orden «Por repartir». Todo lo comprado va, en el
papel, a la gestora (`compra_item_destinos`, solo contable); el reparto físico lo hacen los envíos.

## La pantalla

- **En la orden abierta:** «Enviar a una sede» (orden `generada` con algo por enviar). En una orden «directo», la sede viene fija; en
  una «Por repartir», se elige. Las líneas vienen con lo que les queda por enviar, editable (0 = no va en esta guía). Número de guía
  opcional, nota opcional, responsable como en `AccionesOrden`. Página `/compras/ordenes/envio/[id]`. Al guardar vuelve a la orden con
  «ENV-000012 en camino a Tienda Trujillo».
- **La orden muestra** por línea «Enviado X de Y» y la lista de envíos con su estado (`<Chip>`) y «Anular envío» (hoja con motivo) en
  los que siguen en camino.
- **La lista de órdenes** gana la píldora «Por enviar» (cuántas órdenes tienen algo por enviar).
- Guía de foco (ADR-0284), sugerencias (ADR-0290), guía interactiva (ADR-0389), modo oscuro, `<Modal>` para las hojas.
- **Lógica pura** en `lib/envio-orden-reglas.ts` con su prueba: precarga de lo por enviar, validación espejo de la función, armado de
  `p_lineas`, lectura de la respuesta.

## Lo que NO es de esta fase

Abrir y recibir el envío en la sede, crear la prenda desde la línea, faltantes, sobrantes y dañadas (fase 4). Un envío con líneas de
varias órdenes desde una pantalla «Por enviar» de todo lo que llegó a Lima: la base ya lo acepta; la pantalla de esta fase arranca
desde una orden [provisional]. La guía impresa (guía de remisión) queda para después.
