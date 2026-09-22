# ADR-0157 — Alta de colaborador nuevo: no queda operativa sin una aprobación

**Fecha:** 2026-09-22 · **Estado:** hecho en local (Postgres 17 desechable, sin Docker) y probado en
el navegador con datos de ejemplo; migración `20260922170000_alta_colaborador_requiere_aprobacion.sql`
**sin pegar en producción** · **Origen:** D-70, `docs/datos/DECISIONES-2026-09-21-menu-comercial.md`

## Contexto

D-70: *"el líder de su sede, o Felipe, aprueba el alta [de un colaborador nuevo]; no es automática
aunque la persona ya tenga función de servicio en Dynamic. La baja sí es automática."*

Antes de diseñar nada se investigó cómo nace hoy una fila de `retail.colaboradores` (no asumir,
verificar): **no existe ningún trigger sobre `public.personas`** que la cree — se buscó en todo
`supabase/migrations/` por `colaboradores` y por triggers sobre `personas`, y la única forma en que
nace una fila es una llamada explícita de un líder a `agregar_colaborador()`/`agregar_colaboradores()`
(0013, 0016, 20260922100000, 20260922110000). Tampoco existe `retail.personas` desde
0009_integracion_dynamic.sql (Dynamic es dueño de esa identidad). La baja automática por Dynamic
tampoco es nueva: las tres funciones de acceso (`fn_es_lider`, `fn_ubicacion_actual_persona`,
`fn_tiene_acceso_retail`) ya filtran `p.estado = 'activo'` contra `public.personas` desde 0006/0009 —
esta migración no la toca.

Lo que SÍ falta es lo que D-70 pide: hoy `agregar_colaborador` es a la vez *proponer* y *dar acceso
real* en un solo clic de un solo líder — no hay un segundo paso que lo confirme.

## Decisión

1. **`retail.colaboradores` gana `estado`** (`pendiente_aprobacion` | `activo`, default `activo`
   para no desconectar a nadie que ya operaba). `agregar_colaborador`/`agregar_colaboradores` insertan
   con `estado = 'pendiente_aprobacion'` explícito — toda alta nueva nace sin poder operar.
2. **El candado real, en seis funciones**, no solo en una: las tres que todo el esquema usa
   (`fn_es_lider`, `fn_ubicacion_actual_persona`, `fn_tiene_acceso_retail`) y las tres lecturas que
   consultan `colaboradores` directo sin pasar por ellas (`fn_mi_perfil`, `fn_persona_actual_resumen`
   — el gate de login/AppShell —, `fn_stock_por_sede`). Las seis suman `c.estado = 'activo'`. Es el
   mismo hueco NULL-vs-false que 0006 y 0009 ya corrigieron una vez, ahora en una dimensión nueva.
3. **`retail.fn_aprobar_alta_colaborador(p_persona_id uuid)`** — SECURITY DEFINER, `fn_es_lider()`
   PRIMERO (mismo patrón que ADR-0143/20260921120000: el candado de rol va antes de mirar si el
   recurso existe). Pasa la fila a `activo` y lo anota en `colaboradores_historial` (acción nueva
   `aprobacion`).
4. **`retail.fn_colaboradores_pendientes()`** — solo líder, lista quién espera aprobación, quién lo
   propuso y a qué ubicación.
5. **`suspender_colaborador` gana una guarda**: no se puede "suspender" a alguien todavía pendiente.
   Sin esto, `colaboradores_suspendidos` (que no tiene columna `estado`) reactivaría a esa persona
   como `activo` por default sin que nadie la haya aprobado nunca — el mismo tipo de estado
   imposible que el CHECK de ubicación ya evita en 20260922100000.
6. **Pantalla:** pestaña nueva **Pendientes** en `/colaboradores`, entre Activos y Suspendidos, con
   botón **Aprobar** (acción directa, sin modal — mismo patrón que "Reactivar acceso") y **Rechazar
   alta** en el menú «⋯» (reusa `quitar_colaborador`, que ya borraba la fila sin importar su estado;
   solo se ajustó el texto del modal para el caso "nunca llegó a tener acceso").

### "El líder de su sede" — por qué no se implementa así todavía

D-69 (misma ronda) es la decisión que acota a cada líder a su sede, y dice explícitamente que
*"se aplica DESPUÉS de la salida en TRU, nunca mientras el equipo trabaja"* y que queda *"pendiente
desde ADR-0143"*. Hoy un líder sigue siendo global (ADR-0143) y no hay ninguna columna que distinga
"a Felipe" de cualquier otro de los 9 líderes ya registrados (verificado en
`colaboradores-iniciales-produccion.sql`). `fn_aprobar_alta_colaborador()` exige `fn_es_lider()` tal
cual existe hoy — el estado real antes de D-69 — y hereda el acotamiento por sede el día que D-69 lo
construya, sin que haya que tocar esta función.

