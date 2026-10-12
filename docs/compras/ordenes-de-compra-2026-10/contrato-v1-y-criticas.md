> Anexo de diseño de ADR-0362 (sesión «Flujo de órdenes de compra», 2026-10-07/08). Salida de un workflow de agentes: **las
> decisiones de Felipe en `docs/adr/0362-ordenes-de-compra-y-despacho-a-sedes.md` mandan sobre este texto** donde choquen.
> Contrato v1 con la sesión de Recepción y dos críticas. SUPERADO en parte: el fardo pasó a ser la guía (una sede), el comprobante no bloquea y la sede ve el costo.

# Contrato de datos: Órdenes de compra ↔ Recepción (propuesta, ADR-0362)

## 1. Tablas

**`retail.ordenes_compra`** (nueva; la escribe Órdenes de compra)
- `id uuid pk`
- `numero int not null unique`: sale de `fn_siguiente_correlativo('orden_compra')`. Uso una clave larga para que no choque con los prefijos de categoría. Es único para toda la empresa y anular no lo libera.
- `codigo text generated` (`'OC-' || lpad(numero,6,'0')`)
- `proveedor_id uuid not null → retail.proveedores`
- `fecha_emision date not null default (now() at time zone 'America/Lima')::date`
- `fecha_entrega_estimada date null`, con `check (≥ fecha_emision)`
- `estado text not null check in ('generada','recibida_parcial','recibida','anulada')`
- `nota`, `creada_por not null` (`fn_actor_persona_id(true)`), `creada_at`, `editada_por/at`, `anulada_por/at`, `motivo_anulacion`. Un check exige que una OC anulada tenga quién, cuándo y por qué.
- `token_cliente uuid unique`
- No guarda totales: los calcula la vista `ordenes_compra_resumen` (subtotal, descontado, total).

**`retail.orden_compra_items`** (nueva)
- `id`, `orden_compra_id not null`, `linea smallint`
- `categoria_id uuid not null → categorias`. Acepta madre o hija.
- `marca_id uuid null → marcas`, `descripcion text null`
- `cantidad int > 0`, `precio_unitario numeric(12,2) ≥ 0`, `descuento_pct numeric(5,2) check 0..100`
- `monto_descuento` y `subtotal` son columnas generadas.
- `retirada_at/por`: archiva una línea que se quitó al editar. Nunca se borra con DELETE.
- Trigger: si la línea trae marca, la pareja (marca, proveedor de la OC) tiene que existir en `marca_proveedores`. La UI ofrece `crear_marca` en el mismo flujo. Así el producto que se cree al abrir el fardo no choca con `productos_marca_proveedor_fk`.

**Máquina de estados de la OC.** La escribe solo Órdenes de compra.
- `generada`: se puede editar.
- `generada → anulada`: solo si no tiene ningún comprobante vigente.
- `generada → recibida_parcial → recibida`: el estado se recalcula por trigger al registrar o anular un comprobante, según lo facturado contra lo pedido.

**`retail.compras` y `retail.compra_items`** (se reutilizan)
- `compras.orden_compra_id uuid null → ordenes_compra`.
- `compra_items.orden_compra_item_id uuid null → orden_compra_items`.
- `compra_items.producto_id` pasa a ser opcional, con `check (producto_id is not null or orden_compra_item_id is not null)`.
- **No agrego `categoria_id` ni `marca_id` a `compra_items`:** se leen de la línea de la OC. Guardarlas dos veces haría que pudieran diferir.
- Trigger: la línea del comprobante es de la misma OC que su cabecera.

**`retail.compra_item_destinos`** (se reutiliza tal cual)
- Es el reparto por sede del paso 2, con cantidad asignada por (línea del comprobante, sede).
- Ya cuadra con lo facturado, alimenta qué dinero ve cada tienda (`compra_parte_por_tienda`, `fn_compras_visibles`) y deja rastro en `compra_reasignaciones`. No se modela un segundo reparto.

