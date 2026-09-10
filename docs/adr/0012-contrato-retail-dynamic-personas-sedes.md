# ADR-0012 — El contrato con Dynamic: 7 columnas de `personas`, 6 de `sedes`, y retail no escribe ninguna

**Fecha:** 2026-09-05
**Estado:** La parte del contrato (qué se lee) **ya es cierta hoy y solo estaba
sin escribir** — este ADR la escribe. La parte de la escritura (cerrar la vista,
`coalesce` en los helpers) está escrita en
`supabase/unificacion/22_candados_y_permisos.sql`, pendiente de pegar en
producción. El `LEFT JOIN` de `retail.sedes` sigue sin escribirse.

## Contexto

Desde la unificación de julio, retail no tiene tabla de identidad propia. Todo
"quién eres y dónde trabajas" entra por dos vistas puente
(`supabase/unificacion/03_candados.sql:14-28`) sobre las tablas de
cayla-dynamic, en el mismo Postgres:

```sql
create or replace view retail.sedes ... as
select s.id, s.codigo, s.nombre, m.tipo, m.tienda_asociada_id, s.activa as activo
from public.sedes s join retail.sede_meta m on m.sede_id = s.id;

create or replace view retail.personas ... as
select p.id, p.auth_user_id,
       (p.nombres || ' ' || coalesce(p.apellidos, '')) as nombre,
       p.sede_base_id as sede_id, p.rol::text as rol, p.email, p.estado
from public.personas p;
```

Eso es una dependencia dura entre dos sistemas con dueños distintos, y **no está
escrita en ningún lado**: ni en `docs/ARQUITECTURA.md`, ni en un ADR, ni en el
repo de Dynamic. Quien trabaje en Dynamic no tiene forma de saber que renombrar
una columna suya apaga las cajas de tres tiendas.

Lo que retail realmente consume de Dynamic son **tres cosas y nada más**:

**1. Siete columnas de `personas`.** La vista las expone así:

| Columna de `retail.personas` | De dónde sale en Dynamic |
| --- | --- |
| `id` | `public.personas.id` |
| `auth_user_id` | `public.personas.auth_user_id` |
| `nombre` | `nombres \|\| ' ' \|\| coalesce(apellidos,'')` |
| `sede_id` | `public.personas.sede_base_id` |
| `rol` | `public.personas.rol::text` (enum `rol_usuario`) |
| `email` | `public.personas.email` |
| `estado` | `public.personas.estado` |

Las consume `apps/web/lib/persona.ts:52` (el login: `select id, nombre, rol,
sede_id where auth_user_id = ...`), `retail.persona_actual()`, y otros cuatro
sitios (`app/actions/sede.ts:19`, `api/export/inventario/route.ts:15`,
`api/padron/route.ts:53`, `producto/[varianteId]/page.tsx:104`).

**2. Seis columnas de `sedes`,** de las cuales solo cuatro son de Dynamic
(`id`, `codigo`, `nombre`, `activa`); `tipo` y `tienda_asociada_id` salen de
`retail.sede_meta`, que es nuestra. `apps/web/lib/sedes.ts:30` pide exactamente
esas seis.

**3. Dos funciones y un valor de enum.** `public.fn_rol_actual()` y
`public.fn_sede_actual_persona()`, que son de Dynamic, más el literal `'admin'`
con el que `retail.es_lider()` decide Líder. Toda la RLS de las 34 relaciones de
`retail` se decide con esas dos funciones.

Sobre esa dependencia, la auditoría encontró tres cosas:

