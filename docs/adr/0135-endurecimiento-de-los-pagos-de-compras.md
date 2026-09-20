# ADR-0135 — Endurecimiento de los pagos de Compras (token, fechas, decimales y redondeo del IGV)

- **Fecha:** 2026-09-19
- **Estado:** Aceptado. Aplicado en el Postgres local y **pegado en producción por Felipe el 2026-09-19** (180000 y luego 181000). **Verificado contra la base de producción por Claude el 2026-09-19** (lectura autorizada por Felipe): una sola firma de cada función, `registrar_pagos_compra(uuid,jsonb,date,uuid)`, md5 idéntico al del local (`registrar_compra` a281f31f…, `registrar_pagos_compra` 7887f463…, `registrar_pago_compras` 156af6f5…, `fn_validar_fecha_pago_compra` 1b5ebb89…) y `anon` sin EXECUTE en las cuatro. Volcado de funciones refrescado.
  Toca tres funciones de dinero y cambia la firma de una: regla de CLAUDE.md, se detiene y se confirma antes.
- **Migraciones (DOS, en este orden):**
  1. `supabase/migrations/20260919180000_pagos_compras_endurecimiento.sql` — `registrar_pagos_compra` (A2, M2, M3),
     `registrar_pago_compras` (M1, M2), el helper `fn_validar_fecha_pago_compra` y los grants.
  2. `supabase/migrations/20260919181000_registrar_compra_endurecimiento_por_parche.sql` — `registrar_compra` (A1, M2, M3)
     **parchada sobre su definición viva**, no recreada. Ver «Por qué dos migraciones».
  Las cabeceras de ambas repiten el porqué.
- **Pruebas:** `pnpm pruebas:pagos-compras-endurecimiento` (66 casos, cada uno con ROLLBACK; `--en-seco` carga, dentro de cada
  escenario, la `registrar_compra` sin parchar de producción y las dos migraciones en orden). Están en CI.
- **Convive con** ADR-0132 (reparto de una compra entre tiendas, otra rama, migraciones `20260919172000`/`173000`, que también
  reescribe `registrar_compra`): el orden de fusión es indiferente gracias al parche con guarda.
- **Toca** ADR-0111 (pago por lote, saldo a favor), ADR-0126 (dinero solo del líder: el chequeo `fn_puede_registrar_compras()`
  queda intacto) y ADR-0009 (una sola firma por función: se respeta con `drop function` explícito).

## Contexto — la auditoría

Una auditoría del flujo «pagar a un proveedor» ejecutó SQL contra el Postgres local y **confirmó** cinco huecos en la base.
Las tres funciones (`registrar_compra`, `registrar_pagos_compra`, `registrar_pago_compras`) eran idénticas en local y en
producción (md5 de `pg_get_functiondef` iguales), con una sola firma cada una; los huecos son de producción hoy.

| # | Gravedad | Hueco |
|---|---|---|
| A1 | Alto | Registrar un comprobante «precio incluye IGV» con el total del papel falla con «no cuadra con sus líneas» aunque el papel esté bien (5 u × S/ 10.00, 10 u × 25.00, 100 u × 12.50, 100 u × 1.00). |
| A2 | Alto | `registrar_pagos_compra` (pago desde el detalle) no tiene token: dos llamadas iguales registran dos pagos; un corte de red después del commit hace que el reintento pague dos veces. |
| M1 | Medio | El lote valida `p_credito <= saldo a favor` antes de mirar el token: el reintento de un lote que usó saldo a favor falla con «el saldo a favor … es S/ 0.00» aunque ya se pagó. |
| M2 | Medio | Las tres rutas aceptan cualquier fecha de pago (2099-01-01; 1990-01-01, antes de que existiera el comprobante). |
| M3 | Medio | El detalle y el pago inicial de `registrar_compra` redondean en silencio un monto con más de 2 decimales (10.005 → 10.01); el lote lo rechaza. |

## Decisión

**A1 — la tolerancia sigue al redondeo.** El costo unitario llega redondeado a 2 decimales (`compra_items.costo_unitario` es
`numeric(12,2)`), y ese medio centavo, agrandado por el IGV (× 1.18 ≈ 0.006), se **multiplica por la cantidad**. La
tolerancia pasa de `0.01 × (líneas + 1)` a `0.01 × (líneas + 1) + 0.006 × Σ cantidad`. El total del papel sigue siendo la
verdad (se guarda tal cual y el IGV se deriva). *No es un cheque en blanco:* la holgura extra solo crece con las unidades,
que es donde nace el error (100 u → S/ 0.62 en total), un descuadre real
(+/− S/ 5, o S/ 0.50 en una sola unidad) sigue rechazado, y con IGV 0 sigue siendo igualdad exacta. Corolario honesto:
con miles de unidades la holgura llega a varios soles, porque el redondeo del costo unitario de verdad puede sumar eso; la
alternativa (exigir el precio bruto por línea) es un contrato nuevo con la pantalla, ver «Descartado».