**`retail.despachos`** (nueva; es la «guía»)
- `id`, `numero_guia text null`, `nota`, `despachado_por not null` (`fn_actor_persona_id(true)`), `despachado_at not null default now()`, `token_cliente unique`.
- Un despacho agrupa varios fardos de varias facturas y OC. No lo llamo «envío» porque `envios` es la llegada a la puerta de la sede. Tampoco «guía», porque en traslados esa palabra ya es el papel con QR.

**`retail.fardos`** (nueva)
- `id`, `codigo` (`fn_siguiente_correlativo('fardo')`, para la etiqueta del bulto)
- `despacho_id not null`, `orden_compra_id not null`, `proveedor_id not null`. Un trigger exige que el proveedor sea el de la OC; lo copio porque Recepción lo filtra.
- `ubicacion_destino_id uuid not null → ubicaciones`
- `estado text check in ('en_camino','abierto','cerrado','anulado')`
- `abierto_por/at`, `cerrado_por/at`, `anulado_por/at`, `motivo_anulacion`, con checks de coherencia en cada estado (patrón de `transferencias`).
- No tiene columnas de dinero.

**`retail.fardo_items`** (nueva)
- `id`, `fardo_id not null`, `compra_item_id not null → compra_items`, `cantidad int > 0`.
- `descripcion text null`. Si viene vacía se toma la de la línea de la OC.
- `unique (fardo_id, compra_item_id)`.
- No guarda `categoria_id` ni `orden_compra_item_id`. Se exponen en la vista **`fardo_items_detalle`** (security_invoker): fardo, sede, OC, proveedor, `orden_compra_item_id`, `categoria_id`, `categoria_raiz_id`, `marca_id`, cantidad y descripción. **Esa vista es el contrato de lectura de Recepción.**

**Máquina de estados del fardo**

| Transición | Quién la escribe | RPC |
|---|---|---|
| (nace) `en_camino` | Órdenes de compra | `despachar_fardos` |
| `en_camino → anulado` | Órdenes de compra | `anular_fardo` |
| `en_camino → abierto` | Recepción | `abrir_fardo` |
| `abierto → cerrado` | Recepción | `recibir_fardo` |

**`retail.lotes.fardo_id`** (columna nueva; la migración es de Recepción)
- `uuid null → fardos`, con índice único parcial: un fardo da un solo lote.

**Función compartida `retail.fn_categoria_raiz(uuid)`** (stable; la creo yo)
- Devuelve `coalesce(categoria_padre_id, id)`. Con un solo nivel de subcategorías no hace falta recursión.
- Las dos sesiones comparan siempre por categoría raíz.

## 2. La cadena y por qué el fardo cuelga de la línea del comprobante

Cadena: OC → `orden_compra_items` → comprobante (`compra_items.orden_compra_item_id`) → reparto (`compra_item_destinos`) → despacho → fardo → `fardo_items.compra_item_id` → lote (`lotes.fardo_id`) → `movimientos`.

**Decisión.** El fardo cuelga **de la OC en la cabecera** y **de la línea del comprobante en el detalle**. Por qué:
- **Una guía con varias facturas:** el despacho agrupa fardos, y un fardo puede llevar líneas de varios comprobantes de la misma OC.
- **El costo es de la factura**, no de la OC: el precio real y el contado o crédito están en `compra_items`. Colgar de la línea del comprobante da el costo exacto sin adivinar.
- **El reparto ya vive por línea de comprobante.** Despachar es tomar parte de lo asignado a una sede.
- **Recepción compara contra lo despachado a SU sede**, no contra lo pedido en toda la OC. Llega a la OC y a la categoría por la vista.

Por el flujo de Felipe (Recibir → comprobante → repartir), sin comprobante no hay despacho.

## 3. Candados

Son dos, los dos en `constraint trigger deferrable initially deferred`.

**(a) Lo despachado no supera lo asignado.** Por (línea del comprobante, sede): la suma de `fardo_items` de fardos no anulados es menor o igual a `compra_item_destinos.cantidad`. El trigger toma `for update` sobre la fila de `compra_item_destinos`, así dos despachos simultáneos se ordenan uno detrás del otro. En sentido inverso, `fn_compra_item_reparto_cuadra` se amplía para que una reasignación no deje a una sede con menos asignado de lo que ya se le despachó.

