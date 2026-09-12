# ADR-0034 — Las migraciones nuevas nacen con timestamp, no con "el próximo número a ojo"

**Fecha:** 2026-09-12
**Estado:** Decidido con Felipe. Aplica desde la primera migración que se
escriba después de `0010_facturacion.sql` — no toca ninguna de las
existentes.
**Afecta:** convención de nombres en `supabase/migrations/` de ahora en
adelante.

## Contexto

Antes del corte V1→V2, el repo chocó números de migración en vivo, dos
veces: dos sesiones en paralelo escribieron cada una un `0054`, y el merge
que las juntó se quedó con las dos — `db reset` murió con
`schema_migrations_pkey` (Postgres/Supabase no aceptan dos migraciones con
la misma versión). Se resolvió a mano, renumerando contra `origin/main` en
el momento de fusionar. Volvió a pasar hoy mismo, más chico: `ad8f37d`
renumera `0057`→`0059` porque `main` ya había usado esos números. El
patrón es siempre el mismo — "elegir el próximo número libre" solo
funciona si nadie más lo está eligiendo al mismo tiempo, y en un repo con
5 personas con push a `main` (ver auditoría de GitHub, 2026-09-12) eso ya
no es cierto casi nunca.

## Decisión

**DECIDÍ: toda migración nueva se crea con `npx supabase migration new
<nombre>`**, que le pone de nombre un timestamp (`YYYYMMDDHHmmss_nombre.sql`)
en vez de que la persona elija el próximo número de 4 dígitos a mano. Dos
personas nunca generan el mismo timestamp al mismo segundo — el choque
queda estructuralmente imposible, no solo "revisado a tiempo antes de
mergear". Es el mismo argumento del principio 2 de CLAUDE.md aplicado al
propio proceso: si un estado inconsistente es posible, se corrige el
diseño, no se parcha con una convención que depende de que alguien se
acuerde de revisar.

Supabase aplica las migraciones en orden lexicográfico del nombre de
archivo — verificado con `npx supabase db reset` hoy mismo, que además
reveló algo que hay que tener presente con cualquier convención de
nombres: **el CLI exige el patrón `<timestamp>_nombre.sql` y salta en
silencio cualquier archivo que no calce** (`benja-migracion.sql` y
`datos-reales-produccion.sql` se saltearon así, con solo un aviso en el
log, sin fallar el `reset`). Un timestamp de 14 dígitos ordena después de
cualquier `NNNN_` de 4 dígitos existente, así que no hace falta tocar
`0001`-`0010`: siguen corriendo primero, tal cual están.

**DESCARTÉ: mantener secuencial y solo formalizar por escrito la regla de
renumerar-al-fusionar.** Es la salida más chica, y es la que el repo ya
venía aplicando a mano dos veces — pero seguía siendo una disciplina, no
un diseño: depende de que alguien se acuerde de correr `db reset` contra
`origin/main` justo antes de abrir el PR. Con 5 personas y `main` moviéndose
varias veces por hora (como pasó en vivo mientras se escribía este ADR:
`0af2f1b` → `b93ffee` en menos de una hora), confiar en que alguien se
acuerde es exactamente el tipo de validación after-the-fact que el
principio 2 prohíbe para el esquema, y no hay razón para tratarlo distinto
acá.

**NO decide nada sobre `supabase/unificacion/`.** Esa carpeta es el
registro de qué se pegó a mano en el SQL Editor de producción, numerada
del `01` al `35` — y con el corte V1→V2, cómo se despliega a producción de
ahora en adelante es algo que el propio corte todavía está resolviendo
(el mensaje de `0af2f1b` dice que hace falta correr las migraciones
nuevas contra el proyecto real, sin mencionar un `unificacion/36`). Ese es
un ADR de quien esté cerrando esa fase, no de este.

## Cómo se aplica

```bash
npx supabase migration new nombre_descriptivo
```

genera `supabase/migrations/20260912193000_nombre_descriptivo.sql` (el
timestamp real de cuándo se corre el comando). Se escribe el SQL adentro
igual que siempre — sin el prefijo `retail.` (CLAUDE.md), para que corra
limpio contra el Postgres local.

## Se rompe si

Dos personas corren el comando en el mismo segundo Y ambas migraciones
tocan el mismo objeto — el nombre de archivo ya no choca, pero el
contenido SQL sí puede seguir chocando (dos `alter table` incompatibles,
por ejemplo). Esto no lo resuelve ningún esquema de nombres: lo sigue
resolviendo `db reset` contra `origin/main` antes de mergear, como
gate de CI (pendiente — ver conversación del 2026-09-12 sobre branch
protection).
