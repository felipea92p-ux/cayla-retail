#!/usr/bin/env bash
# ============================================================================
# traer-produccion.sh — baja una copia de la base de PRODUCCIÓN (el proyecto
# Supabase de cayla-dynamic, donde vive el schema `retail` de las tiendas) y la
# restaura en un Supabase LOCAL de esta máquina.
#
# Reemplaza a restore-cayla-v1.sh, que restauraba desde un archivo suelto en
# `backups/` que ya no existe. Acá el dump se pide a producción en el momento,
# así que la copia siempre es de hoy y no de un archivo que nadie sabe de cuándo es.
#
# LO QUE HEREDA DE restore-cayla-v1.sh (aprendido rompiendo la base a propósito
# el 2026-09-11 — no lo vuelvas a descubrir por las malas):
#   1. `postgres` NO es superuser en el Postgres de Supabase (rolsuper=f). El dueño
#      real de auth.* es `supabase_auth_admin` y el superuser es `supabase_admin`.
#      Restaurar como `postgres` revienta con "must be owner of ...".
#   2. `pg_restore --schema=retail` NO ejecuta el CREATE SCHEMA ni el GRANT USAGE
#      del schema — esas entradas no cuentan como "dentro" del schema filtrado.
#      Por eso el schema se crea a mano antes y el USAGE se otorga a mano después.
#   3. `retail.personas.auth_user_id` referencia `auth.users.id`. El orden es
#      SIEMPRE auth primero, retail después — nunca al revés.
#
# LO QUE AGREGA:
#   - pg_dump corre DENTRO del contenedor local (17.6), que es la misma versión
#     que producción (17.6). No hace falta Postgres instalado en el Mac.
#   - Nunca escribe en producción: el dump es de solo lectura y toda la escritura
#     va contra el contenedor local, verificado por puerto y nombre antes de tocar nada.
#   - La contraseña viaja en PROD_DB_URL y no se imprime nunca.
#
# USO
#   PROD_DB_URL='postgresql://postgres.<ref>:<password>@<host-pooler>:5432/postgres' \
#     bash scripts/local/traer-produccion.sh [--destino retail|dynamic]
#
#   La URL se saca del dashboard de Supabase del proyecto `cayla-dynamic`:
#   Project Settings → Database → Connection string → URI (Session pooler, puerto 5432;
#   el pooler de transacciones, 6543, NO sirve para pg_dump).
#
#   --destino dynamic  (por defecto) → stack local `cayla-dynamic`, API 54321 / DB 54322.
#                       Es la copia fiel de producción: un solo proyecto con `public`
#                       (Dynamic) y `retail` (tiendas), igual que allá.
#   --destino retail   → stack local `cayla-retail`, API 54421 / DB 54422. OJO: pisa el
#                       `retail` de V2 que se está construyendo. Se recupera con
#                       `npx supabase db reset`, pero mientras tanto V2 local no existe.
# ============================================================================
set -euo pipefail

DESTINO="dynamic"
while [ $# -gt 0 ]; do
  case "$1" in
    --destino) DESTINO="${2:-}"; shift 2 ;;
    *) echo "✗ Argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

case "$DESTINO" in
  dynamic) CONTAINER="supabase_db_cayla-dynamic"; ESPERADO_DB_PORT="54322" ;;
  retail)  CONTAINER="supabase_db_cayla-retail";  ESPERADO_DB_PORT="54422" ;;
  *) echo "✗ --destino debe ser 'dynamic' o 'retail', no '$DESTINO'." >&2; exit 1 ;;
esac

ADMIN_ROLE="supabase_admin"

echo "=========================================================="
echo " Traer PRODUCCIÓN → Supabase LOCAL (destino: $DESTINO)"
echo "=========================================================="

# ---------- 1) la URL de producción ----------
if [ -z "${PROD_DB_URL:-}" ]; then
  echo "✗ Falta PROD_DB_URL. Sácala del dashboard de Supabase del proyecto"      >&2
  echo "  'cayla-dynamic': Project Settings → Database → Connection string →"    >&2
  echo "  URI, Session pooler (puerto 5432). Ejemplo:"                           >&2
  echo "    PROD_DB_URL='postgresql://postgres.xxxx:CLAVE@aws-N-sa-east-1.pooler.supabase.com:5432/postgres' \\" >&2
  echo "      bash scripts/local/traer-produccion.sh"                            >&2
  exit 1
fi

# ---------- 2) freno duro contra remoto: el destino tiene que ser local ----------
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ El contenedor '$CONTAINER' no está corriendo. Levanta ese stack primero. Aborta." >&2
  exit 1
fi
DB_PORT_REAL="$(docker port "$CONTAINER" 5432/tcp | head -1 | sed 's/.*://')"
if [ "$DB_PORT_REAL" != "$ESPERADO_DB_PORT" ]; then
  echo "✗ El contenedor expone el puerto $DB_PORT_REAL, se esperaba $ESPERADO_DB_PORT. Aborta por seguridad." >&2
  exit 1
fi
echo "✓ Destino verificado: contenedor local '$CONTAINER', puerto $DB_PORT_REAL"

# ---------- 3) foto de lo que se va a pisar ----------
ANTES="$(docker exec "$CONTAINER" psql -U postgres -d postgres -t -A -c \
  "select coalesce((select count(*) from information_schema.tables where table_schema='retail' and table_type='BASE TABLE'),0);" 2>/dev/null || echo '?')"
echo "  Hoy ese destino tiene $ANTES tabla(s) en el schema 'retail' — se van a reemplazar."