**(b) El candado que pidió Recepción, directo.** Por línea de la OC: la suma de `fardo_items` (por `compra_items`) de fardos no anulados es menor o igual a `orden_compra_items.cantidad`. Bloquea con `for update` la fila de `orden_compra_items`. Además, `despachar_fardos` revisa lo mismo antes de insertar, para devolver un mensaje en palabras de tienda. El trigger es la garantía y la RPC es la cortesía.

Que lo facturado no supere lo pedido depende de la decisión D2.

## 4. `compra_items` y el costo

**Qué cambia en `compra_items`.** `producto_id` pasa a ser opcional y se agrega `orden_compra_item_id`. `costo_unitario` queda como el costo neto unitario: precio × (1 − descuento %), tomado del comprobante.

**Lo que hay que ajustar (lo hago yo):**
- `registrar_compra`: acepta líneas sin producto si traen línea de OC. La revisión de costo atípico se salta esas líneas.
- `recibir_compras`: rechaza explícitamente una línea sin producto con el mensaje «se recibe por fardo».
- La vista `compra_items_resumen`.
- Las 13 funciones que leen `producto_id` (lista de la lectura «compras»): revisar cada join interno para que la línea no desaparezca sin aviso.
- Web: `CompraFormV2`, `compra-form-progreso`, `RecepcionEnvio.traeLinea`, `envio-reglas`.
- `estado_recepcion`: para las líneas de OC se calcula desde los fardos cerrados, no desde `movimientos.compra_item_id`.

**Cómo llega el costo a la variante** (sin que la sede lo vea ni lo escriba):
- Agrego `retail.fn_costo_fardo(p_fardo_id, p_variante_id) returns numeric`, security definer. Se revoca a `authenticated` y la llama solo `recibir_fardo`.
- Busca las líneas del fardo con la misma categoría raíz de la prenda y, si la prenda tiene marca, también con la misma marca.
  - Si hay una línea, devuelve su `costo_unitario`.
  - Si hay varias, devuelve el promedio ponderado por cantidad.
  - Si no hay ninguna, devuelve `null` (ver la decisión D5).
- `recibir_fardo` pasa ese costo a `fn_recalcular_costo_variante` **antes** de `fn_aplicar_movimiento`, igual que `recibir_lote`.
- Así no hace falta ajustar costos después ni crear `fn_ajustar_costo_por_factura`.

## 5. RPC por dueño

**Órdenes de compra** (esta sesión; todas firman con `fn_actor_persona_id(true)`, exigen el módulo `ordenes_compra` y llevan token):
- `crear_orden_compra(p_proveedor_id, p_fecha_entrega_estimada, p_items jsonb, p_nota, p_token) → uuid`
- `editar_orden_compra(p_orden_compra_id, p_fecha_entrega_estimada, p_items jsonb, p_nota)`: solo en estado `generada` y sin comprobante.
- `anular_orden_compra(p_orden_compra_id, p_motivo)`
- `registrar_compra(…, p_orden_compra_id uuid default null)`: el reparto entra en la misma llamada, como paso 2 del asistente. Hay que hacer `drop` de la firma vieja en la misma migración para no dejar una sobrecarga. Para cambiar el reparto antes del despacho se usa `reasignar_reparto_compra`, que ya existe.
- `despachar_fardos(p_numero_guia, p_fardos jsonb [{orden_compra_id, ubicacion_destino_id, items:[{compra_item_id, cantidad, descripcion}]}], p_nota, p_token) → uuid` (devuelve el `despacho_id`)
- `anular_fardo(p_fardo_id, p_motivo)`: solo si está `en_camino`.
- `fn_categoria_raiz(uuid)`, `fn_costo_fardo(…)` (interna), las vistas `ordenes_compra_resumen` y `fardo_items_detalle`, y el aviso «Diferencia en fardo» en `inicio-avisos.ts` (grupo Compras) a partir de la función de Recepción.
- RLS de `fardos`, `fardo_items` y `despachos`:
  - Lectura: `fn_puede_operar_ubicacion(ubicacion_destino_id)` o el módulo `ordenes_compra`.
  - Escritura: ninguna directa, todo pasa por RPC.
  - Las políticas van en una parte aparte, al final (ADR-0195).

