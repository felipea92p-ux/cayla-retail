# Contrato · registrar el comprobante de una orden (ADR-0362, fase 2, actividades 3 a 8)

Felipe aprobó el 2026-10-12 hacer las actividades 3 a 8 juntas, el mismo día. Este archivo es el acuerdo entre la base y la pantalla:
quien construye una de las dos partes no inventa lo que la otra espera. Decisiones que lo gobiernan (ADR-0362): 5–9, 16, 21, 39, 40–45.

## La base ya trae (migración `20261012205000_compras_lineas_de_orden.sql`)

- `compra_items.producto_id` puede ir vacío si la línea trae `categoria_id` y `marca_id` (candado `compra_items_prenda_o_categoria_marca`;
  y `compra_items_variante_con_prenda`). Columnas nuevas: `categoria_id`, `marca_id`, `orden_compra_item_id` (N a 1),
  `precio_venta_sugerido` (opcional, ≥ 0).
- `compras.orden_compra_id` y `compras.huella_envio`. El papel (proveedor, serie, número) es único solo entre los **vigentes**
  (`compras_papel_vigente_unico`).

## La función: `retail.registrar_comprobante_orden` (migración `20261012211000`)

```sql
retail.registrar_comprobante_orden(
  p_orden_id uuid,
  p_tipo text,                           -- 'boleta' | 'nota_venta' | 'factura'
  p_serie text,
  p_numero text,
  p_lineas jsonb,                        -- ver abajo
  p_fecha_emision date default null,     -- null = retail.fn_hoy_lima()
  p_condicion text default 'credito',    -- 'credito' | 'contado'
  p_fecha_vencimiento date default null, -- obligatoria al crédito (≥ emisión)
  p_suma_igv boolean default true,       -- solo factura: los costos de las líneas son SIN IGV y se suma el 18 %; boleta y nota: IGV 0
  p_total numeric default null,          -- factura con IGV: el total impreso, para cuadrar el redondeo como `registrar_compra`
  p_pago jsonb default null,             -- contado: [{monto, metodo, referencia?, cuenta_id?}] que suma el total (formato de `registrar_compra`)
  p_nota text default null,
  p_token uuid default null
) returns jsonb
```

**Cada línea de `p_lineas`:** `{ "orden_compra_item_id": uuid|null, "categoria_id": uuid|null, "marca_id": uuid|null,
"descripcion": text|null, "cantidad": entero > 0, "costo_unitario": numérico ≥ 0 con 2 decimales y SIN IGV,
"precio_venta_sugerido": numérico ≥ 0 | null }`.
- Con `orden_compra_item_id`: tiene que ser una línea de ESTA orden; categoría y marca salen de la línea pedida (se ignoran las
  mandadas); la descripción, si no viene, también. Varias líneas pueden traer la misma (la pantalla parte una línea en dos para que
  los centavos cuadren con el papel).
- Sin `orden_compra_item_id` (algo que no estaba en la orden, decisión 43): `categoria_id` y `marca_id` obligatorias y activas.

**Devuelve:** `{ "compra_id", "documento" (serie-número), "total", "saldo", "avisos": [...] }`. Los avisos NO bloquean (decisión 43):
- `{ "tipo": "de_mas", "orden_compra_item_id", "posicion", "descripcion", "pedido", "facturado_antes", "esta_vez" }` cuando lo
  facturado en comprobantes vigentes de esa línea, más esta vez, pasa lo pedido.
- `{ "tipo": "fuera_de_orden", "descripcion", "esta_vez" }` por cada línea sin línea pedida.

**Reglas que hace cumplir:**
1. Permiso: SOLO el módulo Órdenes de compra (`retail.fn_ve_modulo('ordenes_compra') is true`), también para el contado (decisión 42).
   Sin él: 42501 «Registrar el comprobante de una orden necesita el módulo «Órdenes de compra» en tu rol».
2. Firma: `retail.fn_actor_persona_id(true)`; si es nula (una terminal sin elegir responsable), error claro. Clave nueva
   `orden_compra_comprobante` en `retail.acciones_sin_responsable` (como las `orden_compra_*`, decisión 39).
3. La orden se bloquea (`for update`), existe, está `generada` y tiene «Llega a». Una orden «Por repartir» (sin destino) NO registra
   comprobante hoy: pasa a la fase 3 (Felipe 2026-10-12).
4. Proveedor = el de la orden; tienda gestora = «Llega a» (`ubicacion_destino_id`); naturaleza `mercaderia`; llegada estimada = la de
   la orden.
