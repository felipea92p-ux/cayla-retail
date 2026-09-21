# ADR-0065 — Anular una venta: estado en `ventas`, reversa de stock por condición, bloqueada si SUNAT ya aceptó, solo con la caja abierta, solo el líder

**Fecha:** 2026-09-16
**Numeración:** nació como ADR-0063 en su rama; al fusionar las 5 sesiones de "Venta" el
mismo día, ese número ya lo tenían la cola de ventas offline (Vender) y "cómo se prueban
las RPC de escritura" (Cambios) — pasó a 0065. Mismo patrón que ya resolvió ADR-0033/0036
y ADR-0051/0056 antes.
**Estado:** Aplicada al Postgres local compartido (2026-09-16) y verificada con 8
escenarios en una transacción revertida (líder anula con condición mixta,
stock repuesto solo en la línea vendible, reintento sobre venta ya anulada,
caja cerrada, comprobante aceptado por SUNAT, y quien no es líder — los 5
últimos rechazados). Pantalla construida el mismo día (`AnularVentaForm.tsx`,
botón en `DevolucionesLista.tsx` junto a Devolver). Verificada en navegador
real: el camino de rechazo (caja cerrada) de punta a punta con datos reales;
el camino feliz por clic quedó bloqueado por una condición del entorno local
compartido (stock sin `sububicacion_id` asignado a Piso de venta — ver
BACKLOG), no del código — el camino feliz de la RPC en sí ya está probado
por SQL, arriba. Sin aplicar todavía a producción.

## Contexto

`docs/BACKLOG.md` (sección "Anular una venta", diagnóstico POS 2026-09-14/15)
marcaba el ítem como bloqueado: no existía pantalla ni RPC `anular_venta`, y
`ventas` no tenía ninguna columna de estado (`0002_esquema.sql:220-228`) —
cualquier diseño empezaba con una migración de esquema, el gatillo explícito
de "detente y confirma" de `CLAUDE.md`. Antes de escribir una línea de SQL se
le preguntaron a Felipe las 4 preguntas que el backlog ya tenía redactadas.

## Decisión

**1. El stock depende de la condición de la prenda (Q1: "Depende de la
condición").** Mismo selector que `DevolucionFormV2.tsx:11-14` (vendible /
dañada-reparación / dañada-donar / devolver a proveedor). La regla de qué
condición repone stock **no es nueva**: `aprobar_devolucion`
(`0003_funciones.sql:486-494`) ya decidió que solo `vendible` genera un
movimiento de `entrada` — dañada/proveedor no vuelven al piso. `anular_venta`
reutiliza exactamente esa regla en vez de inventar una segunda.

