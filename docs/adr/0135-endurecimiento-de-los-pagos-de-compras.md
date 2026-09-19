# ADR-0135 — Endurecimiento de los pagos de Compras (token, fechas, decimales y redondeo del IGV)

- **Fecha:** 2026-09-19
- **Estado:** Aceptado en el Postgres **local**; **PENDIENTE de aplicar en producción (requiere confirmación de Felipe)**.
  Toca tres funciones de dinero y cambia la firma de una: regla de CLAUDE.md, se detiene y se confirma antes.
- **Migración:** `supabase/migrations/20260919180000_pagos_compras_endurecimiento.sql` (su cabecera repite el porqué).
- **Pruebas:** `pnpm pruebas:pagos-compras-endurecimiento` (60 casos, cada uno con ROLLBACK; `--en-seco` carga la migración
  dentro de cada escenario). Están en CI.
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

## Descartado

- **A1: validar cada línea contra su propio redondeo y luego confiar en el papel.** Exige que la pantalla mande el precio
  bruto por línea (contrato nuevo) y no cubre facturas cuyo total el proveedor calculó distinto. La tolerancia proporcional
  es un cambio de una línea y no cambia el contrato.
- **A2: columna `token_pago` + índice único.** No soporta un pago con varios medios y duplica un mecanismo que ya existe.
- **M2: solo `fecha ≤ hoy`.** Deja pasar 1990. **M2 con piso = emisión a secas:** deja impagables comprobantes con emisión
  futura (y los creados de noche con el default UTC).
- **Cerrar `registrar_pago_compra` (un medio) para `anon`:** no estaba en el alcance; ver «Hallazgos».

## Verificación

- 60/60 casos nuevos. Antes de aplicar la migración, las mismas pruebas (sin `--en-seco`) reproducen los huecos: 21/60 en
  verde, con los cuatro A1, M1 y M2/M3 fallando por la causa que la auditoría describió.
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
- Re-ejecutable: `create or replace` / `drop function if exists` / `comment on`. No hay `DELETE` ni `UPDATE` de datos.

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