**Recepción** (la otra sesión):
- `abrir_fardo(p_fardo_id)`
- `recibir_fardo(p_fardo_id, p_items jsonb, p_nota, p_token) → uuid` (devuelve el `lote_id`). Crea el lote con `fardo_id`, escribe los `movimientos` con el costo de `fn_costo_fardo` y deja el fardo en `cerrado`. No acepta costo que venga del navegador. Hay que sumarla a `cola-offline`.
- Migración de `lotes.fardo_id`.
- `fn_fardo_diferencia(p_fardo_id)`: por categoría raíz, lo despachado menos lo contado. No se guarda.
- `fn_fardos_con_diferencia()`: la lista que alimenta el aviso.
- Cómo se crea la prenda en la sede. `crear_producto_con_variantes` exige `fn_puede_editar_catalogo`, así que lo más probable es partir de `censo_crear_variante`.

## 6. Decisiones de Felipe (no las tomo yo)

- **D1. ¿Toda compra de mercadería pasa por una OC desde ahora?**
  - (a) Sí, el comprobante suelto queda solo para gastos.
  - (b) La OC es opcional y el flujo de hoy (`recibir_envio`) convive.
  - (c) Opcional por proveedor.
- **D2. ¿La factura puede traer más de lo pedido en la OC?**
  - (a) Nunca.
  - (b) Sí, con aviso.
  - (c) Sí, pero solo el líder lo confirma.
- **D3. ¿Una OC puede tener varios comprobantes (entregas parciales)?**
  - (a) Sí, y queda en `recibida_parcial`.
  - (b) Uno solo; lo que falta se cierra.
- **D4. ¿Qué hace Compras con un faltante del fardo?**
  - (a) Solo aviso.
  - (b) Aviso con botón para cerrar la línea (`no_llego`/`error_proveedor`).
  - (c) Aviso que propone una nota de crédito.
- **D5. Llega una prenda de una categoría que no se pidió. ¿Qué costo toma?**
  - (a) Entra sin costo y avisa.
  - (b) El promedio del fardo.
  - (c) No entra hasta que Compras la asigne.
- **D6. ¿En qué moneda se emite la OC?**
  - (a) Solo soles.
  - (b) Soles o dólares, con tipo de cambio al facturar.
- **D7. ¿El precio de la OC incluye IGV?**
  - (a) Sí, igual que el total de la factura.
  - (b) No; el IGV se suma al facturar.
- **D8. ¿Quién ve las OC?**
  - (a) Solo quien tiene el módulo; toda la empresa.
  - (b) Por tienda gestora, como Compras (ADR-0184).
- **D9. ¿Y cuando el «todo a una sede» no incluye a la tienda gestora?** `fn_gestora_con_parte` exige que la gestora conserve parte de la mercadería, y eso choca con «toda la mercadería a una sola sede» si esa sede no es la gestora.
  - (a) La gestora es siempre la sede de destino.
  - (b) Se relaja el candado para las compras que vienen de una OC.
- **D10. ¿Se puede editar una OC después de mandarla al proveedor?**
  - (a) Mientras no tenga comprobante.
  - (b) Nunca: se anula y se hace otra.

## Respuestas a la sesión de Recepción

