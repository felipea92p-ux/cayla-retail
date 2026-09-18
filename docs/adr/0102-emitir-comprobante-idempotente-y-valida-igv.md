# ADR-0102 — `emitir_comprobante` idempotente + candado de IGV en `emitir_comprobante`/`crear_proforma`

**Fecha:** 2026-09-18
**Estado:** Aplicado y verificado en local (`20260918091500_emitir_comprobante_idempotente_y_valida_igv.sql`,
renumerada desde `20260918080000` — chocaba con `20260918080000_resumen_inventario.sql` al
fusionar `origin/main`; este ADR nació como 0101 y se renumeró a 0102 por el mismo motivo,
0101 ya lo había tomado "Resumen de Inventario"). **Verificado de solo lectura contra
producción** (`cayla-dynamic`) antes de pegar: `emitir_comprobante`/`crear_proforma` con la
misma firma (`p_ubicacion_id`, no `p_sede_id`), `token_cliente` no existe todavía, 0 filas
con `subtotal+igv≠total` en `comprobantes`/`proformas`.
**No aplicado en producción** — pendiente de Felipe (D-11).
**Afecta:** tabla `retail.comprobantes` (columna nueva `token_cliente`); funciones
`retail.emitir_comprobante` (firma nueva: agrega `p_token uuid default null` al final) y
`retail.crear_proforma` (mismo candado, sin cambio de firma). `apps/web/components/ComprobantesPanel.tsx`,
`packages/database/src/types.ts`.

## El problema

Auditoría de módulo del 2026-09-17 (`docs/datos/modulos/08-facturacion-sunat.md`, huecos 1 y 2)
encontró dos huecos GRAVE:

1. `emitir_comprobante` reserva el correlativo SUNAT (`fn_reservar_numero_serie`) y recién
   después inserta la fila — sin token de idempotencia. El caso caro no es el doble clic (ya
   lo bloquea `cargando` en el botón) sino la respuesta que se corta DESPUÉS de que el
   servidor ya reservó el número: el navegador no sabe si se guardó, "vuelve a intentar" quema
   un segundo correlativo irreversible ante SUNAT. `registrar_venta` ya resolvió exactamente
   esto para Vender (ADR-0032/0033, `token_cliente` + `p_token`); el panel manual de
   Facturación (`ComprobantesPanel.tsx`, "Emitir comprobante" suelto) se quedó sin portar ese
   patrón.
2. Ni `emitir_comprobante` ni `crear_proforma` validaban ninguna relación entre `subtotal`,
   `igv` y `total` — cualquiera que llamara la RPC directo (sin pasar por el navegador) podía
   guardar `subtotal=1, igv=0, total=1000` y la base lo aceptaba sin quejarse.

## Decisión

**DECIDÍ: portar el patrón de `token_cliente`/`p_token` de `registrar_venta` tal cual, sin
reinventarlo.** Columna `comprobantes.token_cliente uuid unique` (mismo tipo/constraint que
`ventas.token_cliente`, no una versión "mejorada"); el guard revisa el token **antes** de
`fn_reservar_numero_serie` — así el reintento no consume un correlativo nuevo, que es
justamente lo que hueco 1 pedía evitar. El insert va dentro de un `begin/exception when
unique_violation` que atrapa la carrera de dos requests con el mismo token llegando casi
simultáneos (más rara que el reintento secuencial, pero posible).

**DECIDÍ: `p_token` se agrega al FINAL con `default null`, no en medio de la firma.** Los
llamadores existentes por posición (`registrar_venta` en `0011_venta_con_comprobante.sql:136-139`,
`convertir_proforma_a_comprobante` en el mismo archivo `0010`) siguen mandando sus 10
argumentos de siempre sin tocarlos — ninguno de los dos gana idempotencia propia con este
cambio, siguen exactamente igual que antes. El `drop function` explícito antes del `create or
replace` es necesario igual (ADR-0026): un parámetro nuevo sin drop deja la firma vieja
sobrecargada al lado.

**DECIDÍ: el candado de IGV es una validación, no un cálculo movido a la base.** `if
p_subtotal is null or p_igv is null or round(p_subtotal + p_igv, 2) <> round(p_total, 2) then
raise exception`. Esto cierra la parte GRAVE del hueco 2 (una cifra que no cuadra ya no se
puede guardar) sin tocar la parte (a) del mismo hueco — el 18% sigue hardcodeado en el
navegador (`ComprobantesPanel.tsx:370`, `ProformasPanel.tsx:96`, y también en
`registrar_venta`, `0011_venta_con_comprobante.sql:134`). Mover el cálculo a la base es un
cambio más grande (afecta 3 sitios, no 2) que nadie pidió todavía — se deja para cuando se
decida hacerlo, con su propio ADR.

**DECIDÍ: el mismo candado de IGV entra también a `crear_proforma`**, no solo a
`emitir_comprobante` — el hueco 2 citaba ambos archivos (`ComprobantesPanel.tsx` y
`ProformasPanel.tsx`) como origen del cálculo sin validar. Sin cambio de firma ahí: mismos
parámetros, `create or replace` alcanza, conserva los grants existentes.