echo
echo "Esto BORRA y RECONSTRUYE el schema 'retail' completo del Supabase LOCAL de"
echo "arriba, con lo que haya en producción ahora mismo. También suma a auth.users"
echo "los usuarios reales (no borra los locales que ya existan)."
echo "NO toca producción: de allá solo se lee."
echo
read -r -p "Escribe exactamente TRAER PRODUCCION para continuar: " CONFIRMACION
if [ "$CONFIRMACION" != "TRAER PRODUCCION" ]; then
  echo "Cancelado — no coincide. No se tocó nada."
  exit 1
fi

# ---------- 4) el dump, desde adentro del contenedor (pg_dump 17.6 = prod 17.6) ----------
# Dos dumps separados y no uno solo, porque de `auth` se quieren SOLO los datos de
# dos tablas (la estructura ya la puso `supabase start` y es intocable), mientras que
# de `retail` se quiere todo: tablas, funciones, policies y datos.
echo
echo "Pidiendo la foto a producción (esto tarda; es red a São Paulo)..."
docker exec -e PGURL="$PROD_DB_URL" "$CONTAINER" bash -c '
  set -euo pipefail
  pg_dump "$PGURL" --format=custom --schema=auth --data-only \
    --table=auth.users --table=auth.identities --file=/tmp/prod_auth.dump
  pg_dump "$PGURL" --format=custom --schema=retail --no-owner --no-privileges \
    --file=/tmp/prod_retail.dump
'
echo "✓ Dump recibido:"
docker exec "$CONTAINER" bash -c 'ls -lh /tmp/prod_auth.dump /tmp/prod_retail.dump | awk "{print \"    \" \$9 \"  \" \$5}"'

# ---------- 5) auth PRIMERO (ver nota 3 de la cabecera) ----------
echo
echo "Restaurando datos de Auth (auth.users, auth.identities)..."
docker exec "$CONTAINER" pg_restore -U "$ADMIN_ROLE" -d postgres \
  --data-only --disable-triggers /tmp/prod_auth.dump 2>&1 | grep -v "already exists" || true
# ^ "already exists" acá es benigno: significa que ese usuario ya estaba local.

# ---------- 6) retail DESPUÉS: dropear, recrear vacío, restaurar, otorgar ----------
echo
echo "Restaurando schema 'retail' (tablas, funciones, policies, datos)..."
docker exec "$CONTAINER" psql -U "$ADMIN_ROLE" -d postgres -c "drop schema if exists retail cascade;"
docker exec "$CONTAINER" psql -U "$ADMIN_ROLE" -d postgres -c "create schema retail;"
docker exec "$CONTAINER" pg_restore -U "$ADMIN_ROLE" -d postgres \
  --schema=retail --no-owner /tmp/prod_retail.dump || {
    echo "✗ pg_restore reportó errores en 'retail' — revisa el detalle arriba antes de" >&2
    echo "  confiar en esta copia." >&2
    docker exec "$CONTAINER" rm -f /tmp/prod_auth.dump /tmp/prod_retail.dump
    exit 1
  }
docker exec "$CONTAINER" psql -U "$ADMIN_ROLE" -d postgres -c \
  "grant usage on schema retail to authenticated, service_role, anon;"
docker exec "$CONTAINER" rm -f /tmp/prod_auth.dump /tmp/prod_retail.dump

# ---------- 7) comprobación ----------
echo
echo "Verificando..."
read -r TABLAS VISTAS FUNCIONES POLICIES PERSONAS USUARIOS COINCIDEN < <(docker exec -i "$CONTAINER" psql -U postgres -d postgres -t -A -F' ' <<'SQL'
select
  (select count(*) from information_schema.tables where table_schema='retail' and table_type='BASE TABLE'),
  (select count(*) from information_schema.views where table_schema='retail'),
  (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='retail'),
  (select count(*) from pg_policies where schemaname='retail'),
  (select count(*) from retail.personas),
  (select count(*) from auth.users),
  (exists(select 1 from retail.personas p join auth.users u on u.id = p.auth_user_id))::int;
SQL
)

echo "  tablas en retail:              $TABLAS   (producción tenía 45 el 2026-09-12)"
echo "  vistas en retail:              $VISTAS   (producción tenía 2)"
echo "  funciones en retail:           $FUNCIONES"
echo "  policies RLS en retail:        $POLICIES"
echo "  personas:                      $PERSONAS"
echo "  usuarios en auth:              $USUARIOS"
echo "  personas.auth_user_id coincide con algún auth.users.id: $([ "$COINCIDEN" = "1" ] && echo sí || echo NO)"

if [ "$TABLAS" -lt 1 ] || [ "$FUNCIONES" -lt 1 ] || [ "$USUARIOS" -lt 1 ] || [ "$COINCIDEN" != "1" ]; then
  echo "✗ Algo no cuadra — la copia no se ve completa ni consistente. Revísala antes de darla por buena." >&2
  exit 1
fi

echo
echo "✓ Copia de producción lista en el stack local '$DESTINO'."
if [ "$DESTINO" = "dynamic" ]; then
  echo "  Para que la app le hable, apunta apps/web/.env.local a http://127.0.0.1:54321"
  echo "  (hoy apunta a 54421, que es V2). Confírmalo con 'pnpm local:donde'."
else
  echo "  La app ya apunta acá (54421). Para volver a V2: 'npx supabase db reset'."
fi
echo "  Y refresca el diccionario si el esquema cambió: 'pnpm datos:generar'."