- **(a) Tablas.** Se llaman `ordenes_compra`, `orden_compra_items`, `despachos`, `fardos` y `fardo_items`. El fardo todavía no es tabla en ningún lado; nace en mi primera migración. Para leerlo usa `fardo_items_detalle`.
- **(b) Categoría.** Sí: la línea de la OC va por `categoria_id` (obligatoria). Compara con `fn_categoria_raiz` en los dos lados.
- **(c) Estados.** Sí: yo creo el fardo en `en_camino` y tú lo pasas a `abierto` y `cerrado`. El costo lo pone `fn_costo_fardo`, no la sede.
- **(d) Rama.** `claude/purchase-order-flow-6207e9`, en el worktree `/Users/claudiapereyra/Proyectos /cayla-retail/.claude/worktrees/determined-thompson-f7b8d8`. **No está en GitHub todavía**, y la tuya (`claude/recepcion-mercaderia-inventario-16e55e`) tampoco aparece en `origin`.
- **(e) Numeración.**
  - Reservo **ADR-0362** y migraciones **`20261008100000`–`20261008109999`**. Las tuyas, de ahí en adelante; necesitan mis tablas antes.
  - Ojo con tu número: `20261007120000` ya existe en la rama local `claude/analisis-nunca-salio-al-piso` (`analisis_salio_al_piso`). Además, la tarea dice que en producción quedó `20261007182535_recibir_es_de_inventario`. Confirma cuál es la real con `select version from supabase_migrations.schema_migrations where version like '20261007%'`.
  - En el repo, el último ADR en `docs/adr` es el 0360 y la última migración `20261007*` es `20261007100000_analisis_liquidar_desde_sin_tope.sql`.

---

# Crítica: consistencia

Ataque a la propuesta ADR-0362 desde la consistencia. Encontré 11 problemas, ordenados de peor a menos grave. Cada uno va con su arreglo concreto.

**1. Stock duplicado: la misma prenda entra por «Llegó mercadería» y otra vez por el fardo**
- `recibir_lote` no sabe nada de compras ni de fardos (`20260930122000_recibir_lote_costo_atipico.sql:114-142`). Si la sede registra la caja por la puerta de siempre y después abre el fardo en camino, las prendas se suman dos veces.
- Arreglo: `recibir_lote` rechaza con `fardo_en_camino` cuando la sede tiene un fardo en camino o abierto del mismo proveedor. Se acepta solo si cada ítem trae `"sin_fardo": true` dentro de `p_items`; como va en el JSON, la firma no cambia y no se crea una sobrecarga. La pantalla «Llegó mercadería» manda primero a «Fardos por abrir».
- Mismo riesgo por el otro camino: el check `producto_id is not null or orden_compra_item_id is not null` deja que una línea tenga las dos cosas. Esa línea se podría recibir con `recibir_compras` o `recibir_envio` y además despacharse en un fardo.
- Arreglo: `recibir_compras` rechaza toda línea con `orden_compra_item_id is not null`, no solo las que vienen sin producto. `cerrar_linea_compra` también tiene que contar lo ya despachado.

**2. El fardo no deja huella en `movimientos.compra_item_id` y eso apaga los candados que ya existen**
Hoy todo lo que «ya se recibió» se mide por `movimientos.compra_item_id`:
- La foto `recibido_cantidad` (`20260912234815…:91-102`).
- `compras_no_sobrerecibida` (`20260918202000…:84`).
- `anular_compra` (`20260918205000…`, el bloque «ya tiene mercadería recibida»).
- La parte (b) del reparto (`20260919172000…:276-283`).

Si `recibir_fardo` crea movimientos sin esa columna:
- Se puede anular una factura con su fardo ya recibido, y quedan un costo y un lote huérfanos.
- La reasignación puede dejar a una sede con menos de lo que ya recibió.
- `estado_recepcion` se queda en «pendiente» para siempre.

Arreglo: que `recibir_fardo` llene `compra_item_id`. Cada unidad contada se reparte en el `fardo_item` que coincida por categoría raíz (y marca, si hay), hasta su cantidad. El sobrante entra sin `compra_item_id`, como hoy entran los extras. Si se llenara todo, `compras_no_sobrerecibida` reventaría y frenaría la recepción. Con esto no hay que reescribir `estado_recepcion` desde los fardos.