**2. Bloqueada si el comprobante ya fue aceptado por SUNAT (Q2: "No se puede
anular en ese caso").** Existe desde el 2026-09-09 un camino separado y ya
maduro para esto — `anular_comprobante`
(`supabase/unificacion/24_anular_comprobante.sql`, ADR-0016) — que anula el
**documento legal** (con nota de crédito o comunicación de baja según SUNAT),
nunca la venta ni el stock. Mezclar los dos conceptos en una sola función
habría sido exactamente el error que ADR-0016 ya descartó ("Anular emitiendo
una nota de crédito automática... una NC corrige una operación que existió;
una baja dice que nunca existió"). `anular_venta` se mantiene en su carril: si
`comprobantes.estado` para esa venta es `enviado` o `aceptado`, se rechaza con
un mensaje que manda a Cambio o Devolución.

Extendí el bloqueo de "aceptado" (la palabra literal de Felipe) a también
"enviado": es un estado en tránsito hacia `aceptado` (la respuesta de SUNAT es
asíncrona, ADR-0016 decisión 2) — permitir anular ahí arriesga la misma
mentira que ese ADR ya evitó, solo que en la dirección de la venta en vez del
comprobante. `rechazado`, `anulado` (el comprobante ya se dio de baja por su
propio camino) y la ausencia de comprobante sí permiten anular: en ninguno de
esos tres queda un documento legal vivo con el que `anular_venta` pueda
desincronizarse.

**3. El plazo es la caja de esa venta, no el día calendario (Q3: "Mientras la
caja siga abierta").** `anular_venta` lee `ventas.caja_id → cajas.estado` y
exige `'abierta'`. Una venta sin `caja_id` (dato anterior a
`0008_caja_y_pagos.sql`) queda bloqueada por default — no porque la regla de
negocio lo pida, sino porque no hay caja contra la cual verificar "sigue
abierta"; tratarla como excepción libre habría sido adivinar, no aplicar la
decisión de Felipe.

**4. Solo un líder (Q4: "Solo Líder de equipo").** Mismo candado
`fn_es_lider()` que ya usan `aprobar_devolucion`, `anular_compra` y
`anular_comprobante` — vive en la RPC, no en la pantalla ("una pantalla no es
un permiso", ADR-0016).

**5. Un ítem ya tocado por Cambios o Devoluciones bloquea la anulación
completa (criterio propio, no una de las 4 preguntas).** `anular_venta` para
un ítem `vendible` inserta un movimiento de `entrada` por su cantidad
**original** — si ese mismo ítem ya tuvo un `cambio` (`cambios.venta_item_id`)
o una devolución no rechazada (`devolucion_items` → `devoluciones.estado <>
'rechazada'`), esa cantidad (o parte de ella) **ya volvió al piso por ese otro
camino**. Anular encima duplicaría el movimiento de entrada — el mismo
defecto de "cero estados inconsistentes" que el principio 2 de `CLAUDE.md`
prohíbe, solo que en la dirección de sobrar stock en vez de faltar. La regla
es deliberadamente simple: si la venta ya se empezó a deshacer pieza por
pieza, se termina pieza por pieza (Cambios/Devoluciones ya sirven para eso),
no se anula completa encima. Verificado en la transacción de prueba: un
`cambio` sembrado a mano sobre un ítem hace que `anular_venta` rechace toda
la venta, no solo ese ítem.

## Esquema

- `ventas` gana `estado` (`'completada'` default | `'anulada'`),
  `motivo_anulacion`, `anulado_por`, `anulado_en` — mismo shape que
  `comprobantes.estado/motivo_anulacion/anulado_por/anulado_at`
  (`0010_facturacion.sql`), no uno inventado.
- Tabla nueva `venta_anulacion_items`: una fila por línea de la venta con la
  condición elegida y el `movimiento_id` si generó reversa de stock (`null`
  si no). Anular es todo-o-nada de la venta completa — la RPC exige la
  condición de cada línea, ninguna anulación queda a medias.
- RPC `anular_venta(p_venta_id, p_motivo, p_items)` — valida líder, motivo,
  venta no anulada ya, caja abierta, comprobante sin SUNAT en curso, y
  cobertura completa de líneas, todo antes de tocar `movimientos`/`stock`.
- **Sin política UPDATE nueva en `ventas`.** La tabla nunca tuvo una
  (`0004_rls.sql:102-106` solo define `select`/`insert`) — se escribe
  exclusivamente vía RPC desde que existe. El candado real sigue viviendo en
  la función, no en RLS, consistente con el punto 3 de ADR-0016.

## Alternativas descartadas

- **Nota de crédito automática cuando SUNAT ya aceptó.** Descartada por
  Felipe (Q2) y, de nuevo, ya descartada en general por ADR-0016 — no son la
  misma operación contable.
- **Flujo de aprobación propio (pendiente → aprobada), como Devoluciones.**
  Descartado: Q4 fija un solo actor (líder) actuando en un solo paso: no hay
  una colaboradora que "solicite" y un líder que "apruebe" dos momentos
  distintos, así que el estado `pendiente` que sí necesita `devoluciones`
  sobraría acá.
- **Condición distinta por unidad dentro de una misma línea** (split parcial
  como permite `devolucion_items`). Descartada por alcance: anular es
  todo-o-nada de la venta completa; una condición mixta a nivel de unidad
  individual es exactamente el caso que Devoluciones ya resuelve después
  (con una devolución parcial posterior), no algo que `anular_venta` deba
  duplicar.

## Sin resolver, heredado — no nuevo de esta migración

Un comprobante `pendiente` (correlativo reservado, nunca transmitido) de una
venta que se anula queda huérfano: `anular_venta` no lo toca. Es el mismo
hueco que ADR-0016 ya dejó escrito ("qué hacer con los correlativos
reservados que nunca se transmitieron" — sección "Alternativas
descartadas"), no uno que esta migración introduce. Tocarlo aquí habría
significado adivinar una regla de SUNAT sobre correlativos saltados que
ningún ADR anterior confirmó.

## Consecuencias

Un error de venta se deshace desde el sistema, con motivo y responsable
registrados y el stock reconciliado según la condición real de cada prenda,
en vez de un ajuste manual de inventario sin rastro de por qué. La frontera
con Facturación queda limpia: `anular_venta` nunca decide nada sobre SUNAT,
solo lee `comprobantes.estado` para saber si todavía puede actuar.

Queda pendiente: la pantalla (siguiente paso), aplicar la migración a
producción (requiere el `set search_path to retail, public;` de `CLAUDE.md`
y el ok de Felipe), y decidir algún día qué hacer con los correlativos
`pendiente` huérfanos — de cualquier origen, no solo el de `anular_venta`.

## Actualización 2026-09-18 — la anulación que corre en producción es más estricta que la de este ADR

`20260916214500_anular_venta_sin_huecos` (aplicada a producción el 2026-09-16; subida al repo
el 2026-09-18 como reconstrucción desde `pg_proc`) endureció esta decisión sin que el ADR lo
registrara:

- **Una venta anulada no admite cambio ni devolución.** `fn_linea_de_venta_no_anulada` y un
  trigger `before insert` en `cambios` y en `devolucion_items`, con `for share` sobre la venta
  contra el `for update` de `anular_venta`. Cierra el sentido contrario de la decisión 5 (no se
  anula una venta que ya tiene cambio o devolución), y lo hace en la tabla, no en cada RPC.
- **Cada línea se anula una sola vez** (`venta_anulacion_items_una_vez_por_linea`).
  `anular_venta` exige cada línea una vez y revierte con la salida real de stock de esa línea.
- **`cerrar_caja` no espera el efectivo de una venta anulada**: ya volvió a la clienta.

Sobre «Queda pendiente» de arriba: la migración original ya está en producción. Sigue
pendiente lo de los correlativos `pendiente` huérfanos.

## Actualización 2026-09-21 — anular también libera el comprobante pendiente, y no nace uno nuevo

Los dos huecos que dejaba la frontera con Facturación se cerraron:

- **Anular libera el comprobante `pendiente` de la venta** (`20260921120000`, en producción el 2026-09-21): pasa a `no_emitido` con «Venta anulada: <motivo>», quién y cuándo, en la misma transacción — la misma liberación de ADR-0093. Sigue frenando si hay uno `enviado` o `aceptado`; uno `rechazado` no se toca (ya llegó a SUNAT; Felipe decidió dejarlo así). Lo de «`anular_venta` nunca decide nada sobre SUNAT» sigue cierto: no llama a SUNAT ni a Lucode, solo cambia el estado de una fila que nunca salió de acá. Además `/api/lucode/emitir` se niega a transmitir el comprobante de una venta anulada.
- **Una venta anulada no admite un comprobante nuevo** (`20260921160000`; probada y aplicada en local, falta pegarla en producción): `fn_comprobante_de_venta_no_anulada` y un trigger `before insert` en `comprobantes`, con `for share` sobre la venta contra el `for update` de `anular_venta` — el mismo patrón, en la tabla, que ya cubre cambios y devoluciones. Cubre `emitir_comprobante`, `convertir_proforma_a_comprobante` y cualquier insert; no obligó a recrear ninguna de las dos funciones.

Sobre «Sigue pendiente lo de los correlativos `pendiente` huérfanos»: cerrado por ADR-0093 (a mano, «Liberar sin espera») y por esta actualización (al anular la venta).