**La ventana de lectura es también una puerta de escritura.** `pg_class` en
producción: `retail.personas | postgres | {security_invoker=false}` — pese a que
el repo la declara `with (security_invoker = true)`
(`03_candados.sql:15`); la opción se perdió en la transcripción (ADR-0011).
`postgres` tiene `rolbypassrls=true`, así que las 5 políticas RLS de
`public.personas` quedan inertes al entrar por la vista.
`information_schema.columns` sobre `retail.personas` da `id, auth_user_id,
sede_id, email, estado` con `is_updatable = YES`, y `authenticated` tiene
UPDATE/INSERT/DELETE. Como la app crea el cliente con `db: { schema: "retail" }`
(`lib/supabase/client.ts`), `.from("personas").update(...)` desde la consola del
navegador llega a la tabla de identidad de Dynamic. Y `auth_user_id` es
actualizable: no es movimiento lateral entre sedes, es escalada total — se ubica
la fila del admin y se le reapunta `auth_user_id`. El linter de Supabase lo marca
por su cuenta como ERROR (`security_definer_view`) sobre las dos vistas.

**El `join` con `sede_meta` es INNER, así que una sede de Dynamic puede no
existir para retail.** Conteos en producción: `public.sedes` = 6,
`retail.sede_meta` = 5, `retail.sedes` = 5. La que falta es `OTRU · Oficina
TRU`. Hoy es una oficina y no duele; el día que Felipe abra la tienda #6 desde
Dynamic, en el ERP no va a aparecer: no sale en el selector de sede, no se le
puede abrir caja, no vende, no figura en Egresos ni en el EERR. Y ninguna
pantalla dice "esta sede no está configurada" — se ve igual que si la sede nunca
se hubiera creado.

**La app no escribe en ninguna de las dos.** `grep` sobre `apps/web`: los usos de
`.from("personas")` y `.from("sedes")` son todos `.select()`. El permiso de
escritura no lo usa nadie.

## Decisión

**DECIDÍ: escribir el contrato como contrato —siete columnas de `personas`,
seis de `sedes`, dos funciones y el valor `'admin'`— y cerrar la vista para que
sea solo lectura. Retail lee la identidad de Dynamic; nunca la escribe, y nunca
le pide que cambie.**

1. **El contrato de lectura queda escrito acá y como comentario en la cabecera
   de la vista.** Es la lista de arriba. Cualquier cambio en Dynamic sobre esas
   columnas —renombrar, cambiar el tipo, partir `nombres`/`apellidos`, mover
   `sede_base_id`— es un cambio que rompe retail, y se coordina antes, no
   después. Lo que Dynamic haga con el resto de `public.personas` (agregar
   columnas, cambiar sus propias pantallas) no nos afecta y no requiere aviso.
2. **`alter view retail.personas set (security_invoker = on)`** —restituir lo
   que el repo ya declaraba— **y `revoke insert, update, delete on
   retail.personas, retail.sedes from authenticated`.** La vista pasa a ser una
   ventana, no una puerta. Se prueba antes en local que `security_invoker` no
   reabre la recursión de RLS que motivó `0023_rls_helpers_security_definer.sql`
   (los helpers de hoy son `public.fn_rol_actual`/`fn_sede_actual_persona`,
   ambos `security definer`, así que el ciclo ya está roto por otro lado). Si
   eso diera problemas, el `revoke` solo ya cierra el daño real.
3. **El `join` con `sede_meta` pasa a `LEFT`,** con `coalesce(m.tipo,
   'sin_configurar')`. Una sede que existe en Dynamic existe en retail, aunque
   sea para decir que le falta configuración. Ojo con el arreglo que circula:
   `coalesce(m.activo, false)` apunta a una columna que **no existe** —en la
   vista `activo` sale de `s.activa`, de `public.sedes`—; solo `tipo` necesita
   `coalesce`.
4. **Retail nunca decide un permiso leyendo un valor nuevo del enum de
   Dynamic.** Los permisos propios de retail salen de tablas propias. Esta regla
   es la que sostiene ADR-0018 (el contador de solo lectura) y la que impide que
   el ERP quede esperando un release de Dynamic para poder dar un acceso.