5. Tipo válido; serie y número no vacíos; emisión ≤ hoy; crédito con vencimiento ≥ emisión; contado con pago que suma el total.
6. Totales: subtotal = Σ cantidad × costo_unitario; IGV = factura y `p_suma_igv` → `round(subtotal × 0.18, 2)` (o lo que pida
   `p_total` dentro de la tolerancia de `registrar_compra`); boleta y nota → 0 y el total es exactamente el subtotal.
7. Escribe `compras` (con `orden_compra_id`, `huella_envio`, `token_cliente`), `compra_items` (sin prenda), `compra_item_destinos`
   (todo a la gestora) y, al contado, `compra_pagos` **sin tienda** (a nombre de la empresa, decisión 41) con su `cuenta_dinero_id`
   (la sella `fn_compra_pagos_sellar`); el saldo a favor como medio, igual que `registrar_compra`. NO toca stock ni `movimientos`: la
   mercadería entra por guía (fase 4).
8. Idempotencia: el mismo `p_token` con la misma huella devuelve el mismo resultado; con otra huella, error «Ese envío ya se guardó con
   otros datos: recarga la pantalla». Papel vigente repetido: «Ese comprobante ya está registrado».

**En la misma migración:**
- `editar_orden_compra` rechaza si la orden tiene ALGÚN comprobante (vigente o anulado): «Esta orden ya tiene comprobante: no se
  edita. Si el papel está mal, anúlalo y regístralo de nuevo».
- `anular_orden_compra` rechaza si tiene un comprobante VIGENTE.
- `anular_compra`: además de quien tiene Facturas de proveedor, la anula quien tiene Órdenes de compra si el comprobante sale de una
  orden. Sus guardas no cambian (pagos, recepciones, notas de crédito, cierres).
- `fn_orden_compra_detalle` suma, por línea, `id`, `facturado` (en comprobantes vigentes) y `pendiente` (≥ 0); y a la orden,
  `comprobantes` (vigentes y anulados, el más reciente primero: `id`, `documento`, `tipo`, `condicion`, `fecha_emision`, `total`,
  `saldo`, `estado`, `estado_pago`) y `papel`: `sin_comprobante` | `en_parte` | `completa`.

## Recibir y las lecturas (migración `20261012210000`, actividad 3)

Una línea SIN prenda no se recibe ni se cierra por Recibir mercadería (llega por guía en la fase 4): `recibir_compras`,
`recibir_envio` y `cerrar_linea_compra` la rechazan («Esa línea todavía no tiene prenda: llega por guía, no por Recibir mercadería»;
`recibir_lote` no toca líneas de comprobante), y Recibir no la ofrece: `lineas_compra_operativo`, `listar_compras_operativo` y
`resumen_recepciones` la saltan (un comprobante con solo líneas sin prenda no sale «por recibir» en Recibir; en Compras, sí, porque
la mercadería todavía no llegó). Las lecturas que nombran la prenda de una
línea la muestran como «categoría · marca · descripción» o la saltan, sin romperse.

## La pantalla (actividades 4 a 8)

- **Botón «Registrar comprobante»** en la orden abierta (`components/ordenes-compra/AccionesOrden.tsx`), con la orden `generada` y con
  «Llega a». Con `papel = completa` sigue (lo de más se acepta) y la hoja lo avisa. En una orden «Por repartir» no aparece.
- **Página `/compras/ordenes/comprobante/[id]`** (hermana de `editar/[id]`): tipo (Boleta | Nota de venta | Factura), serie (el ejemplo
  sigue al tipo, ADR-0290), número, emisión, condición (Crédito | Contado), vencimiento (emisión + plazo del proveedor), «Sumar IGV
  (18 %)» marcado por defecto en factura; las líneas pedidas precargadas con lo pendiente y el costo neto de la orden (precio menos su
  descuento por unidad), editables; precio de venta sugerido opcional; «+ Algo que no estaba en la orden» (categoría y marca);
  totales; al contado, los medios y «Sale de» (`LineasPago`); el responsable como en `AccionesOrden`; guía de foco (ADR-0284). Al
  guardar vuelve a la orden con el aviso «B001-123 registrado · queda en Por pagar S/ X» y los avisos de «de más».
- **En la orden abierta:** cuánto llegó en papel por línea («8 de 10») y la lista de comprobantes con «Anular» (motivo →
  `anular_compra`).
- **Lógica pura** en `lib/comprobante-orden-reglas.ts` con su prueba: precarga, totales, cuadrar centavos (partir una línea en dos con
  la misma línea pedida), espejo de las validaciones de la función y avisos de «de más».
