# ADR-0158 — Devoluciones: motivo del cambio en 1 toque, con lista cerrada en la base

**Fecha:** 2026-09-22
**Estado:** Aceptado e **implementado en local**. Verificado con un Postgres 17 desechable propio (Docker no
respondía en esta máquina): 195 migraciones aplicadas
(incluida esta), `pnpm pruebas:crear-devolucion-motivo` (8/8), `pnpm pruebas:aprobar-devolucion-caja` (5/5) y
`pnpm pruebas:registrar-cambio` (18/18, sin tocar) siguen en verde, `pnpm typecheck`, `pnpm lint` y `pnpm test`
(105 archivos, 2 545 pruebas) en verde, y una vista previa real en el navegador (servidor propio, sin Docker —
ver «Cómo se verificó la pantalla»). **Una migración sin aplicar en producción** (ver «Cómo se pega»).
**Decide:** Felipe, ronda de las 60 preguntas, D-79 (`docs/datos/DECISIONES-2026-09-21-menu-comercial.md`):
«al cambiar o devolver, motivo obligatorio (talla, calce, defecto, no le gustó, regalo) → "calce por prenda"
para revisar con el Taller. **Nunca usarlo para rankear asesoras** — desalienta el cambio, que debe ser sin
fricción.»
**Afecta:** `retail.devoluciones` (columna nueva), `retail.crear_devolucion` (drop + create, un parámetro
nuevo); `DevolucionesFlujo.tsx`, `devoluciones-reglas.ts` (mismo archivo, valores nuevos); `seed.sql`,
`scripts/local/verificar-cayla-v2.sql`, `scripts/pruebas/aprobar_devolucion_caja.mjs` (los tres llamaban a la
firma vieja); `packages/database/src/types.ts`. **`retail.cambios` y `registrar_cambio` NO se tocan** — ver
más abajo por qué.

## Contexto — el problema

CAYLA confecciona. Saber que «6 de 8 cambios de la Blusa Emma fueron por talla» no es una curiosidad: es una
orden directa al Taller sobre hacia dónde corregir un patrón. Hasta hoy, ese dato solo existía a medias:

- **Cambios** (`retail.cambios.motivo`) ya tenía una lista cerrada obligatoria desde
  `20260919000100_cambios_motivo_y_estado_de_prenda.sql`, **aplicada en producción el 2026-09-19** — dos días
  antes de que D-79 se decidiera. Su vocabulario: `talla_chica`, `talla_grande`, `otro_color`, `defecto`, `otro`.
- **Devoluciones** (`retail.devoluciones.motivo`) seguía siendo texto libre compuesto en la pantalla («Tiene un
  defecto — costura abierta en la manga»), agrupable por `group by` solo cuando nadie escribía un detalle.
  `docs/BACKLOG.md` ya tenía esto anotado como pendiente, con una condición explícita: «esperar a fusionar la
  migración de venta anulada (`20260918163712`, de otra sesión) para no tocar `crear_devolucion` en paralelo».
  Verificado el 2026-09-22 contra `origin/main` fresco: esa migración no había llegado, así que no hubo
  colisión que esperar.

D-79 pide una lista de seis: talla, calce, defecto, no le gustó, regalo, otro — un vocabulario **distinto** al
que Cambios ya tiene en producción (sin `talla_chica`/`talla_grande`/`otro_color`; con `calce`, `no le gustó` y
`regalo`, que Cambios no distingue). La tarea original asumía que ningún módulo tenía esto resuelto todavía;
la mitad de Cambios ya estaba resuelta, con otro vocabulario, en producción.

## Decisión

**1. Devoluciones cierra la mitad que faltaba, con el vocabulario exacto de D-79.** `devoluciones.motivo_codigo`
(columna nueva, `check` de seis valores: `talla`, `calce`, `defecto`, `no_le_gusto`, `regalo`, `otro`) y
`crear_devolucion` gana `p_motivo_codigo text`, **sin default** — la pantalla ya no deja confirmar una
devolución sin motivo, y ahora tampoco la base. La columna `motivo` (texto libre) no se toca: sigue existiendo
para lo que la clienta cuenta de más, la sigue usando `rechazar_devolucion` para anotar el rechazo, y la sigue
leyendo `DevolucionesPendientes.tsx`.

