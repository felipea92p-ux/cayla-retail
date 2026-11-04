# ADR-0607 · Ventas online (TikTok): el canal es un dato del apartado, el rol solo decide quién lo ve

- **Fecha:** 2026-11-03 · **Estado:** en construcción, actividad por actividad (rama `claude/modest-spence-e16da9`).
- **Pedido:** Felipe, 2026-11-03: «Se quiere empezar a hacer ventas por TikTok; siempre será un apartado, pero hay que especificar que es
  una venta online y no por tienda física. Pensamos manejarlo con un rol llamado "ventas online" para no mezclarlo con las ventas
  físicas». Pidió recomendación pensando en la escalabilidad y decidió: **la prenda sale de la sede en la que está quien vende** y
  **cómo se entrega es un dato del pedido: recojo en tienda o envío**.
- **Complementa:** ADR-0196 (Apartados, módulo propio), ADR-0161/0306 (módulos y roles), ADR-0408 (Pedidos web, la otra venta que no
  nace en caja), ADR-0377 (qué entra a los motores), ADR-0195 (políticas y deadlocks al pegar en producción).

## El problema primero

Una venta de TikTok es un apartado (la prenda se separa con adelanto y se entrega), pero no es una venta de tienda: si cae en la lista de
Apartados de Trujillo, la encargada la ve como suya; si cuenta en las metas de la tienda, la tienda parece vender lo que no vendió; y
si el piso la cuenta, el plan del piso se arma con una demanda que no pasó por el piso.

**Analogía CAYLA:** es la diferencia entre el cuaderno de pedidos del mostrador y el cuaderno de pedidos por teléfono. El pedido por
teléfono se despacha desde la misma bodega, pero no se anota en el mismo cuaderno ni se cuenta como lo que vendió el mostrador.

## Decisiones

**DECIDÍ 1 — El canal es una marca del dato, no un rol.** `retail.canales_venta (clave, nombre, es_fisico, activo)` con `tienda` y
`tiktok`; `separaciones.canal` y `ventas.canal` (default `tienda`: todo lo existente queda igual). La venta hereda el canal del apartado
que la originó. **DESCARTÉ** separar solo por rol: un rol dice qué pantallas ve una cuenta, no qué es el dato; si una líder registra un
pedido de TikTok o la persona de online cambia, el dato quedaría sin marca. **DESCARTÉ** un `CHECK (canal in ('tienda','tiktok'))`:
Instagram, WhatsApp o Shopify serían una migración cada vez; con la tabla son una fila.

**DECIDÍ 2 — Sin sede «Online».** La prenda sale de la sede donde está quien vende (decisión de Felipe). Una ubicación falsa exigiría
mover stock entre sedes antes de vender y rompería el Observatorio, los traslados y el plan del piso.

**DECIDÍ 3 — La entrega es dato del pedido:** `modo_entrega` (`recojo` | `envio`), `direccion_envio` y `enviado_en/por`. Un apartado de
la tienda física siempre es recojo; un envío exige a dónde; «enviado» solo existe en un envío (candado `separaciones_entrega_coherente`).

**DECIDÍ 4 — Una puerta que envuelve, no un parche.** `separar_prendas_online` llama a `separar_prendas` tal cual (stock, adelanto mínimo,
descuentos, caja, comprobante del anticipo) y marca la separación en la misma transacción. **DESCARTÉ** parchar `separar_prendas` y
`entregar_separacion` (ya reemplazadas diez veces por anclas): la herencia del canal a la venta va en un disparador sobre
`separaciones.venta_id`.

**DECIDÍ 5 — El módulo «Ventas online» muestra Apartados filtrado por canal;** Apartados normal solo lista `tienda`. Nace sin rol (ADR-0161);
el rol «ventas online» lo arma Felipe en Roles y accesos. (Actividades 2 a 4.)

## Fuera de esta fase

El dinero de TikTok (cuándo liquida, comisión) se registra con los medios de pago que ya existen; un medio y una conciliación propios
son una fase 2. Tracking de agencias de envío: no se integra; solo «Marcar enviado» con guía o agencia en texto.

## Se rompe si

Se agrega un canal físico (`es_fisico`): el candado «tienda ⇒ recojo» y `separar_prendas_online` asumen que el único físico es `tienda`.
