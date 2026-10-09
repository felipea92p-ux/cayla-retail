#!/bin/sh
# Ayudante de impresión de etiquetas CAYLA para Mac (ADR-0304).
#
# Por qué existe: Chrome en Mac le manda a la Brother el papel girado a vertical (40,1 × 62) sin importar qué papel
# se elija, y la Brother imprime 40 mm a lo ancho del rollo en vez de 62. Este ayudante se salta ese camino: recibe el
# HTML de las etiquetas desde la pantalla «Etiquetas de precio», lo convierte en PDF con el MISMO Chrome (sin ventana,
# mismo motor y mismas reglas de `@page` que ya usa Windows) y lo manda a la Brother con el tamaño exacto de 62 × 40,1 mm.
#
# Cómo corre: launchd lo arranca por cada conexión (inetdCompatibility): stdin y stdout SON el socket, solo escucha en
# 127.0.0.1. No hay proceso encendido todo el día ni dependencias: solo /bin/sh, lp y Chrome.
#
# Seguridad: solo acepta POST de las pantallas de CAYLA (cabecera Origin) y a nombre de localhost (Host); el HTML se
# imprime con JavaScript apagado y un perfil de Chrome desechable, y pesa 2 MB como máximo.

export PATH="/usr/bin:/bin:/usr/sbin:/sbin"
export LC_ALL=C

# 2 (2026-10-09): acepta `?medida=` para los rótulos de anaquel (62 × 100 mm). Una pantalla que la necesita pide la 2.
VERSION=2
DIR="${CAYLA_ETIQUETAS_DIR:-$HOME/Library/Application Support/CAYLA/etiquetas}"
LP="${CAYLA_LP:-lp}"
MAX_BYTES=2097152
# Medida del corte: ancho del rollo × largo de cada etiqueta (ADR-0180). `CAYLA_MEDIA` solo la pisan las pruebas.
MEDIA="${CAYLA_MEDIA:-Custom.62x40.1mm}"
# Las otras medidas que una pantalla puede pedir con `POST /imprimir?medida=…`: SOLO estas, escritas aquí (nunca se pasa a
# `lp` un texto que venga de la petición). 62x100mm = el rótulo de anaquel (ADR-0365).
medida_permitida() {
  case "$1" in
    62x40.1mm | 62x100mm) return 0 ;;
  esac
  return 1
}

CR=$(printf '\r')

origen_permitido() {
  case "$1" in
    https://cayla-retail.vercel.app | http://localhost:3000 | http://localhost:3010 | http://127.0.0.1:3000) return 0 ;;
  esac
  [ -f "$DIR/origenes.txt" ] && grep -qxF "$1" "$DIR/origenes.txt"
}

host_permitido() {
  case "$1" in
    127.0.0.1 | 127.0.0.1:* | localhost | localhost:*) return 0 ;;
  esac
  return 1
}

# JSON mínimo: los mensajes son texto plano sin comillas ni saltos de línea.
responder() { # $1 = "200 OK", $2 = cuerpo JSON
  printf 'HTTP/1.1 %s\r\n' "$1"
  if [ -n "$ORIGEN" ] && origen_permitido "$ORIGEN"; then
    printf 'Access-Control-Allow-Origin: %s\r\n' "$ORIGEN"
    printf 'Access-Control-Allow-Private-Network: true\r\n'
    printf 'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n'
    printf 'Access-Control-Allow-Headers: content-type\r\n'
    printf 'Access-Control-Max-Age: 600\r\n'
    printf 'Vary: Origin\r\n'
  fi
  printf 'Content-Type: application/json\r\nCache-Control: no-store\r\nContent-Length: %s\r\nConnection: close\r\n\r\n%s' "${#2}" "$2"
}

buscar_chrome() {
  for c in \
    "${CAYLA_CHROME:-}" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

# La cola de la Brother: la que dice `$DIR/impresora` o, si no, la primera «Brother_QL…» que conozca la Mac.
buscar_cola() {
  if [ -s "$DIR/impresora" ]; then
    head -n 1 "$DIR/impresora"
    return 0
  fi
  lpstat -e 2>/dev/null | grep -i '^Brother_QL' | head -n 1
}

# ---- la petición ------------------------------------------------------------
IFS= read -r LINEA || exit 0
LINEA=${LINEA%"$CR"}
METODO=${LINEA%% *}
RESTO=${LINEA#* }
RUTA=${RESTO%% *}
CONSULTA=""
case "$RUTA" in *\?*) CONSULTA=${RUTA#*\?} RUTA=${RUTA%%\?*} ;; esac

LARGO=0
ORIGEN=""
HOST=""
while IFS= read -r CAB; do
  CAB=${CAB%"$CR"}
  [ -z "$CAB" ] && break
  NOMBRE=$(printf '%s' "${CAB%%:*}" | tr 'A-Z' 'a-z')
  VALOR=${CAB#*:}
  VALOR=${VALOR# }
  case "$NOMBRE" in
    content-length) LARGO=$VALOR ;;
    origin) ORIGEN=$VALOR ;;
    host) HOST=$VALOR ;;
  esac
done

if ! host_permitido "$HOST"; then
  responder "403 Forbidden" '{"ok":false,"error":"host no permitido"}'
  exit 0
fi

case "$LARGO" in '' | *[!0-9]*) LARGO=0 ;; esac