**3. `anular_compra` ignora los fardos**
- Se puede anular un comprobante con un fardo en camino, y ese fardo queda apuntando a líneas anuladas.
- Arreglo: `anular_compra` rechaza si hay fardos no anulados sobre sus líneas.
- Las carreras `anular_compra`↔`despachar_fardos` y `anular_orden_compra`↔`registrar_compra`/`editar_orden_compra` se cierran igual: las dos funciones de cada pareja toman `select … for update` sobre la fila de `compras` o de `ordenes_compra`, en orden de id. Sin ese candado, las dos validaciones pasan a la vez.

**4. Recepción no va a poder leer la vista**
- `fardo_items_detalle` está pensada como security_invoker y une `compra_items` y `orden_compra_items`.
- La política de `compra_items` exige `fn_compras_visibles()` (`20260923180200…:219-221`). Esa función devuelve vacío a quien no tiene un módulo de Compras (`fn_compras_ubicaciones`). Una sede que solo ve Inventario vería 0 filas.
- Arreglo: una función security definer `fn_fardo_detalle(p_fardo_id)`. Revisa `fn_puede_operar_ubicacion(ubicacion_destino_id)` y nunca devuelve `precio_unitario` ni `costo_unitario`, para no abrir el candado de dinero (ADR-0126).

**5. Proveedor y OC del comprobante sin candado**
- La propuesta liga la línea a la OC de su cabecera, pero no exige que `compras.proveedor_id` sea el proveedor de la OC.
- Arreglo: un trigger que lo exija. También tiene que exigir:
  - Que la OC esté en estado `generada` o `recibida_parcial`, nunca `anulada`.
  - En `fardo_items`: que la compra de la línea sea de `fardos.orden_compra_id`, que esté vigente y que sea de mercadería.
- Con esa cadena, un fardo con dos proveedores es imposible por construcción.

**6. El candado (b) choca con D2**
- Si Felipe permite facturar más de lo pedido, el candado «despachado ≤ pedido» deja varada la mercadería que llega de más: está facturada pero no se puede despachar.
- Arreglo: poner el tope donde nace la cantidad, en la suma de `compra_items` vigentes por `orden_compra_item_id`, con un trigger diferido y `for update` sobre la línea de la OC. Si D2 lo permite, se exime con la aprobación del líder.
- El candado (a), «despachado ≤ asignado», ya obliga lo demás.
- El `for update` dentro del trigger diferido sí ordena dos despachos al mismo tiempo, siempre que la suma se lea después del candado y en otra sentencia (READ COMMITTED toma una foto nueva).

**7. Una sede puede abrir o cerrar el fardo de otra, o recibirlo dos veces**
- Arreglo: `abrir_fardo` y `recibir_fardo` bloquean la fila del fardo y exigen:
  - Que el estado sea el esperado.
  - Que `p_ubicacion = ubicacion_destino_id` y que se cumpla `fn_puede_operar_ubicacion`.
- `anular_fardo` toma el mismo candado.
- El índice único `lotes(fardo_id)` es la última red.

**8. Un costo atípico frena la venta**
- `recibir_lote` exige un líder ante un costo atípico (`:85-108`). Si `recibir_fardo` copia esa revisión con el costo que viene de la factura, la sede se queda bloqueada.
- La propuesta además salta esa revisión en `registrar_compra` para las líneas de OC, así que el costo nunca se revisa.
- Arreglo: revisar el costo contra la categoría al registrar el comprobante. En `recibir_fardo`, solo marcar y avisar, sin bloquear.

**9. El costo nunca llega cuando la prenda se crea en otra categoría o con otra marca**
- `censo_crear_variante` deja elegir cualquier categoría. Si una línea pedida como «Vestidos» se crea como «Blusas»:
  - `fn_costo_fardo` devuelve null y la variante queda con costo 0.
  - La diferencia sale doble: falta en Vestidos y sobra en Blusas.
- Si la marca de la prenda no coincide con la de la línea, el costo también sale null.
- Arreglos:
  - Al crear la prenda desde el fardo, el combo ofrece solo las categorías raíz del fardo, o «fuera de pedido» explícito (D5).
  - Si la marca no coincide, `fn_costo_fardo` cae a la categoría sola.
  - El aviso «sin costo» le llega a Compras.