**A2 — token en el pago del detalle, reutilizando `pago_grupo_id`.** `registrar_pagos_compra(p_compra_id, p_pagos, p_fecha,
p_token uuid default null)`; se hace `drop function` de la de 3 parámetros (una sobrecarga rompería las llamadas
ambiguas). Con token: si ya hay pagos de *ese* comprobante con ese `pago_grupo_id`, se devuelve el mismo arreglo de ids sin
escribir nada; si el token ya se usó en *otro* comprobante, se rechaza (jamás se devuelven pagos ajenos). Sin token todo
funciona como hoy y `pago_grupo_id` queda NULL. **No hay columna ni índice único nuevos**: `pago_grupo_id` ya es el token del
lote y tiene índice parcial; no puede ser único porque un pago con dos medios (o un lote) escribe varias filas con el mismo
id. La garantía sale del `for update` sobre la fila de `compras` (serializa a los dos llamadores) y del chequeo del token
**después** del candado: el segundo espera, ve el pago del primero y devuelve lo mismo.

**M1 — el token va antes de mirar la base.** En el lote el chequeo del token pasa antes de la validación del saldo a favor
(y de todo lo que lee estado). Las validaciones de *forma* del pedido siguen primero. Regla general: un reintento con token
válido siempre devuelve el éxito original.

**M2 — fecha de pago: ni futura ni anterior a la emisión.** Helper interno `fn_validar_fecha_pago_compra(fecha, emisión,
documento)` (sin EXECUTE para nadie; lo llaman funciones del mismo dueño): `fecha ≤ hoy Lima` y `fecha ≥ mínimo(emisión, hoy)`.
El «mínimo con hoy» es deliberado: un comprobante con emisión futura, o con `p_fecha_emision` en su valor por defecto
`CURRENT_DATE` (fecha UTC: desde las 19:00 de Lima ya es «mañana»), quedaría impagable si el piso fuera la emisión a secas.
En el lote se valida contra **cada** comprobante; en `registrar_compra`, contra cada línea de pago que traiga fecha.

**M3 — un solo criterio de decimales.** Se copia el rechazo del lote con el mismo mensaje («Los montos del pago admiten como
máximo 2 decimales»), sobre el valor crudo: la causa raíz era que la variable era `numeric(12,2)` y el cast redondeaba antes de
cualquier chequeo.

## Por qué dos migraciones (y por qué `registrar_compra` se parcha en vez de recrearse)

La primera versión de esta migración recreaba `registrar_compra` entera con `create or replace`, copiada de la definición de
producción. Pero la rama de **reparto por tienda** (ADR-0139) también reescribe `registrar_compra`: guarda `destinos` por
línea en `compra_item_destinos`, deja de escribir `compras.ubicacion_destino_id` y elimina esa columna. Como ninguna de las dos
está aún en producción ni se sabe cuál se fusiona primero, un `create or replace` completo desde aquí, si corriera DESPUÉS,
**pisaría la de reparto** y `registrar_compra` fallaría con «column ubicacion_destino_id does not exist» (y si corriera antes, la
de reparto borraría mi arreglo sin avisar). Arreglar eso avisando «esta migración va antes/después» es frágil: depende de que
alguien lo recuerde.

Decisión (principio 2, cero estados inconsistentes: el diseño no debe permitir el orden equivocado):

1. La `20260919180000` queda **sin ninguna recreación de `registrar_compra`**: solo lo que es de las otras funciones y el
   helper. Se puede aplicar antes o después de la de reparto.
2. La `20260919181000` **lee la definición viva** (`pg_get_functiondef` de la única firma que haya en `pg_proc`), le cambia
   solo lo suyo con `replace()` de **seis fragmentos ancla** cortos y estables, y la vuelve a crear con `execute`. Los anclas
   viven en la zona de la tolerancia del IGV, en la declaración de `v_monto`/`v_tolerancia` y en el bucle de validación de
   pagos — texto que la migración de reparto no toca (se comprobó que cada ancla aparece **exactamente una vez** tanto en la
   definición de producción como en la que deja la de reparto).
