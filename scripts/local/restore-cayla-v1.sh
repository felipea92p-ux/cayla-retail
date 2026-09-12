#!/usr/bin/env bash
# ============================================================================
# restore-cayla-v1.sh — restaura CAYLA V1 (schema `retail` + Auth local)
# desde backups/cayla-v1/dump/full-database.dump, contra Supabase LOCAL.
#
# PROCEDIMIENTO VERIFICADO EN VIVO el 2026-09-11 (no es teórico): se probó
# rompiendo a propósito la base local (DROP SCHEMA retail CASCADE +
# borrado de auth.users) y ejecutando esta misma secuencia hasta confirmar,
# con la app real corriendo, un login exitoso y las pantallas cargando
# datos reales. En el camino aparecieron 3 problemas reales que este script
# ya resuelve — no los repitas si editas esto:
#
#   1. `postgres` NO es superuser en este Postgres de Supabase (rolsuper=f).
#      El dueño real de auth.* es `supabase_auth_admin`, y el superuser de
#      verdad es `supabase_admin`. Restaurar como `postgres` revienta con
#      "must be owner of ...". Por eso todo corre como `supabase_admin`.
#   2. `pg_restore --schema=retail` NO ejecuta el "CREATE SCHEMA retail" ni
#      el GRANT USAGE a nivel de schema — esas entradas del dump no se
#      consideran "dentro" del schema que filtra. Por eso el schema se crea
#      A MANO antes de restaurar, y el USAGE se otorga A MANO después.
#   3. `retail.personas.auth_user_id` referencia `auth.users.id`. Si algún
#      día se restaura auth DESPUÉS de retail y de paso se borra algo en
#      auth.users, se puede llevar personas por delante en cascada. Por eso
#      acá el orden es: primero auth, después retail — nunca al revés.
#
# QUÉ NO HACE: no toca producción, no toca nada remoto — se niega a correr
# si detecta que el destino no es el Postgres local de este proyecto.
# ============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DUMP_FILE="$REPO_ROOT/backups/cayla-v1/dump/full-database.dump"
CONTAINER="supabase_db_cayla-retail"
ESPERADO_PROJECT_ID="cayla-retail"
ESPERADO_DB_PORT="54422"
ADMIN_ROLE="supabase_admin"

echo "=========================================================="
echo " Restauración de CAYLA V1 — SOLO Supabase LOCAL"
echo "=========================================================="

# ---------- 1) el backup existe ----------
if [ ! -f "$DUMP_FILE" ]; then
  echo "✗ No existe $DUMP_FILE — nada que restaurar. Aborta." >&2
  exit 1
fi
echo "✓ Backup encontrado: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# ---------- 2) freno duro contra remoto ----------
PROJECT_ID_ACTUAL="$(grep -m1 '^project_id' "$REPO_ROOT/supabase/config.toml" | sed -E 's/project_id *= *"(.*)"/\1/')"
if [ "$PROJECT_ID_ACTUAL" != "$ESPERADO_PROJECT_ID" ]; then
  echo "✗ project_id en config.toml es '$PROJECT_ID_ACTUAL', se esperaba '$ESPERADO_PROJECT_ID'. Aborta." >&2
  exit 1
fi
if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "✗ El contenedor '$CONTAINER' no está corriendo. Corre 'npx supabase start' primero. Aborta." >&2
  exit 1
fi
DB_PORT_REAL="$(docker port "$CONTAINER" 5432/tcp | cut -d: -f2)"
if [ "$DB_PORT_REAL" != "$ESPERADO_DB_PORT" ]; then
  echo "✗ El contenedor expone el puerto $DB_PORT_REAL, se esperaba $ESPERADO_DB_PORT. Aborta por seguridad." >&2
  exit 1
fi
echo "✓ Destino verificado: contenedor local '$CONTAINER', puerto $DB_PORT_REAL, project_id '$PROJECT_ID_ACTUAL'"