**DESCARTÉ tocar `emitir_nota`.** Mismo hueco 1 en teoría ("lo mismo aplica a emitir_nota"),
pero verificado contra el código real: cero llamadores (`grep emitir_nota` sobre `apps/web` y
`packages` solo devuelve comentarios y el tipo generado). Agregar idempotencia a una función
sin pantalla es trabajo para código que nadie ejecuta todavía — se hace el día que
Devoluciones-sobre-factura (hueco 5) le construya un llamador real, no antes.

**DESCARTÉ regenerar `packages/database/src/types.ts` completo.** `gen-types` contra el
Postgres local habría traído de regalo meses de drift acumulado de otras ~9 migraciones que
sesiones paralelas dejaron aplicadas ahí pero no reflejadas en el `types.ts` commiteado (mismo
fenómeno que documenta ADR-0093, "Nota al margen"). Se agregó `p_token?: string` a mano en el
bloque de `emitir_comprobante` — diff de una línea, no arrastra nada ajeno a este cambio.

## Se rompe si

Una proforma **creada antes de este cambio** con `subtotal + igv ≠ total` (dato inconsistente
heredado de cuando `crear_proforma` no validaba nada) se intenta convertir a comprobante
después de aplicar esto — `convertir_proforma_a_comprobante` llama `emitir_comprobante` con
los valores ya guardados de la proforma, y el candado nuevo la rechazaría. Verificado en local
antes de escribir la migración: `select count(*) from proformas` y `select count(*) from
comprobantes where round(subtotal+igv,2) <> round(total,2)` — ambas en 0 filas, no hay dato
heredado que choque. **No verificado contra producción** — antes de pegar esta migración allá,
correr la misma consulta contra `retail.proformas` primero.

## Cómo se verificó

Migración aplicada directo contra el Postgres local (`psql -f`, no solo revisada a ojo):
`ALTER TABLE`, `DROP FUNCTION`, `CREATE FUNCTION` × 2 corrieron sin error contra el esquema
`retail` completo, con sus dependencias reales (`fn_reservar_numero_serie`,
`fn_puede_operar_ubicacion`). Confirmado después con `pg_get_function_identity_arguments`:
`emitir_comprobante` termina en `p_token uuid`, `comprobantes.token_cliente` existe.
`pnpm --filter @cayla-retail/database typecheck` y `pnpm --filter web typecheck`: limpios.
`pnpm migraciones:verificar`: el archivo nuevo no aparece entre los que faltan ni entre los
"sin promesa detectable".

**No se probó el guard de idempotencia ni el de IGV con una llamada RPC real autenticada** —
ambos dependen de `auth.uid()`/`fn_es_lider()`, que solo resuelven con un JWT real de
PostgREST; simularlos como superusuario de `psql` habría exigido fabricar contexto de
autenticación o tocar filas de `personas` en el Postgres compartido, y no valía el riesgo para
esta verificación. La evidencia que sí se tiene: el `CREATE FUNCTION` no rechazó la sintaxis
PL/pgSQL (habría fallado ahí si el bloque `begin/exception` o el `%rowtype` estuvieran mal), y
la lógica es una copia línea por línea del patrón de `registrar_venta`, que sí tiene pruebas
reales (`scripts/pruebas/registrar_venta.mjs`).

**Aviso operativo, no de esta tarea:** el Postgres local es un contenedor Docker compartido por
los 40+ worktrees del repo, no uno por worktree. Durante esta verificación, el esquema se
revirtió solo dos veces mientras se comprobaba — casi seguro otra sesión concurrente (hay un
worktree `auditoria-facturacion-cayla-2b8328`, probablemente trabajando el mismo módulo ahora
mismo) corrió su propio `db reset`/`migration up` sobre el mismo contenedor. Cualquier sesión
futura que verifique contra este Postgres local debe asumir que el estado puede cambiar por
debajo sin aviso.

## Lo que falta

1. **Aplicar en producción** — pendiente de que Felipe decida, con el prefijo `retail.` en el
   SQL Editor (o `set search_path to retail, public;` al inicio). Antes de pegar: correr
   `select count(*) from retail.proformas where round(subtotal+igv,2) <> round(total,2)` allá
   (ver "Se rompe si") — si devuelve > 0 filas, esas proformas quedan sin poder convertirse
   hasta corregir su dato o excluir el candado para filas heredadas.
2. **`packages/database/src/types.ts` sigue con drift preexistente** (no de este cambio) frente
   al Postgres local — regenerarlo completo es tarea aparte, no se hizo acá a propósito (ver
   "Descarté" arriba).
3. **La parte (a) del hueco 2 sigue abierta**: el 18% hardcodeado en tres archivos
   (`ComprobantesPanel.tsx`, `ProformasPanel.tsx`, `0011_venta_con_comprobante.sql`). Mover el
   cálculo a la base es un cambio de alcance mayor, no incluido acá.
4. **Prueba real contra Postgres autenticado** (`scripts/pruebas/`, mismo patrón que
   `registrar_venta.mjs`) — no existe todavía para `emitir_comprobante`; el hueco 2 del doc de
   módulo ya lo señalaba ("cero pruebas de las RPC del módulo contra Postgres real").