3. Guardas, para que falle fuerte y nunca a medias: cada ancla debe estar exactamente una vez (si no, `raise exception`
   nombrando cuál: «reescribe el parche sobre la definición viva»); si la función ya trae el endurecimiento sale con un
   `notice` sin tocar nada (re-ejecutable, md5 idéntico); si trae solo parte de los marcadores aborta; si hay 0 o más de una
   firma aborta (ADR-0009); si falta el helper de la parte 1 aborta pidiendo aplicarla primero. Todo en una transacción.

**Regla de orden que sí queda:** la `181000` debe correr **después** de la `180000` (necesita el helper) y **después** de la de
reparto si esa se aplica. Si la de reparto se aplicara DESPUÉS de la `181000`, recrearía `registrar_compra` desde su propio
texto y se perdería el parche sin ruido: basta **volver a pegar la `181000`** (es re-ejecutable) — comprobar con
`select pg_get_functiondef(...) like '%v_unidades%'`. Los timestamps ya lo garantizan al aplicar por `migration up`
(reparto 172000/173000 < 180000 < 181000).

**Descartado para esto:** (a) recrear la función dentro de la `180000` avisando el orden (frágil, ver arriba);
(b) esperar a que la de reparto llegue a main y rehacer mi versión encima (bloquea el arreglo de dinero por una rama ajena y
sigue sin resolver el caso inverso); (c) `regexp_replace` con patrones flexibles (más tolerante a cambios, pero también a
cambios que rompen la lógica sin avisar: un `replace()` literal fallando es la señal que se quiere).

## Descartado

- **A1: validar cada línea contra su propio redondeo y luego confiar en el papel.** Exige que la pantalla mande el precio
  bruto por línea (contrato nuevo) y no cubre facturas cuyo total el proveedor calculó distinto. La tolerancia proporcional
  es un cambio de una línea y no cambia el contrato.
- **A2: columna `token_pago` + índice único.** No soporta un pago con varios medios y duplica un mecanismo que ya existe.
- **M2: solo `fecha ≤ hoy`.** Deja pasar 1990. **M2 con piso = emisión a secas:** deja impagables comprobantes con emisión
  futura (y los creados de noche con el default UTC).
- **Cerrar `registrar_pago_compra` (un medio) para `anon`:** no estaba en el alcance; ver «Hallazgos».

## Verificación

- 66/66 casos, en las dos modalidades (contra el local con las dos migraciones aplicadas, y `--en-seco`, que carga la
  `registrar_compra` cruda + las dos migraciones dentro de cada escenario). Sin el parche en el escenario `--en-seco`, fallan
  exactamente los 8 casos de `registrar_compra` (los cuatro A1, tres de M2 y uno de M3): las pruebas detectan el hueco.
  (Medición anterior a dividir la migración: sin aplicar nada, 21/60 en verde con A1, M1 y M2/M3 fallando por la causa de la
  auditoría.)
- Casos propios del parche: aplicarlo dos veces no cambia el md5 de la función; aborta limpio con «Ancla no encontrada» si
  falta CUALQUIERA de las seis anclas (una por una, y la función queda idéntica), con «parcialmente parchada» si quedó a medias
  y con «2 firmas vivas» si hubiera sobrecarga; conserva `security definer`, `search_path`, comentario y grants. Además, si
  el worktree hermano de reparto está presente, se aplica el parche sobre **su** `registrar_compra` (no ejecutable en esta base:
  necesita `compra_item_destinos` y la columna ya retirada): las seis anclas aparecen 1 vez cada una, el parche se aplica,
  conserva `compra_item_destinos` y es re-ejecutable.
- Un caso por hueco (éxito tras el arreglo) **y** los negativos que deben seguir fallando: total +S/ 5 y −S/ 5, +S/ 0.50 en una
  unidad, sin IGV exacto, exceder el saldo, factura anulada, saldo a favor mayor al disponible, token de otro comprobante.
- Integrante (Micaela) sigue sin poder pagar por ninguna ruta; el líder, como rol `authenticated`, sí; `anon` sin EXECUTE;
  **una sola firma** de cada función (`group by proname having count(*) > 1` vacío); siguen `security definer` con
  `search_path = retail, public, extensions`; pegar la migración dos veces no rompe ni toca datos.