5. **`retail.puede_operar_sede` y `retail.es_lider()` se reescriben con
   `coalesce(..., false)` en cada término.** No es cosmético y no es de Dynamic:
   `public.fn_rol_actual()` filtra `estado = 'activo'` y
   `public.fn_sede_actual_persona()` **no** (verificado con
   `pg_get_functiondef`). Para quien no tiene fila activa, las dos comparaciones
   dan NULL, y en plpgsql `if not NULL then raise` **toma la rama falsa: no
   lanza** (`select (not null::boolean) is null` → true). Son 8 logins vivos hoy
   en ese estado —4 personas con `estado <> 'activo'` y login sin revocar, 4
   usuarios de auth sin fila en `personas`— pasando los 19 candados del sistema,
   incluidos los de solo Líder. Con `coalesce` en dos funciones de una línea,
   los 19 empiezan a lanzar de verdad sin tocar ninguno.

**DESCARTÉ: copiar `personas` y `sedes` a tablas propias de retail y
sincronizarlas.** Es lo que uno hace cuando quiere dejar de depender de otro
sistema, y es lo que la unificación de julio ya descartó una vez. Cuesta dos
verdades sobre quién trabaja dónde: el día que una colaboradora pasa de AQP a
TRU en Dynamic, sigue vendiendo en AQP hasta que corra la sincronización, y si
la sincronización falla nadie se entera hasta el cierre de caja. Una sola fuente
de identidad, aunque sea de otro, es mejor que dos que casi coinciden.

**DESCARTÉ también: pedirle a Dynamic que agregue lo que retail necesita** —una
columna nueva, un valor de rol, un filtro de `estado` en
`fn_sede_actual_persona()`. Cada pedido así ata la entrega de retail a un
release de Dynamic, y al revés: Dynamic queda sin poder tocar su propio esquema
sin consultarnos. El contrato es explícitamente **de mínimos**: mientras esas
siete columnas y esas dos funciones sigan existiendo con el mismo significado,
los dos sistemas evolucionan sin coordinarse. (El filtro de `estado` en
`fn_sede_actual_persona()` sí conviene coordinarlo con Dynamic, pero como mejora
de ellos, no como requisito nuestro: el punto 5 nos deja seguros sin depender de
eso.)

**SE ROMPE SI: alguien en Dynamic renombra `personas.sede_base_id` a `sede_id`,
o parte `nombres`/`apellidos` en otra estructura, un martes cualquiera.** No es
hipotético: es el cambio más natural del mundo para quien está ordenando *su*
tabla y no sabe que hay una vista de otro schema leyéndola. La vista no falla al
compilar —Postgres la deja rota recién cuando alguien la consulta—, así que el
síntoma llega el miércoles a las 9:00: `requirePersonaActual` recibe un error de
PostgREST, manda a `/login`, y **las tres sedes se quedan sin poder abrir caja
al mismo tiempo**. La encargada de TRU no puede vender, la de AQP tampoco, y el
Taller no puede cerrar una producción — con la clienta esperando en el
mostrador. Nada en las pruebas de Dynamic falla, porque Dynamic no sabe que
alguien lee eso. El candado es que este contrato esté escrito en los dos lados y
que retail tenga una consulta de verificación que corra sola: las 7 columnas de
`retail.personas` y las 6 de `retail.sedes`, con sus tipos, comparadas contra
esta tabla.

## Consecuencias

La frontera entre los dos sistemas deja de vivir en la cabeza de la única
persona que construyó los dos. El ERP de retail pasa a no poder tocar la tabla
de identidad de Dynamic ni por accidente ni desde la consola del navegador, y
`retail.sede_meta` queda claramente marcada como lo que es: la parte de "sede"
que **sí** es nuestra, y la única que podemos cambiar sin avisarle a nadie.

Queda fuera de este ADR, como trabajo de hoy: revisar los 4 logins de personas
inactivas y los 4 usuarios de auth sin fila en `personas` — el `coalesce` los
deja sin poder operar, pero seguir teniendo credenciales vivas de gente que ya
no trabaja acá es una decisión de Desarrollo Organizacional, no de esquema.
