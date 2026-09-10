# ADR-0013 — `movimientos` sella el hecho, y solo las RPC lo escriben

**Fecha:** 2026-09-05
**Estado:** Propuesto — sale de la auditoría del 2026-09-05. El punto 5 (cerrar
la escritura directa) está escrito en
`supabase/unificacion/22_candados_y_permisos.sql`; las cuatro columnas y la
idempotencia de la venta no están escritas. **Ventana:** cada venta que ocurra
antes de aplicarlo pierde el dato de forma irrecuperable; hoy son 2 ventas y 28
movimientos, así que el backfill es exacto.

## Contexto

El principio 4 del repo dice que `movimientos` es append-only y la única fuente
de verdad del stock, y que `stock` es un snapshot derivado. La base no lo
sostiene por dos lados a la vez: el libro no guarda lo suficiente para ser
verdad, y no es el único que puede escribir en él.

### Lo que el libro no guarda

`retail.movimientos` tiene 15 columnas (`id, variante_id, sede_id, tipo,
cantidad, motivo, canal, sede_destino_id, monto, venta_id, usuario_id, nota,
created_at, contenedor_id, lote_id`) y ninguna guarda el costo, ni el precio de
lista, ni si el movimiento ya fue aplicado.

**El costo del pasado se lee del presente.** `contabilidad.ts:140` calcula el
COGS con `costoDe.get(m.variante_id)` sobre `variantes.costo` **de hoy**; igual
`finanzas-nucleo.ts:59` y `:77`, y `panel.ts:33`/`:54` para el inventario
valorizado. Y esa columna se reescribe sola: `retail.registrar_produccion`
termina con `update variantes set costo = v_costo_unit, precio_taller = ...
where id = v_variante_id`, donde `v_costo_unit` es el costo del lote **nuevo**.
Hay un segundo camino que el backlog no registra: `RecetaCosto.tsx:74` hace
`.from("variantes").update({ costo: sugerido }).eq("producto_id", productoId)` —
un UPDATE directo desde el navegador que reescribe el costo de todas las
variantes del modelo de un botonazo. Resultado: el EERR de julio cambia en
octubre sin que nadie haya tocado una venta. `docs/BACKLOG.md:296-298` lo tiene
anotado como "inofensivo mientras los costos sean estables"; con el Taller
activo esa premisa ya es falsa.

**El descuento no existe como hecho.** `RegistrarVentaModal.tsx:63` precarga
`monto: v.precio ?? 0` y `:148-153` lo deja como input libre; `registrar_venta`
persiste solo `monto` = precio cobrado × cantidad. No hay forma de distinguir
"esta familia se vende sola" de "esta familia solo se vende cuando la regalo",
ni de decir cuánto se dejó en la mesa. Hoy el precio de lista todavía es
reconstruible (ninguna pantalla edita `variantes.precio` después del alta), pero
deja de serlo con la primera campaña de rebajas o la primera pantalla de precios.

**Un movimiento se puede aplicar dos veces.** `retail.fn_aplicar_movimiento` va
de `select * into m from movimientos where id = ...` directo al `insert into
stock ... on conflict do update set cantidad = stock.cantidad +
excluded.cantidad`, sin comprobar si ya se aplicó. No hay columna y no hay
trigger (los 10 triggers no internos del schema son de `updated_at` y de
validación de cuadre/nota). Cuando `stock` y `movimientos` no coinciden, el
descuadre **no se puede diagnosticar mirando el libro**, porque ahí no pasó nada.

**Una venta se puede duplicar con un corte de red.** `registrar_venta(p_caja_id
uuid, p_metodo_pago text, p_items jsonb, p_nota text)` —verificado en
`pg_proc`— no recibe ningún identificador del cliente, hace `insert into ventas
(...) returning id` sin `on conflict`, y `ventas` no tiene ninguna restricción
única natural (`pg_constraint`: ninguna UNIQUE; `pg_indexes`: solo pkey,
`sede_id`, `caja_id`). El guard del frontend es parcial:
`RegistrarVentaModal.tsx:185` deshabilita el botón mientras vuela la petición,
pero `:94` hace `setLoading(false)` y muestra el error — o sea, en el caso
exacto en que el commit ya ocurrió y la respuesta se perdió, el botón vuelve a
habilitarse y el segundo clic crea la venta duplicada, con su segundo juego de
movimientos.

