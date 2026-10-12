#!/usr/bin/env bash
# Comprueba en producción el SQL de un PR que marcó «SQL pegado en producción» (ADR-0251, actualización 2026-10-12). Lo
# corre `.github/workflows/sql-pegado.yml` después de `sql-pegado.mjs`:
#   1. espera las huellas que deja el CI de ESTE commit (artefacto `huellas-del-pr`, de `huellas-del-pr.mjs`): salen apenas
#      la base del CI está arriba, sin esperar las pruebas;
#   2. le pide a producción las suyas con la llave de la deriva (`retail.huellas_catalogo`, la misma de la revisión diaria);
#   3. las compara con `sql-en-produccion.mjs`, que dice por archivo si está pegado y nunca qué objeto falta (repo público).
# Si algo no se pudo mirar (falta la configuración, el CI no dejó huellas, producción no respondió), sale en rojo diciendo
# qué: un check verde siempre quiere decir «miré y está».
#
# Variables: REPO, SHA (la cabeza del PR), NUEVAS (lo que escribió sql-pegado.mjs), URL, ANON, LLAVE (las de la deriva
# diaria) y GH_TOKEN. ESPERA_MAX y PAUSA (segundos) solo las cambia la prueba.
set -uo pipefail

TMP="${RUNNER_TEMP:-$(mktemp -d)}/sql-en-produccion"
ESPERA_MAX="${ESPERA_MAX:-1200}"
PAUSA="${PAUSA:-20}"
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$TMP"

falla() {
  echo "::error::$1"
  exit 1
}

if [ -z "${URL:-}" ] || [ -z "${ANON:-}" ] || [ -z "${LLAVE:-}" ]; then
  falla "Falta configurar la variable SUPABASE_URL, la variable SUPABASE_ANON_KEY o el secreto DERIVA_LLAVE (los de la deriva diaria, ADR-0251): sin ellos no se puede mirar producción."
fi

# 1. Las huellas del CI de este commit. La corrida más nueva del workflow «CI» para esta cabeza del PR.
inicio=$(date +%s)
artefacto=""
while :; do
  corrida=$(gh api "repos/$REPO/actions/runs?head_sha=$SHA&event=pull_request&per_page=30" \
    --jq '[.workflow_runs[] | select(.name == "CI")] | max_by(.run_number) // empty | "\(.id) \(.status)"' 2>/dev/null) || corrida=""
  if [ -n "$corrida" ]; then
    read -r id estado <<<"$corrida"
    artefacto=$(gh api "repos/$REPO/actions/runs/$id/artifacts" \
      --jq '[.artifacts[] | select(.name == "huellas-del-pr" and (.expired | not)) | .id] | first // empty' 2>/dev/null) || artefacto=""
    [ -n "$artefacto" ] && break
    if [ "$estado" = "completed" ]; then
      falla "El CI de este commit terminó sin dejar las huellas del PR: mira «Pruebas de RPC contra Postgres» (¿una migración no se aplicó, o no se pudieron tomar huellas?). Con el CI en verde, vuelve a correr este check."
    fi
  fi
  if [ $(($(date +%s) - inicio)) -ge "$ESPERA_MAX" ]; then
    falla "Pasaron $((ESPERA_MAX / 60)) minutos y el CI de este commit todavía no deja sus huellas. Cuando «Pruebas de RPC contra Postgres» arranque, vuelve a correr este check."
  fi
  echo "Esperando las huellas del CI de este commit…"
  sleep "$PAUSA"
done

rm -rf "$TMP/pr" && mkdir -p "$TMP/pr"
gh api "repos/$REPO/actions/artifacts/$artefacto/zip" >"$TMP/huellas.zip" || falla "No se pudo bajar el artefacto huellas-del-pr."
unzip -o -q "$TMP/huellas.zip" -d "$TMP/pr" || falla "El artefacto huellas-del-pr no es un zip legible."

# 2. Producción, con la llave de la deriva. No se imprime la respuesta: puede traer la pista de por qué rechazó la llave.
cuerpo=$(jq -n --arg l "$LLAVE" '{p_llave: $l}')
codigo=$(curl -sS -o "$TMP/produccion.json" -w '%{http_code}' --max-time 90 -X POST "$URL/rest/v1/rpc/huellas_catalogo" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -H "Content-Profile: retail" \
  --data "$cuerpo") || codigo="sin respuesta"
if [ "$codigo" != "200" ]; then
  falla "No se pudo leer producción (HTTP $codigo). Si es 401/403, la llave de la deriva no coincide: vuelve a crearla y a guardarla."
fi
jq -r . "$TMP/produccion.json" >"$TMP/produccion.tsv" || falla "Producción respondió algo que no son huellas."

# 3. Comparar. 0 = todo pegado, 1 = falta algo, 2 = no se pudo comparar: los dos últimos dejan el check en rojo.
node "$AQUI/sql-en-produccion.mjs" "$TMP/pr/huellas-del-pr.json" "$TMP/produccion.tsv" "${NUEVAS:-/dev/null}"