**10. La diferencia de un fardo ya cerrado puede cambiar**
- `fn_categoria_raiz` se lee en vivo. Una categoría suelta puede volverse hija más adelante: el trigger `fn_valida_categoria_subcategoria` solo impide que una madre baje (`20260915224501_categorias_subcategoria.sql:40-89`). Si eso pasa, la diferencia de fardos ya cerrados cambia sola.
- Arreglo: guardar `categoria_raiz_id` en `fardo_items` al despachar, y que no se pueda modificar después.

**11. La gestora (D9) choca con el reparto**
- `fn_gestora_con_parte` (`20260923180200…:124-158`) rechaza «todo a otra sede», justo el caso normal de Felipe.
- No se puede despachar hasta que se decida D9.

**Lo que la propuesta no rompe**
- Contado ⇒ pago (`registrar_compra:289`): se mantiene.
- RLS por sede de dinero: queda intacta mientras se cumpla el punto 4.

---

# Crítica: fidelidad al pedido

**Crítica de la propuesta ADR-0362: qué se aparta de lo que pidió Felipe**

### A. Lo que Felipe pidió y la propuesta no cubre

1. **El PDF de la OC.** Felipe ya dijo que se puede descargar para mandarlo al proveedor. La propuesta no lo menciona: no dice qué lleva (RUC y logo de CAYLA, datos del proveedor, condiciones), ni quién lo genera, ni si se puede descargar una OC anulada.
2. **El número bloqueado en el formulario.** `fn_siguiente_correlativo` (`20260912235500_vocabulario_cerrado.sql:149`) asigna el número recién al insertar, y eso está bien porque no deja huecos. Pero entonces el formulario no puede mostrar el número real mientras se llena. La propuesta no dice qué ve la persona: «se asigna al guardar» o un número tentativo que podría cambiar. El formato `OC-000001` también lo decidió la propuesta, no Felipe.
3. **La fecha de emisión.** Felipe dijo «hoy». La propuesta solo le pone `default` y no dice si queda bloqueada como el correlativo, ni si cambia al editar.
4. **«Ver en modal» y el listado.** No hay ninguna vista ni RPC de lectura para el listado con sus acciones, ni para el modal de detalle. `ordenes_compra_resumen` solo da los totales.
5. **«Recibir» con solo los cuatro campos que pidió Felipe** (tipo de comprobante, contado/crédito, serie y número, fecha de emisión). Reusar `registrar_compra` trae obligaciones que Felipe no pidió:
   - Al contado exige el pago completo en ese momento: «Una compra al contado se registra con su pago» y «el pago debe ser el total» (`20260918219100…:88-89,153-154`; vigente en `20260930123000…:88`). Eso suma método, cuenta y el permiso `fn_puede_pagar_compras`.
   - Al crédito exige fecha de vencimiento.
   - Exige tienda gestora (`compras_gestora_obligatoria`, `20260923180200…`).
   - El candado de mes abierto bloquea una factura de un mes ya cerrado.
   - El tipo incluye `recibo_por_honorarios` (`20260912231956…`), que no tiene sentido para mercadería.

   La propuesta no avisa que el formulario va a pedir más de lo que Felipe describió.
6. **«Recibir» varias veces y las diferencias entre factura y OC.** D2 cubre solo la cantidad. Falta qué pasa si la factura trae **otro precio** u **otro descuento** que la OC.
   - `compra_items` no tiene descuento, y la propuesta lo funde en `costo_unitario` neto (sección 4). Con eso se pierden el «descuento %» y el «monto descontado» que Felipe pidió ver por línea, ya en la factura.
7. **Pedido en una tabla y nombre en la pantalla.** Felipe habla de «envío» y «guía». La propuesta inventa «despacho» y «fardo». El nombre de la tabla puede quedar, pero en pantalla tiene que decirse como lo dice Felipe, o él lo decide.

### B. Lo que decidió la propuesta y era de Felipe