## Descartado

- **Tabla `retail.altas_pendientes` separada**, en vez de una columna en `colaboradores`. Habría sido
  una segunda tabla con casi las mismas columnas y su propio candado cruzado (como `colaboradores` /
  `colaboradores_suspendidos`), para un problema que una columna con dos valores ya resuelve. El
  principio 6 del repo (eliminar el caso especial) pide primero intentar que la estructura de datos
  absorba el caso, no agregar una tabla más — y acá sí alcanza.
- **Inventar una columna "es Felipe"** para resolver la mitad de D-70. Sería una segunda fuente de
  verdad sobre quién es el dueño del sistema (principio 4), y D-69 ya tiene el lugar correcto para
  resolver "el líder de su sede" cuando se construya.
- **Aprobar automáticamente si el mismo líder que propuso también aprueba en la misma sesión.** No
  fue lo que D-70 pidió (pide una aprobación real, no un segundo clic sin sentido), y habría sido el
  mismo hueco de un solo paso que esta migración cierra.

## Se rompe si

- Se pega en producción sin desplegar la web: **no rompe nada** (a diferencia de ADR-0148/20260922110000).
  La web VIEJA sigue funcionando igual — no llama a las funciones nuevas, y todo colaborador ya
  registrado queda `activo` por el default de la columna.
- Alguien inserta a mano en `colaboradores` sin especificar `estado`: hereda `activo` — correcto para
  todo lo que no es un alta nueva por la pantalla, pero un script que inserte altas en lote a mano
  tendría que acordarse de pasar `estado = 'pendiente_aprobacion'` si quiere que pasen por aprobación.

## Cómo se verificó

- **Base:** Postgres 17 desechable (Homebrew, sin Docker — memoria `postgres-desechable-sin-docker`),
  con las 194 migraciones del repo + el stub local de Dynamic + `seed.sql` aplicados limpios, y la
  migración nueva aplicada dos veces sobre eso (idempotente). `scripts/pruebas/
  colaboradores_alta_requiere_aprobacion.mjs`, 10 escenarios en verde: alta nace pendiente; pendiente
  no puede operar (`fn_puede_operar_ubicacion` da falso); aprobar exige líder; tras aprobar sí puede
  operar; aprobar dos veces o algo inexistente falla con mensaje claro; suspender rechaza a un
  pendiente; la aprobación queda en el historial; los colaboradores ya existentes (backfill) siguen
  `activo`. Regresión: `colaboradores_endurecimiento.mjs` (7/7) y `candado_lider_caja_y_ajuste.mjs`
  (20/20) siguen en verde sobre el esquema con esta migración aplicada.
- **Tipos y estilo:** `pnpm typecheck` y `pnpm lint` en verde (se sumaron a mano las dos funciones
  nuevas a `packages/database/src/types.ts` — no hay Postgres real para `supabase gen types`);
  `pnpm --filter web test` (2546 pruebas) en verde, con un caso nuevo para `fraseEvento("aprobacion")`.
- **Pantalla:** en el navegador (servidor `next dev` propio, sin Docker), con `ColaboradoresPanel`
  alimentado con datos de ejemplo (`acciones`/`alActualizar` ya existían para esto) en una ruta
  temporal bajo `/login` — ya borrada, junto con el `.env.local` de mentira, siguiendo la memoria
  `probar-ui-sin-base-de-datos`. Se vio y se ejercitó: pestaña **Pendientes** con Angie Torres
  (ubicación propuesta, quién la propuso, cuándo), clic en **Aprobar** con su aviso de éxito, el menú
  «⋯» → **Rechazar alta** con el modal y su texto ("no llegará a tener acceso… la propuesta se
  descarta"), y la pestaña **Actividad** mostrando el evento "Aprobación" con el texto correcto.

## Cómo se pega en producción

Con ok de Felipe o el arquitecto, entera en el SQL Editor de cayla-dynamic (trae `retail.` donde
hace falta; es re-ejecutable). No hay orden estricto con el despliegue de la web (ver "Se rompe si").
Después: `pnpm datos:generar:produccion` tras refrescar el volcado
(`docs/datos/generado/COMO-REFRESCAR.md`) para que la columna `estado` y las dos funciones nuevas
entren al diccionario.