**2. `cambios.motivo` NO se toca — objeción explícita, no un olvido.** Unificar los dos vocabularios en uno
solo sería más consistente («una sola mente», mismo criterio que ya usa este repo), pero el costo real es:

- Redefinir un `check` que ya está **activo en producción**, sobre una función que Felipe todavía no verificó
  con una sesión real de punta a punta (`docs/BACKLOG.md`, sección Cambios: «Verificar con sesión real — la
  vuelta se probó con datos de ejemplo»). Tocar un candado en vivo sin que la tarea lo pida es el principio 12
  del repo al revés (parchar por parchar, no causa raíz).
- Perder la distinción `talla_chica`/`talla_grande`, que hoy le dice al Taller **hacia qué lado** corregir el
  patrón — estrictamente más información que la «talla» plana de D-79, no menos. Aplanarla sería un downgrade
  disfrazado de unificación.
- Rediseñar los chips ya construidos y documentados en ADR-0125 (`CambioReemplazo.tsx`), que nadie pidió tocar.

Queda una pregunta abierta para Felipe, no resuelta acá: ¿el reporte futuro de «calce por prenda» necesita el
mismo vocabulario en Cambios y Devoluciones, o mide dos cosas distintas a propósito (una prenda que se cambia
sigue en la tienda; una que se devuelve, no) y puede vivir con dos listas? Anotado en BACKLOG.

**3. `create or replace` no alcanza — hace falta `drop function` primero.** Verificado con el Postgres
desechable: agregar un parámetro al final de `crear_devolucion`, aunque tenga default, cambia
`pg_proc.proargtypes` y Postgres crea una SEGUNDA sobrecarga en vez de reemplazar la existente (mismo bug que
ya documentó `20260919000100` para `registrar_cambio` — confirmado de nuevo acá, no solo citado). Sin el
`drop`, quedarían dos `crear_devolucion` compitiendo: la vieja de 4 parámetros seguiría viva y aceptando
devoluciones sin motivo.

**4. `p_motivo_codigo` es obligatorio, sin default — no opcional con un valor por omisión.** Dato limpio desde
el día uno vale más que uno opcional que nadie llena. Fue posible porque se encontraron y actualizaron los
tres únicos llamadores de `crear_devolucion` en el repo: `DevolucionesFlujo.tsx` (la pantalla), `supabase/seed.sql`
y `scripts/local/verificar-cayla-v2.sql` (datos de desarrollo) y `scripts/pruebas/aprobar_devolucion_caja.mjs`
(la prueba existente, que dejó de compilar contra la firma nueva hasta corregirla).

## DECIDÍ / DESCARTÉ / SE ROMPE SI

**DECIDÍ:** columna nueva (`motivo_codigo`) además de la existente (`motivo`), no reemplazar la de texto libre.
**DESCARTÉ:** migrar `motivo` a la lista cerrada y eliminar el texto libre. Costo concreto: `rechazar_devolucion`
concatena sobre `motivo` («rechazada: …») y `DevolucionesPendientes.tsx` lo muestra tal cual — quitarlo rompía
dos lugares que no tenían por qué cambiar para resolver esto.
**SE ROMPE SI:** alguien construye el reporte de «calce por prenda» agrupando por `motivo` (texto libre) en vez
de por `motivo_codigo` — volvería a fragmentar por cada detalle distinto que escriba una asesora, exactamente lo
que esta columna existe para evitar.

