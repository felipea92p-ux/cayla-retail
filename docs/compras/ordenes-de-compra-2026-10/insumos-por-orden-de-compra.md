> Anexo de diseño de ADR-0362 (sesión «Flujo de órdenes de compra», 2026-10-07/08). Salida de un workflow de agentes: **las
> decisiones de Felipe en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` mandan sobre este texto** donde choquen.
> Diseño de insumos por orden de compra. Felipe decidió después: sí por orden de compra, pero separada de la de tienda, con sus proveedores y su correlativo (decisiones 25 y 28).

**Recomendación: unir, sí.** La orden de compra pasa a ser la única puerta para comprar prenda e insumo. El circuito de comprobantes de Producción se cierra, no se mantiene en paralelo. Como esto revierte las decisiones 1 y 3 (D-H) de ADR-0133 y toca Compras, Producción, Por pagar y Finanzas a la vez, necesita el OK de Felipe antes de cualquier migración.

## Por qué unir

Si los dos circuitos conviven, la misma tela puede entrar por dos lados: un lote por la orden de compra y otro por `comprobantes_produccion`. Eso es un estado inconsistente que el esquema no impide (principio 2). Además habría dos directorios de proveedores, dos Por pagar y dos Recibir para una sola encargada de compras, que según la decisión 16 de ADR-0362 paga desde un único fondo. Hoy todo el circuito de Producción tiene 0 filas, así que retirarlo es barato ahora y cada mes de uso lo encarece.

## 1. La línea: un tipo y un CHECK por tipo

`orden_compra_items.tipo text not null check (tipo in ('prenda','insumo'))`:

| Campo | prenda | insumo |
|---|---|---|
| `categoria_id`, `marca_id` | NOT NULL (decisión 4) | NULL |
| `insumo_id` → `retail.insumos` | NULL | NOT NULL |
| `cantidad numeric(12,3) > 0` | CHECK `cantidad = trunc(cantidad)` | hasta 3 decimales |
| `precio_unitario numeric(12,4)`, descuento %, subtotal | igual | igual |
| Reparto por sede y despacho | sí | no: destino fijo, el Taller |

- Los CHECK de cada fila van en la propia tabla, no en la aplicación.
- **Unidad de medida:** no se copia a la línea. Se lee de `insumos.unidad_medida`, que ya es una lista cerrada. Para que una orden vieja no cambie de sentido, un disparador en `insumos` impide cambiar `unidad_medida` una vez que el insumo tiene lotes o líneas de orden. Así hay una sola fuente y ningún texto libre.
- **Destino:** la línea de insumo lleva `ubicacion_destino_id`, y un disparador exige `ubicaciones.tipo = 'taller'`. Se busca por tipo, no por nombre, igual que `puedeVerProduccion`.
- Otro disparador en `despacho_items` rechaza una línea de tipo insumo. El paso por «Lima» y la guía a una sede (decisiones 10 y 12) no aplican a la tela: va directo al Taller.

## 2. Dónde se recibe: en el Taller, `/produccion/recibir`

Una RPC nueva, `recibir_insumos_orden(p_orden_compra_id, p_lineas, p_token)`, copia las reglas que ya están probadas en `recibir_comprobante_produccion` (`20260921140000:145-244`):

1. Exige un taller por tipo y `fn_puede_operar_ubicacion`.
2. Bloquea la orden con `for update`.
3. No deja recibir más de lo pendiente (pedido − recibido − cerrado), con 3 decimales como máximo.
4. Es idempotente por token.
5. El código de lote sale del número de la orden, con `/2`, `/3`… si se repite.
6. Inserta en la misma transacción el `insumo_lote` y su `movimientos_insumo` de tipo compra.
7. Aplica la decisión 17: quien creó la orden no la recibe.

En `insumo_lotes`:
- Se agrega `orden_compra_item_id uuid references retail.orden_compra_items`.
- `origen` se queda en `'compra'`: la FK ya dice de dónde vino.
- Se agrega `check (num_nonnulls(comprobante_item_id, orden_compra_item_id) <= 1)`.

Los cierres por faltante reutilizan las deudas «por reponer» de la decisión 14, no los `_cierres` de Producción.

## 3. Cómo entra el costo al lote

- El costo del lote es el precio de la línea, corregido por quien recibe (decisión 18). Si ya hay una factura con «incluye IGV», se toma la base (decisión 6).
- **El costo se congela al recibir.** El PEPS sigue con lotes de costo fijo, porque un consumo ya registrado no puede cambiar de valor después.
- Si después llega un comprobante con otro precio, el lote no se reescribe. La diferencia queda como deuda o saldo a favor del proveedor, igual que en la decisión 14.
- Hay una sola excepción, que conviene decidir junto con las prendas de ADR-0362: si la diferencia es solo el IGV y el lote todavía no tiene consumos, se recalcula una vez.
- **Conflicto a resolver:** ADR-0126 dice que el Taller no ve montos, y la decisión 18 dice que todo el que recibe ve precios. Hay que aplicar una sola regla a la tela y a la prenda; recomiendo la 18. Si Felipe prefiere el candado de 0126, se mantiene una función de líneas sin importes, como `fn_lineas_comprobantes_produccion`, y el costo lo corrige el líder.

## 4. La «lista de compras» que llena la orden de producción

No existe receta (ADR-0133:44 y :80 no reviven `bom_items`), así que el faltante no puede salir de una explosión de materiales. Propuesta: una tabla `necesidades_insumo` con las columnas `orden_produccion_id`, `insumo_id`, `cantidad`, `estado` (pendiente / pedida / cubierta / cancelada) y `orden_compra_item_id`.

- Al crear la orden de producción, el sistema **sugiere** la cantidad: rendimiento medido (consumo real ÷ prendas buenas de las órdenes cerradas del mismo modelo) × prendas a cortar. La persona la corrige.
- Faltante = necesidad − saldo en `v_insumo_saldos` − lo que ya está pedido y sin recibir.
- La encargada convierte las líneas pendientes en una orden de compra agrupada por proveedor. Al recibir, la necesidad pasa a cubierta.

Esto no contradice la decisión 5: la cantidad estimada solo sirve para comprar, y el costo sigue saliendo del consumo real. Igual Felipe tiene que confirmar que estimar para comprar está permitido.

## 5. Qué pasa con el circuito actual de Producción

| Pieza | Destino |
|---|---|
| `comprobantes_produccion` (+ ítems, pagos, recepciones, cierres) | Se cierra la puerta: `revoke execute` de `registrar_comprobante_produccion`, `recibir_comprobante_produccion` y `registrar_pago_comprobante_produccion`, más una guarda que responda «usa la orden de compra». Las tablas (vacías) se quedan; borrarlas después es decisión de Felipe, con una guarda de 0 filas |
| Su rama en `fn_por_pagar_consolidado` (`:130`) | Se quita cuando las tablas se archiven; mientras tanto suma cero |
| `proveedores_produccion` | Un solo directorio: `retail.proveedores` gana `rubro` (prenda, tela, avíos, maquila, otro) y la FK de `insumos` y de `insumo_lotes` se repunta a ese directorio, con la misma guarda de 0 filas de `20260920110000:85-91`. Antes se confirma con un `select count(*)` en producción |
| `recibir_insumo` (ingreso manual, saldo inicial) | Se queda, solo para el líder |
| `registrar_consumo_insumo`, `OrdenInsumos.tsx` | Sin cambios |

## Costo y lo que se rompe

- **Decisión:** un ADR nuevo que revierte ADR-0133 D1 y D3 (D-H), y hay que resolver el choque entre ADR-0126 y la decisión 18.
- **Base:** el tipo y los CHECK en `orden_compra_items` mientras todavía nace (lo más barato), `insumo_lotes.orden_compra_item_id`, el repunte de proveedores, la RPC de recepción, la tabla de necesidades y el cierre de 3 RPC. Son unas 3 migraciones; la de proveedores va aparte por la regla de deadlocks.
- **Web:**
  - Reescribir `RecibirComprobanteModal.tsx`, `lib/recibir-produccion.ts` y `lib/recibir-produccion-reglas.ts` con sus pruebas.
  - En la línea de la orden de compra: un selector «Prenda / Insumo» con `SegmentoDeslizante`, y para el insumo un `ComboBuscable` más la cantidad con su unidad a la vista, sin grilla de talla × color.
  - Sacar del menú y de `modulos` las entradas de Comprobantes y Por pagar de Producción, y revisar `lib/modulos.test.ts`.
- **Se rompe o queda sin lugar:**
  - **Maquila y flete**, que hoy son líneas de concepto libre en `comprobantes_produccion_items`. Mientras no se defina un tercer tipo `servicio`, van por Gastos de Finanzas.
  - El Taller deja de tener su propio Por pagar.
  - `fn_gestora_con_parte` no aplica a las líneas de insumo y debe ignorarlas.

**Alternativa descartada: que convivan.** Costaría menos hoy, pero necesitaría un candado entre los dos circuitos contra el doble ingreso y obligaría a mantener dos directorios y dos Por pagar. Es la complejidad que el brief pide quitar.