- Pruebas existentes: `compras_faltantes_y_pago_por_lote` (112), `recibir_envio` (29), `proveedores_cuentas_pago` (28) en
  verde sin cambios. `compras_indicadores` y `dinero_compras_solo_lider` tienen fallos ajenos a estas funciones (ver Hallazgos).
- **No probado por ejecución:** la carrera de dos llamadas simultáneas con el mismo token (un solo `psql` no abre dos
  transacciones concurrentes). Está razonada (candado por fila + chequeo posterior), no ejecutada.

## Riesgos

- **Orden con el reparto por tienda.** Ver «Por qué dos migraciones»: el parche protege contra el orden inverso de la 180000 pero
  NO contra que la migración de reparto se aplique después de la 181000 (la pisaría); en ese caso, re-pegar la 181000. Además
  el parche solo prueba anclas textuales: si la de reparto o cualquier otra cambia esas líneas, aborta con un mensaje claro
  en vez de dejar la función a medias.
- **Son funciones de dinero.** Entre el `drop` y el `create` de `registrar_pagos_compra` no puede haber un instante sin
  función: la migración corre en **una transacción** (`psql -1` / SQL Editor). `registrar_pago_compra` (un medio) la llama por
  nombre con 3 argumentos: sigue resolviendo, ahora contra la de 4 con el token por defecto.
- **Permisos.** La firma vieja de `registrar_pagos_compra` tenía EXECUTE para PUBLIC (`=X`, o sea `anon`); la nueva lo cierra
  (`revoke … from public, anon` + `grant … to authenticated`), como sus hermanas. Nada legítimo llamaba como `anon` (la función
  exige líder por dentro).
- **A1 relaja un candado a propósito.** Ver el corolario honesto arriba. El total del papel ya era la verdad; solo cambia
  cuántas centésimas de diferencia se explican por redondeo.
- **M2 rechaza datos que hoy entran.** Un pago con fecha futura o anterior a la emisión que un flujo actual mande empezará a
  fallar; por eso el mensaje dice cuál es el problema. No toca pagos ya guardados (no hay migración de datos).
- Re-ejecutable: `create or replace` / `drop function if exists` / `comment on`; la 181000 sale con un `notice` si ya está
  aplicada. No hay `DELETE` ni `UPDATE` de datos.

## Qué cambia en el cliente (no lo hizo esta migración)

- `apps/web/components/CompraDetallePanel.tsx` (~L196): mandar `p_token: <uuid>` en `registrar_pagos_compra`. El uuid se genera
  al abrir el formulario y se **conserva mientras el intento falle** (para que el reintento sea idempotente); se rota solo tras
  un éxito. **Sin `p_token` todo sigue como hoy** (esta migración es compatible hacia atrás con la pantalla actual).
- El selector de fecha del pago debería limitarse a `min = emisión` y `max = hoy` (la base ya lo exige; el mensaje llega, pero
  es mejor no ofrecer la fecha imposible).
- `packages/database/src/types.ts` se regenera al aplicar en producción (la firma de `registrar_pagos_compra` gana `p_token`).
- `docs/datos/generado/` se refresca al aplicarla en producción (`pnpm datos:generar:produccion`), no antes: una migración
  entra al diccionario cuando se aplica en producción.

## Hallazgos nuevos (no arreglados aquí)

- `registrar_pago_compra` (singular, un medio) también tiene EXECUTE para PUBLIC (`=X`). Exige líder por dentro, así que no es
  explotable, pero conviene el mismo `revoke … from public, anon`.
- En `registrar_compra` solo la fecha de la **primera** línea de pago se usa; las de las demás se ignoraban en silencio. Ahora
  se validan todas, pero siguen sin usarse.
- `registrar_compra` deja `p_fecha_emision` por defecto en `CURRENT_DATE` (fecha UTC), no `fn_hoy_lima()`.
- Un token de un pago del detalle y uno de un lote comparten `pago_grupo_id`; el lote devuelve «éxito» si el token ya existe
  aunque sea de un pago del detalle. Solo pasaría con un uuid reutilizado por el cliente.
- En el Postgres local compartido, `retail.por_pagar_tramos(uuid,text,boolean,text,text,date,date)` no lleva el candado de
  ADR-0126, y `fn_proveedores()` no devuelve los activos primero (el caso del ordenamiento de `compras_indicadores` falla): explican los fallos de `dinero_compras_solo_lider` (4) y
  `compras_indicadores` (2). No son de estas funciones (esta migración no las toca); parece deriva del local por otra sesión
  (volver a pegar `20260919160000` es idempotente).