### Quién más puede escribir en el libro

`authenticated` tiene INSERT/UPDATE/DELETE en las 34 relaciones de `retail`, y
dos políticas lo dejan pasar por PostgREST sin tocar una sola RPC:

- `movimientos_insert` no restringe columnas y `movimientos.usuario_id` es
  nullable sin default: se puede insertar en el libro append-only firmando con
  el id de otra persona, y `fn_aplicar_movimiento` nunca lo aplica —
  `movimientos` dice +5 y `stock` no se mueve.
- `cajas_update` es UPDATE con `qual = puede_operar_sede(sede_id)` y **sin
  `WITH CHECK`** (Postgres reusa el USING para la fila nueva), sin restricción
  de columnas: se puede reescribir `diferencia` y `monto_cierre_contado` de la
  propia caja **después** de cerrarla. Eso anula el arqueo, que es el único
  control sobre el efectivo.

Y `fn_aplicar_movimiento(uuid)` y `recalcular_stock()` están concedidas a PUBLIC
y `authenticated` sin ninguna validación: la primera reaplica un movimiento
cuantas veces se la llame, la segunda arranca con `truncate table stock;
truncate table stock_almacen;`.

Dos matices que acotan el tamaño real y conviene que queden escritos: **`anon` no
tiene USAGE sobre el schema `retail`** (`has_schema_privilege('anon','retail',
'USAGE')` → false), así que el GRANT a PUBLIC no abre nada a internet — la
superficie son las 28 personas con `auth_user_id`, no cualquiera con la clave
publicable. Y el libro sí está protegido contra edición y borrado: no existe
política `movimientos_update` ni `movimientos_delete`; el hueco es el INSERT
fantasma. La app tampoco necesita nada de esto: los 29 usos de
`.from("movimientos"/"cajas"/"ventas")` en `apps/web` son todos `.select()`, y
`grep -rn fn_aplicar_movimiento apps packages` no devuelve un resultado fuera de
los tipos generados.

## Decisión

**DECIDÍ: el movimiento guarda el hecho completo en el instante en que ocurre,
la venta trae su propia identidad desde el navegador, y el libro deja de tener
otra puerta que las RPC.**

1. `alter table retail.movimientos add column costo_unitario numeric(12,2)` —
   `registrar_venta` (y la rama de merma) copia `variantes.costo` vigente al
   insertar. Todo COGS histórico pasa a leer `m.costo_unitario`, con
   `coalesce(m.costo_unitario, costoDe.get(...))` durante la transición.
2. `add column precio_lista numeric(12,2)` — copiado de `variantes.precio` al
   insertar. La diferencia contra `monto` es el descuento, y de ahí salen gratis
   dos reportes que hoy no existen: descuento otorgado por familia/temporada, y
   sell-through a precio pleno contra rebajado.
3. `add column aplicado_at timestamptz` — `fn_aplicar_movimiento` hace
   `select ... for update` sobre el movimiento, **sale temprano si ya está
   sellado** y sella al final. Reejecutarla pasa a ser inofensivo.
4. `registrar_venta` recibe `p_venta_id uuid`, **generado por el navegador antes
   de enviar**, e inserta con `on conflict (id) do nothing`, devolviendo la
   venta existente si ya estaba.
5. `revoke insert, update, delete on retail.movimientos, retail.cajas,
   retail.ventas from authenticated`, y `revoke execute on function
   retail.fn_aplicar_movimiento(uuid), retail.recalcular_stock(),
   retail.persona_actual() from public, authenticated`. Las RPC de negocio las
   siguen llamando sin problema: son `security definer` y corren como
   `postgres`. Las 8 tablas donde la app **sí** escribe directo (`bom_items`,
   `productos`, `variantes`, `proveedores`, `ordenes_compra`,
   `patrimonio_items`, `ajustes_efectivo`, `ventas_historicas_mensuales`)
   conservan el permiso: todas están detrás de política de Líder, ahí el grant
   corresponde.