case "$METODO $RUTA" in
  "OPTIONS "*)
    if origen_permitido "$ORIGEN"; then responder "204 No Content" ""; else responder "403 Forbidden" '{"ok":false,"error":"origen no permitido"}'; fi
    ;;
  "GET /estado")
    CHROME=$(buscar_chrome) && TIENE_CHROME=true || TIENE_CHROME=false
    COLA=$(buscar_cola)
    [ -n "$COLA" ] && TIENE_COLA=true || TIENE_COLA=false
    responder "200 OK" "{\"ok\":true,\"version\":$VERSION,\"chrome\":$TIENE_CHROME,\"impresora\":$TIENE_COLA}"
    ;;
  "POST /imprimir")
    if ! origen_permitido "$ORIGEN"; then
      responder "403 Forbidden" '{"ok":false,"error":"origen no permitido"}'
      exit 0
    fi
    case "$CONSULTA" in
      '') ;;
      medida=*)
        PEDIDA=${CONSULTA#medida=}
        if ! medida_permitida "$PEDIDA"; then
          responder "400 Bad Request" '{"ok":false,"error":"esa medida de papel no existe"}'
          exit 0
        fi
        MEDIA="Custom.$PEDIDA"
        ;;
      *)
        responder "400 Bad Request" '{"ok":false,"error":"la pantalla pidio algo que el ayudante no conoce"}'
        exit 0
        ;;
    esac
    if [ "$LARGO" -le 0 ] || [ "$LARGO" -gt "$MAX_BYTES" ]; then
      responder "413 Payload Too Large" '{"ok":false,"error":"las etiquetas no llegaron completas"}'
      exit 0
    fi
    CHROME=$(buscar_chrome) || {
      responder "500 Internal Server Error" '{"ok":false,"error":"no hay Chrome en esta Mac"}'
      exit 0
    }
    COLA=$(buscar_cola)
    if [ -z "$COLA" ]; then
      responder "500 Internal Server Error" '{"ok":false,"error":"la Mac no tiene la Brother agregada"}'
      exit 0
    fi

    TMP=$(mktemp -d "${TMPDIR:-/tmp}/cayla-etq.XXXXXX") || exit 1
    trap 'pkill -9 -f "$TMP/perfil" 2>/dev/null; rm -rf "$TMP"' EXIT
    head -c "$LARGO" >"$TMP/recibido.html"

    # La pantalla manda un documento que empieza EXACTO con este prefijo; justo detrás se cuela una CSP que apaga todo
    # JavaScript. (`--blink-settings=scriptEnabled=false` no sirve: con él Chrome no llega a escribir el PDF.)
    PREFIJO='<!doctype html><html><head>'
    if [ "$(head -c 27 "$TMP/recibido.html")" != "$PREFIJO" ]; then
      responder "400 Bad Request" '{"ok":false,"error":"las etiquetas no llegaron en el formato esperado"}'
      exit 0
    fi
    {
      printf '%s' "$PREFIJO"
      printf '%s' "<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'none'; object-src 'none'\">"
      tail -c +28 "$TMP/recibido.html"
    } >"$TMP/etiquetas.html"

    # Chrome sin ventana y con un perfil desechable. Escribe el PDF en un segundo pero después NO se cierra solo (medido el
    # 2026-10-01, Chrome 154): se espera a que avise «bytes written to file» y se le cierra. Tope: 40 s.
    "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check \
      --disable-background-networking --disable-component-update --use-mock-keychain \
      --user-data-dir="$TMP/perfil" --no-pdf-header-footer \
      --print-to-pdf="$TMP/etiquetas.pdf" "file://$TMP/etiquetas.html" >"$TMP/chrome.log" 2>&1 &
    PID=$!
    I=0
    while [ "$I" -lt 80 ]; do
      grep -q 'bytes written to file' "$TMP/chrome.log" 2>/dev/null && break
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.5
      I=$((I + 1))
    done
    { kill -9 "$PID"; wait "$PID"; } 2>/dev/null
    pkill -9 -f "$TMP/perfil" 2>/dev/null

    if [ ! -s "$TMP/etiquetas.pdf" ] || ! tail -c 1024 "$TMP/etiquetas.pdf" | grep -q '%%EOF'; then
      responder "500 Internal Server Error" '{"ok":false,"error":"Chrome no pudo preparar las etiquetas"}'
      exit 0
    fi

    SALIDA=$("$LP" -d "$COLA" -t "Etiquetas CAYLA" -o "media=$MEDIA" -o CutMedia=EndOfPage -o print-scaling=none "$TMP/etiquetas.pdf" 2>&1)
    if [ $? -ne 0 ]; then
      MENSAJE=$(printf '%s' "$SALIDA" | tr -d '"\\' | tr '\n' ' ' | cut -c1-160)
      responder "500 Internal Server Error" "{\"ok\":false,\"error\":\"la impresora no recibio el trabajo: $MENSAJE\"}"
      exit 0
    fi
    # `lp` contesta en el idioma de la Mac («request id is…», «el id de solicitud es…»): se toma solo «<cola>-<número>».
    TRABAJO=$(printf '%s' "$SALIDA" | grep -o "$COLA-[0-9][0-9]*" | head -n 1)
    responder "200 OK" "{\"ok\":true,\"trabajo\":\"$TRABAJO\"}"
    ;;
  *)
    responder "404 Not Found" '{"ok":false,"error":"no existe"}'
    ;;
esac
exit 0