**DECIDÍ:** `motivo_codigo` NULLABLE en la tabla, pero obligatorio (sin default) en la función.
**DESCARTÉ:** `not null` en la columna con un valor inventado para las filas existentes. Costo concreto: hay que
mentir sobre POR QUÉ se devolvió algo que ya pasó — nadie preguntó, no se sabe, y un valor por defecto ahí sería
un dato falso que después alguien usa como si fuera real.
**SE ROMPE SI:** alguien escribe un reporte que asume `motivo_codigo is not null` sin filtrar: las devoluciones
de antes de esta migración saldrían con un hueco, no con un error — hay que decidir cómo se muestra ese hueco
antes de construir el reporte (fuera de esta tarea, a propósito).

**DECIDÍ:** no tocar `cambios.motivo` ni unificar el vocabulario.
**DESCARTÉ:** unificar los dos vocabularios en uno solo (el de D-79) desde ya. Costo concreto: redefinir un
`check` activo en producción sin que la tarea lo pida, y perder la distinción talla_chica/talla_grande que hoy
usa el Taller.
**SE ROMPE SI:** Felipe decide más adelante que sí quiere un solo vocabulario — en ese momento hay que migrar
las filas existentes de `cambios.motivo` (mapeo talla_chica/talla_grande → talla, otro_color → otro) y avisar
al Taller que la granularidad de dirección (chica/grande) desaparece.

## Lo que este ADR explícitamente NO hace (a pedido de Felipe)

**El motivo del cambio o la devolución no se usa en ningún cálculo de ranking, puntaje o comparación entre
asesoras — ni en esta migración ni en el código que la acompaña.** Es un dato para revisar el calce por prenda
CON EL TALLER, nunca para medir personas: D-79 lo dice explícito («desalienta el cambio, que debe ser sin
fricción»). Ninguna consulta de este cambio agrupa por `usuario_id`/colaboradora sobre esta columna, y el
reporte de «calce por prenda» que algún día lea esta columna es trabajo futuro, fuera de esta tarea a propósito.

## Cómo se verificó la pantalla

Sin Docker disponible (el stack local compartido no respondía), se levantó `next dev` desde esta misma rama en
un puerto propio y se abrió `/login/zz-harness` (andamio temporal, ya borrado — mismo truco que la memoria
`probar-ui-sin-base-de-datos`: `proxy.ts` deja pasar `/login/*` sin sesión) con `DevolucionesFlujo` montado
sobre una venta de ejemplo. Se navegó Prendas → Detalle: los seis chips («No era su talla», «No le calzó bien»,
«Tiene un defecto», «No le gustó», «Era un regalo», «Otro motivo») aparecen y responden a un toque, el panel de
validaciones pasa de «Falta elegir por qué la devuelve» a «Motivo: no le calzó bien» (5/5), y el paso de
Confirmación lo repite tal cual. No se probó el `submit` real (no hay Supabase local corriendo) — eso lo cubre
`pnpm pruebas:crear-devolucion-motivo` contra Postgres directo.

## Cómo se pega en producción (lo hace Felipe o el arquitecto, DESPUÉS de revisar)

Un solo archivo: `supabase/migrations/20260922180000_devoluciones_motivo_estructurado.sql`. Ya trae
`set search_path = retail, public, extensions;`: sirve tal cual en el SQL Editor del proyecto de Dynamic.
**Orden de despliegue: esta migración PRIMERO, el front (que manda `p_motivo_codigo`) DESPUÉS** — igual que
documentó `20260919000100` para Cambios: si el front sale antes, `crear_devolucion` de 5 parámetros no existe
todavía y PostgREST responde «could not find function». Verificar después de pegar:

```sql
select proname, pg_get_function_identity_arguments(oid)
  from pg_proc where proname = 'crear_devolucion' and pronamespace = 'retail'::regnamespace;
-- debe dar UNA sola fila, de 5 parámetros (con motivo_codigo)
select conname from pg_constraint where conname = 'devoluciones_motivo_codigo_check';
```

## Qué se rompería sin esto

El Taller sigue sin saber, con un dato limpio, por qué se devuelve cada prenda — «6 de 8 devoluciones fueron
por defecto» seguiría dependiendo de que nadie escriba un detalle distinto, y cualquier intento de contar por
motivo real necesitaría parsear texto libre a mano, con todo el margen de error que eso trae.