- **Cómo llega el costo a la variante (`fn_costo_fardo`).** Es dinero, y CLAUDE.md lo reserva para Felipe. Además falla en el caso típico: dos líneas de «Vestidos» de la misma marca a S/30 y S/60 le dejan S/45 a cada prenda. Ese costo queda mal en `variantes.costo` (global) y en `costo_historial`. Hay que preguntarle: ¿promedio por categoría, o en la sede se elige de qué línea viene cada prenda?
- **Comparar por categoría raíz** (`fn_categoria_raiz`). Define cuándo un fardo «cuadra» y cuándo le llega un aviso a Compras. Es regla de negocio.
- **La marca opcional.** Felipe puso «descripción (opcional)», lo que da a entender que lo demás, marca incluida, es obligatorio. La propuesta deja `marca_id null`.
- **El trigger marca–proveedor obligatorio.** Obliga a dar de alta la pareja en medio de la OC: es fricción que Felipe no pidió. La alternativa es avisar y no bloquear.
- **Anular solo sin comprobante vigente y con motivo obligatorio.** Felipe dijo «anular, no libera el número», nada más.
- **Editar.** `editar_orden_compra` ya fija la opción (a) de D10 «solo en generada y sin comprobante» (sección 5), mientras D10 se lo sigue preguntando a Felipe. Se contradice.
- **Los estados `recibida_parcial` y `recibida`.** Dan por respondida D3 antes de preguntarla.
- **Un fardo, una OC.** Si una sede recibe dos OC en la misma guía, abre dos fardos y cuenta dos veces. Felipe quería «varias facturas por guía», y no está claro que acepte eso.
- **Sin comprobante no hay despacho.** Si el proveedor manda la mercadería antes que la factura (nota de venta tardía, factura a fin de mes), la sede no puede recibir nada. Ese orden lo impuso la propuesta.
- **El módulo `ordenes_compra` (orden 145) bajo `/compras`.** El layout exige `verDineroCompras` (`app/(app)/compras/layout.tsx:38`). O sea, quien no ve dinero no puede ni ver una OC. ¿Lo quiere así Felipe? D8 no lo pregunta.

### C. Preguntas de negocio que faltan en la lista D1–D10

1. **¿De dónde sale el envío?** ¿El proveedor manda directo a cada sede, o todo llega primero a Lima o al Taller y CAYLA reparte? Si pasa por una sede, ¿entra a su stock y sale como traslado? ¿Quién firma `despachado_por` si despacha el proveedor? Todo el modelo depende de esto.
2. **¿Quién pone el precio de venta de una prenda nueva creada en la sede?** `censo_crear_variante` además exige código de barras (`20260923193700…:309,332`). ¿Lo pone la sede, o queda «pendiente» hasta que la revise el líder?
3. **¿Quién puede crear o editar una OC si lleva precios?** ¿Rige el candado de dinero (ADR-0126, dinero de Compras solo del líder)?
4. **¿Qué es el «Recibir» del listado?** Ese botón registra la factura, pero «Recibir» ya es el módulo de Inventario (sede). El nombre confunde y hay que elegir otro.
5. **¿Se puede reabrir el reparto o anular un envío** después de despachar y antes de que la sede abra el fardo? La propuesta deja anular, pero Felipe no lo decidió.
6. **¿Cómo se manda el PDF?** ¿Se registra a quién y cuándo se envió? ¿Una OC mandada cambia de estado («enviada al proveedor»)?

### D. Lo que está bien alineado

Correlativo único de empresa sin huecos, proveedor obligatorio y uno por OC, las columnas de cada línea, el total calculado, la guía opcional que agrupa varias facturas, el reparto reutilizando `compra_item_destinos` sin enviar todavía, y el fardo que nace `en_camino` y la sede lo abre y lo cierra.

**Resumen:** la propuesta es sólida en datos, pero mete decisiones de dinero (el costo por categoría, el pago al contado obligatorio) y de flujo (sin factura no hay envío, un fardo por OC) sin preguntarlas. Además le faltan el PDF y el origen físico del envío. Las dos primeras preguntas para Felipe deberían ser C1 y el costo de B.