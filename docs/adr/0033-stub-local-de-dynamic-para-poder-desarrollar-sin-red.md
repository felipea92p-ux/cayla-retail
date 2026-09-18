# ADR-0033 — Un stub local de Dynamic, para que `db reset` no dependa de un archivo en la laptop de nadie

**Fecha:** 2026-09-12
**Estado:** Construido y verificado — `npx supabase db reset` corre limpio de punta a
punta y la identidad resuelve igual que en producción.
**Afecta:** `supabase/0000_local_stub_dynamic.sql.example` (nuevo, versionado),
`supabase/migrations/0000_local_stub_dynamic.sql` (generado localmente, sigue fuera de
git), `CONTRIBUTING.md` y `README.md` (paso de copia agregado al setup).

## Contexto

`0009_integracion_dynamic.sql` (el corte V1→V2 de hoy, `0af2f1b`) elimina
`retail.personas` y hace que las funciones de seguridad de retail
(`retail.fn_es_lider()`, `retail.fn_ubicacion_actual_persona()`) deleguen
directo en las funciones reales de Dynamic: `public.fn_rol_actual()` y
`public.fn_sede_actual_persona()`. En producción esto funciona porque retail y
Dynamic viven en el mismo proyecto Supabase — mismo `public`, mismo
`auth.users`.

En LOCAL no hay ningún Dynamic: cada Postgres local es su propio proyecto
aislado (ADR-0010), a propósito, para que nadie necesite dos stacks
enteros corriendo para poder trabajar. `supabase/seed.sql` ya lo sabía —
su comentario dice literalmente que `public.sedes`/`public.personas` son
"el STUB local de Dynamic (`0000_local_stub_dynamic.sql`, fuera de git)".
Y en efecto: `.gitignore` ya tenía una regla exacta para ese archivo, con
su propia razón escrita al lado —

> "Se queda fuera de git a propósito: así jamás puede colarse en un `git
> archive` ni en un copy/paste al SQL Editor de producción."

Razón real y correcta: `supabase/migrations/` es justo la carpeta que se
copia/pega al SQL Editor de producción (CLAUDE.md), y ahí `public.sedes`/
`public.personas` SÍ son las tablas reales de Dynamic — un `create or
replace function public.fn_rol_actual()` pegado por error sobreescribiría
en silencio la función real con esta versión simplificada.

Lo que la regla no resolvía era cómo llega ese archivo a existir en la
máquina de alguien la primera vez. No llegaba: verificado con `git show
origin/main:supabase/migrations`, el archivo simplemente no está en
ningún lado del repo, ni como archivo ni como plantilla. Cualquiera que
clone el repo hoy y corra `npx supabase start` ve caer el seed apenas
intenta `insert into public.sedes` — el entorno local, que es la razón de
ser de ADR-0010, queda roto para todos menos para quien lo haya escrito a
mano una vez y nunca lo haya compartido.

## Decisión

**DECIDÍ: agregar `supabase/0000_local_stub_dynamic.sql.example`, versionado,
fuera de `supabase/migrations/`** — mismo patrón que `apps/web/.env.example`
→ `.env.local`. El setup local pasa a incluir un paso más:

```bash
cp supabase/0000_local_stub_dynamic.sql.example supabase/migrations/0000_local_stub_dynamic.sql
```

Con esto la regla de `.gitignore` sigue vigente tal cual estaba — el
archivo real nunca se versiona — pero ahora hay algo real de donde
copiarlo, en vez de que cada quien tuviera que reconstruirlo mirando
`0009_integracion_dynamic.sql` a ciegas.

La plantilla imita — no replica — las cuatro cosas de Dynamic que retail realmente toca
(confirmado con grep sobre `supabase/migrations/000[1-9]*.sql` y `0010`,
no a ojo): las tablas `public.sedes`/`public.personas` con solo las
columnas que retail lee o inserta, y las dos funciones de seguridad,
copiadas cuerpo por cuerpo desde la producción real de cayla-dynamic
(`vovjyyiafkxteijimpuy`, verificado con `pg_get_functiondef` el
2026-09-12):

```sql
-- fn_rol_actual(): select rol from personas where auth_user_id = auth.uid() and estado = 'activo';
-- fn_sede_actual_persona(): select sede_base_id from personas where auth_user_id = auth.uid();
```

El enum `rol_usuario` (`integrante`, `supervisor_sede`, `lider_do`,
`admin`) también se copió exacto — es lo que `retail.fn_es_lider()`
compara, y un valor que faltara habría fallado en silencio, no con error.

`0000_` es a propósito: ordena antes que `0001_extensiones.sql`, así el
stub existe para cuando `0009_integracion_dynamic.sql` necesita
`public.sedes` para su `references`.

**DESCARTÉ: copiar la tabla `personas` completa de Dynamic.** Tiene ~40
columnas de planilla (`pin_hash` NOT NULL sin default,
`sueldo_base_legal`, `regimen_pension`...) que no le importan a retail y
que habrían roto el propio `insert` de `seed.sql`, que solo manda
`auth_user_id, nombres, apellidos, rol, sede_base_id`. Calzar el
comportamiento (las dos funciones) importa más que calzar cada columna de
una tabla que retail nunca lee entera.

**DESCARTÉ: levantar un stack local completo de `cayla-dynamic` junto al
de retail.** Es exactamente el problema que ADR-0010 ya resolvió una vez
—dos stacks de Supabase compitiendo en la misma máquina fue la causa
original de que el entorno local no existiera— y typechecking/RLS de
Dynamic no le agregan nada a poder probar retail.

**SE ROMPE SI:** Dynamic le agrega una columna `NOT NULL` sin default a
`sedes`/`personas` que retail empiece a leer, o le cambia un valor al enum
`rol_usuario`. Ese día hay que volver a mirar la producción real, no
adivinar — el mismo criterio que ya usa este archivo.

## Verificación (no "debería funcionar")

Contra Postgres local, con el `cayla-retail` project_id compartido de
`supabase/config.toml`:

```
$ npx supabase db reset
Applying migration 0000_local_stub_dynamic.sql...
Applying migration 0001_extensiones.sql...
...
Applying migration 0010_facturacion.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch main.
```

Sin errores — incluido el bloque de `seed.sql` que llama a
`retail.recibir_lote`/`retail.registrar_venta`/etc. bajo `set local
request.jwt.claim.sub`, que habría fallado si la cadena de identidad no
resolviera bien.

Confirmado además por consulta directa, simulando la sesión de Felipe
igual que hace el propio seed:

| `fn_rol_actual()` | `fn_sede_actual_persona()` | `retail.fn_es_lider()` |
|---|---|---|
| `admin` | (uuid real de Tienda LIM) | `t` |

## Cómo se revierte

Borrar `supabase/0000_local_stub_dynamic.sql.example`. Quien no lo haya
copiado todavía vuelve al estado de antes de este ADR (seed roto); quien
ya tenga el archivo local generado no pierde nada, porque sigue fuera de
git como siempre.