Los puntos 3 y 5 son el mismo candado por los dos lados: el `revoke` deja la
doble aplicación **inalcanzable**, el `aplicado_at` la deja **sin efecto**. Con
uno solo, el día que alguien reabra el grant para una pantalla nueva vuelve el
agujero entero.

**DESCARTÉ: una tabla de historial de precios y costos (`variantes_historial`,
con vigencia desde/hasta).** Es la solución "correcta de libro" y por eso hay
que decir por qué no: obliga a resolver "qué costo regía el 14 de julio a las
19:40" con una consulta temporal en **cada** lectura de EERR, Balance e
inventario valorizado —cuatro archivos, cinco pantallas— y aun así no cubre el
caso que más duele, que es la venta con descuento: el precio cobrado no es
ningún precio de lista histórico, es una decisión de esa venta. Sellar en la
línea cuesta tres columnas y cero consultas nuevas.

**DESCARTÉ también: dejar el COGS al costo vigente y advertirlo en la
pantalla.** Es gratis y es lo que hay hoy. Cuesta la única cosa que Felipe dijo
que extraña de su hoja de cálculo: una serie histórica cuyos puntos pasados se
mueven cuando editas una ficha de producto es peor que no tener serie, porque
parece confiable.

**DESCARTÉ además: dejar el `grant` de escritura y confiar en que la RLS
compensa.** No compensa: las RPC son `security definer` y corren como
`postgres`, que tiene `rolbypassrls=true` — `cajas_insert`, `cajas_update` y
`ventas_insert` ni se evalúan cuando la escritura entra por una RPC. La RLS
protege el camino que ya es seguro y no el que no lo es.

**SE ROMPE SI: `p_venta_id` lo genera el servidor en vez del navegador** — por
ejemplo poniéndole `default gen_random_uuid()` al parámetro para no tocar el
frontend. Cada reintento traería un id nuevo, el `on conflict` nunca dispararía,
y la idempotencia dejaría de existir **con la ventaja de parecer que está
puesta**: la firma tiene el parámetro, la migración está aplicada, el registro
de ADR-0011 dice que corrió, y el sábado a las 6 de la tarde en TRU, con el wifi
del centro comercial cayéndose, la encargada aprieta "Registrar venta" dos veces
porque la primera le mostró un error — y la clienta que compró una blusa queda
registrada comprando dos, con el stock descontado dos veces y S/240 de más en la
caja que nadie va a poder explicar el lunes. El id tiene que nacer donde nace la
intención: en el clic.

## Consecuencias

El EERR de un mes cerrado deja de tener dos valores posibles, el descuadre entre
`stock` y `movimientos` deja de poder nacer de una doble aplicación, y la venta
duplicada por corte de red —hoy el único modo de falla vivo que corrompe dinero
y stock a la vez, sin recuperación automática porque `recalcular_stock` replica
el error en vez de arreglarlo— se cierra.

En la misma migración conviene reponer dos líneas que se perdieron en la
unificación y son del mismo linaje: el sellado de `ultima_venta` en la rama de
salida de `fn_aplicar_movimiento` (`grep -c ultima_venta
supabase/unificacion/12_almacen_interno.sql` → 0; hoy las 10 filas de
`retail.stock` tienen `ultima_venta` NULL, así que "estancado" y "días sin
venta" no pueden encenderse jamás) con su backfill desde `movimientos`, y el
`check (cantidad >= 0)` de `0010_stock_concurrencia.sql:15` en `stock` y
`stock_almacen` (`pg_constraint` sobre `retail.stock` devuelve una sola fila: la
pkey). Ninguna de las dos es una decisión —son la restitución de algo ya
decidido, del linaje de ADR-0004— pero comparten migración y verificación.

Queda fuera: el modo offline. La cola en IndexedDB con estos mismos UUID es la
continuación natural de (4), pero no se construye hasta que la facturación esté
emitiendo de verdad, y con una regla innegociable: **una venta offline no lleva
número de comprobante** (ver ADR-0017).