# ---------- 3) confirmación explícita ----------
echo
echo "Esto va a BORRAR y RECONSTRUIR el schema 'retail' completo y los"
echo "datos de auth.users/auth.identities de tu Supabase LOCAL, con el"
echo "contenido de:"
echo "  $DUMP_FILE"
echo
echo "No toca producción ni ningún proyecto remoto — ya verificado arriba."
echo
read -r -p "Escribe exactamente RESTAURAR V1 para continuar: " CONFIRMACION
if [ "$CONFIRMACION" != "RESTAURAR V1" ]; then
  echo "Cancelado — no coincide. No se tocó nada."
  exit 1
fi

docker cp "$DUMP_FILE" "$CONTAINER:/tmp/restore.dump"

# ---------- 4) auth PRIMERO (datos, nunca estructura — esa ya la puso `supabase start`) ----------
echo
echo "Restaurando datos de Auth (auth.users, auth.identities)..."
docker exec "$CONTAINER" pg_restore -U "$ADMIN_ROLE" -d postgres \
  --schema=auth --data-only --disable-triggers --data-only \
  --table=users --table=identities \
  /tmp/restore.dump 2>&1 | grep -v "already exists" || true
# ^ "already exists" acá es esperable y benigno si ya había un usuario con
#   el mismo id (ej. sembrado por seed.sql en un `supabase start` reciente)
#   — no es un fallo real, por eso se filtra en vez de dejar que rompa el
#   script con `set -e`.

# ---------- 5) retail DESPUÉS: dropear, recrear vacío, restaurar, otorgar ----------
echo
echo "Restaurando schema 'retail' (tablas, funciones, policies, datos)..."
docker exec "$CONTAINER" psql -U "$ADMIN_ROLE" -d postgres -c "drop schema if exists retail cascade;"
docker exec "$CONTAINER" psql -U "$ADMIN_ROLE" -d postgres -c "create schema retail;"
docker exec "$CONTAINER" pg_restore -U "$ADMIN_ROLE" -d postgres \
  --schema=retail --no-owner \
  /tmp/restore.dump || {
    echo "✗ pg_restore reportó errores en 'retail' — revisa el detalle arriba antes de confiar en la restauración." >&2
    docker exec "$CONTAINER" rm -f /tmp/restore.dump
    exit 1
  }
docker exec "$CONTAINER" psql -U "$ADMIN_ROLE" -d postgres -c \
  "grant usage on schema retail to authenticated, service_role, anon;"
docker exec "$CONTAINER" rm -f /tmp/restore.dump

# ---------- 6) comprobación ----------
echo
echo "Verificando..."
read -r TABLAS FUNCIONES POLICIES PERSONAS USUARIOS COINCIDEN < <(docker exec -i "$CONTAINER" psql -U postgres -d postgres -t -A -F' ' <<'SQL'
select
  (select count(*) from information_schema.tables where table_schema='retail' and table_type='BASE TABLE'),
  (select count(distinct proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='retail'),
  (select count(*) from pg_policies where schemaname='retail'),
  (select count(*) from retail.personas),
  (select count(*) from auth.users),
  (exists(select 1 from retail.personas p join auth.users u on u.id = p.auth_user_id))::int;
SQL
)

echo "  tablas en retail:              $TABLAS"
echo "  funciones en retail:           $FUNCIONES"
echo "  policies RLS en retail:        $POLICIES"
echo "  personas:                      $PERSONAS"
echo "  usuarios en auth:               $USUARIOS"
echo "  personas.auth_user_id coincide con algún auth.users.id: $([ "$COINCIDEN" = "1" ] && echo sí || echo NO)"

if [ "$TABLAS" -lt 1 ] || [ "$FUNCIONES" -lt 1 ] || [ "$USUARIOS" -lt 1 ] || [ "$COINCIDEN" != "1" ]; then
  echo "✗ Algo no cuadra — la restauración no se ve completa o consistente. Revisa antes de dar por buena la recuperación." >&2
  exit 1
fi

echo
echo "✓ CAYLA V1 restaurada y consistente. Corre 'pnpm dev' y entra a"
echo "  http://localhost:3000/login con el usuario local que documenta README.md."
