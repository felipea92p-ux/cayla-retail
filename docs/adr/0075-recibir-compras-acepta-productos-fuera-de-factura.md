# ADR-0075 — `recibir_compras` acepta productos fuera de factura

**Fecha:** 2026-09-17
**Estado:** Decidido, construido y en producción. Migración
`20260917100000_recibir_compras_fuera_de_factura.sql` verificada en el Postgres
local compartido (4 escenarios por SQL en transacciones con `rollback`, más un
envío real desde el navegador que quedó como dato real — ver "Cómo se
verificó"). Pantalla: `RecepcionCompraFormV2.tsx`. **Aplicada en producción el
2026-09-17** vía Supabase MCP (`apply_migration` contra `vovjyyiafkxteijimpuy`,
registrada como `20260917193606_recibir_compras_fuera_de_factura`), con ok de
Felipe para merge + producción en el mismo paso. Verificado después contra la
base real: `retail.recibir_compras` con una sola sobrecarga (candado
ADR-0009/0004 intacto) y el cuerpo real ya tiene `v_con_factura`; `get_advisors`
no marcó nada nuevo.
**Afecta:** `supabase/migrations/` (función `recibir_compras`, sin cambios de
esquema — `movimientos.compra_item_id` ya era nullable desde ADR-0035),
`apps/web/components/RecepcionCompraFormV2.tsx`,
`apps/web/app/(app)/compras/recibir/page.tsx` (agrega `referencia` a la prop
`variantes`).

## Contexto

Felipe: "recibir mercadería" solo se rige respecto a las facturas — si una
prenda no está en ninguna factura de la guía, pero de verdad se envió o se
recibió, hoy no hay dónde anotarla sin salir de `/compras/recibir` y abrir
`/inventario/recibir` por separado, perdiendo que llegó en el mismo paquete
que lo facturado.

`recibir_compras` (ADR-0035) exige que cada ítem de `p_items` resuelva a un
`compra_item_id` real: tope contra `compra_items.cantidad`, variante debe
pertenecer al producto de la línea. Correcto para lo que factura el
proveedor — pero una guía real no siempre coincide con el papel: mercadería
de más, un error de tipeo del proveedor, o una prenda que se manda antes de
que llegue su factura.

`movimientos.compra_item_id` ya era nullable desde ADR-0035 —
`recibir_lote` (la recepción sin factura) siempre insertó con esa columna en
`null`. El hueco no era de esquema, era de la RPC: ningún camino dejaba
mezclar, en una misma llamada y un mismo `lote`, ítems con `compra_item_id` y
sin él.

## Decisión

**DECIDÍ: un ítem de `p_items` con `compra_item_id = null` es "fuera de
factura" — entra al mismo lote (misma guía, mismo proveedor) que los ítems
facturados, pero no cuenta contra ninguna línea ni toca `compras`/
`compra_items`/`compra_pagos`.**

- **No inventa deuda.** Nada en `compra_pagos` cambia — si el papel no lo
  factura, CAYLA no le debe nada al proveedor por esa prenda todavía (principio
  2: no se inventa un estado que el papel no respalda). Si el proveedor manda
  después una factura por eso, se registra como una `compra` nueva y se recibe
  normal contra ella — mismo camino de siempre, sin caso especial.
- **Costo opcional, mismo criterio que `recibir_lote`** (0003_funciones.sql):
  si se indica `costo_unitario`, corre `fn_recalcular_costo_variante` (mismo
  promedio ponderado que cualquier recepción, ADR-0067); si no, `variantes.costo`
  no se toca. No hay "factura" de la que copiar el costo — a diferencia de un
  ítem facturado, que siempre lo hereda de `compra_items.costo_unitario`.
- **Se exige al menos un ítem SÍ facturado.** Una recepción 100 % fuera de
  factura no es el caso de esta pantalla — es `/inventario/recibir`
  (`recibir_lote`), que ya existe para eso. `recibir_compras` rechaza el envío
  con un mensaje que apunta ahí, tanto en el cliente (botón deshabilitado
  mientras `unidadesFactura = 0`) como en la RPC (por si algún día hay otro
  llamador).
- **`fn_recalcular_costo_variante` no gana un origen nuevo.** Sigue con
  `p_origen = 'compra'` para ambos casos — la trazabilidad de "¿esto vino de
  una factura o no?" ya existe vía `movimiento_id → movimientos.compra_item_id`,
  no hace falta un tercer valor en el `check` de `p_origen`.
- **Proveedor y guía se heredan, nunca se piden aparte.** El fuera de factura
  no elige proveedor — es el mismo lote, mismo `numero_guia`, mismo
  `proveedor_id` que resuelven los ítems facturados. Coherente con "llegó en
  el mismo paquete".

## Consecuencias

- `getRecepcionesRecientes()` (`lib/compras.ts`) tenía un comentario que
  afirmaba "un lote es entero de un tipo u otro, nunca mixto" — deja de ser
  cierto. Se corrigió el comentario; el código en sí ya toleraba mixtos sin
  cambios (`unidades`/`lineas` suman todo el lote, `conFactura`/`compraId` se
  fijan con lo que SÍ tiene `compra_item_id`).
- `compra_items_resumen` (`recibido`/`pendiente`) no se altera — sigue
  contando solo movimientos con `compra_item_id = ci.id`. Lo fuera de factura
  correctamente no mueve el avance de ninguna línea.
- `getRecepcionesCompra` (detalle de una factura) tampoco cambia — su
  `inner join compra_items` ya excluye cualquier movimiento sin
  `compra_item_id`, que es lo que corresponde (esa vista es "qué entró DE
  ESTA factura").
- La UI de "fuera de factura" reusa el patrón `flex flex-wrap` de
  `RecepcionFormV2.tsx` (recibir_lote), no el `grid` de columnas fijas de las
  líneas de factura — con 5 controles por fila (producto, talla/color,
  cantidad, costo, quitar) un grid de columnas fijas se salía del ancho de la
  tarjeta en pantallas angostas (encontrado probando en el navegador a
  1024×768, no solo en desktop ancho).

## Cómo se verificó

**SQL, en transacciones con `rollback`** (impersonando al líder de
`supabase/seed.sql`, `request.jwt.claim.sub`), contra F002-001045
(Confecciones del Sur EIRL, línea con 81 pendiente):

1. Ítem facturado (5 u.) + ítem fuera de factura (2 u., costo 25.50) en un
   mismo envío → 2 movimientos en el mismo lote, uno con `compra_item_id` y
   uno sin él; `pendiente` de la línea bajó exactamente 5 (no 7); `costo` de
   la variante fuera de factura recalculado a partir de 25.50.
2. Envío 100 % fuera de factura (sin ningún `compra_item_id`) → rechazado con
   el mensaje que apunta a "Recibir sin factura".
3. Ítem facturado por 999 (más que lo pendiente) → sigue rechazado igual que
   antes (regresión del tope original de ADR-0035, intacta).
4. Ítem fuera de factura sin `costo_unitario` → `variantes.costo` idéntico
   antes/después (32.00 → 32.00): confirma que el costo es de verdad opcional.

**Navegador real** (`felipe@cayla.local`, líder, Tienda Lima,
`/compras/recibir?compra=<F002-001045>`): "+ Agregar producto fuera de
factura" → buscar "blusa emma" en el combo (mismo `ComboBuscable` que
`CompraFormV2.tsx`) → elegir talla/color → cantidad 2, costo 25.50, junto con
3 u. reales de "Casaca Ximena S Negro" (línea de la factura). Al enviar: toast
y pantalla de éxito dicen "5 unidades... contra una factura (1 fuera de
factura)"; confirmado después contra Postgres — el lote nuevo tiene los 2
movimientos esperados, la línea de factura bajó de 90 a 87 pendientes (no 85),
y `BLU-EMMA-NEG-S` quedó en costo 31.41. **Queda como dato real en el Postgres
local compartido — no se revirtió** (principio 4, mismo criterio que la
recepción sin factura verificada horas antes el mismo día, ver BITÁCORA).

`pnpm --filter web typecheck`/`lint` en verde.
