---
paths:
  - "supabase/**"
  - "scripts/**/*.sql"
  - "scripts/migraciones/**"
---

## Cómo aplicar SQL a producción (crítico desde la unificación con Dynamic, jul-2026)

**Producción de retail NO vive en su propio proyecto Supabase — vive DENTRO del
proyecto de cayla-dynamic, en un schema llamado `retail`.** Verificado 2026-09-03:
`select schema_name from information_schema.schemata where schema_name = 'retail'`
devuelve la fila. **Esa cifra envejece rápido — no la repitas de memoria.** El
2026-09-12 eran 45 tablas y 2 vistas; el 2026-09-25, preguntándole a la base en vivo,
ya eran 117 tablas y 6 vistas (`docs/datos/generado/` seguía en 99 porque es del
09-23: hasta el volcado se atrasa). Si necesitas la cifra, pregúntale a la base con un
`select` de solo lectura; `docs/datos/generado/DICCIONARIO-RETAIL.md` es tan fresco como
su último volcado (`pnpm datos:generar:produccion` lo reescribe desde el volcado
guardado, no desde la base: ver `docs/datos/generado/COMO-REFRESCAR.md`). (Históricamente eran ~22 según la
unificación original — las migraciones de producción `0024`-`0029`, posteriores,
sumaron tablas propias). `NEXT_PUBLIC_SUPABASE_URL` de producción apunta al
proyecto de Dynamic, no al proyecto original de retail.

**Toda migración que pegues en el SQL Editor de producción necesita el prefijo
`retail.` en cada tabla** (o un `set search_path to retail, public;` al principio
del script). Sin eso, el SQL Editor busca en `public` por defecto — y en el
proyecto Dynamic, `public` es el schema de Dynamic, no el de retail. El síntoma es
`relation "..." does not exist` (42P01), y parece que la tabla no existiera cuando
en realidad solo se está mirando el cajón equivocado.

Le pasó a la primera migración pegada en producción después de la unificación
(`0030`, 2026-09-03) — costó un round-trip de error antes de corregirlo. Esa
convención de escribir las migraciones sin prefijo **ya no aplica**: desde el corte
V1→V2 (2026-09-12, `0af2f1b`) las migraciones crean todo directamente en el schema
`retail`, igual que producción (antes, el local migraba en `public` y `seed.sql`
renombraba el schema después: ADR-0010). Por eso todas las migraciones del repo
(salvo las de extensiones y permisos, que no nombran tablas) llevan el prefijo
`retail.` — o un `set search_path = retail, public, extensions;` al inicio — escrito
directamente en el archivo, y se pegan en producción sin tocarlas (respetando la
regla de partes de «Políticas y deadlocks», más abajo). Confiar en «se escriben sin
prefijo» ya rompió una migración real: sin él, el piloto «Pruebas de RPC contra
Postgres» la rechazó con `relation "variantes" does not exist` (PR #345 → #346,
2026-09-23). Escribe el prefijo `retail.` en cada tabla y función, o el `set
search_path` al inicio: es lo que corre igual en local, en CI y en producción.

**Políticas y deadlocks (aprendido 2026-09-24, ADR-0195):** el SQL Editor corre todo lo pegado en UNA transacción, y en
Supabase cada `create policy` —y hasta un `drop policy if exists` vacío— toma en exclusiva las 21 tablas de `auth` y
`storage` hasta el final. **Lo mismo hace `drop trigger` (aunque el disparador no exista; medido el 2026-09-24):**
usa `create or replace trigger`, nunca `drop trigger` + `create trigger`. `drop function`, `drop index`, `drop view`,
`create trigger` y `alter` NO los toman. Si la misma transacción ya tiene en exclusiva una tabla que la tienda usa (un
`alter table ubicaciones`), choca con el Asesor de seguridad del panel: `40P01 deadlock detected`, y no se aplica nada. Regla: una
migración de producción **no mezcla** `alter` de tablas en uso con políticas. Pártela en PARTES que se pegan por
separado (cada una con `set lock_timeout = '3s'`, idempotente), con las políticas solas y al final. Si la tabla nueva
solo se lee por funciones `security definer`, deja RLS encendido sin políticas. Ejemplo:
`supabase/migrations/20260924210000_configuracion_meta_y_fondo_por_campana.sql`. **Lo mide el CI (2026-11-23):** la tanda 1
corre cada migración nueva del PR en `begin … rollback`, lee `pg_locks` después de cada sentencia y pone rojo una parte que
mezcla (`scripts/migraciones/partes-sin-deadlock.mjs`). Cada parte empieza en una línea `-- ===== PARTE N · … =====`; sin
marcas, el archivo es una sola parte. En local: `pnpm migraciones:partes-sin-deadlock <archivo>`.

**El SQL Editor agrega líneas por su cuenta (aprendido 2026-09-30, ADR-0288):** si ve `select … into <nombre>` en el texto
pegado, lo toma por un `SELECT INTO` que crea una tabla y agrega al final `alter table <nombre> enable row level security`.
Dentro de un cuerpo `$$ … $$` no lo mira, pero sí dentro de un texto entre comillas simples, como el que un reemplazo
anclado (`pg_temp.reemplazar_*`) le inserta a una función viva. El pegado falla con `42P01 relation "<nombre>" does not exist`
y no se aplica nada, porque todo va en una transacción. Regla: dentro de un texto entre comillas, nunca `select … into`;
lee la fila con `for v_a, v_b in select … loop exit; end loop;` (o una asignación `v := (select …)`). Si un pegado falla
raro, el log de Postgres (`query_logs`, `source = 'postgres_logs'`) muestra el texto que Supabase ejecutó de verdad.
