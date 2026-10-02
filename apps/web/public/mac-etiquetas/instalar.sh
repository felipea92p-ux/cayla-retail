#!/bin/sh
# Instala (o quita) el ayudante de etiquetas CAYLA en esta Mac (ADR-0304). Una vez por computadora, sin contraseña.
#
#   curl -fsSL https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh | sh
#   curl -fsSL https://cayla-retail.vercel.app/mac-etiquetas/instalar.sh | sh -s quitar
#
# Qué hace: copia `servidor.sh` a «~/Library/Application Support/CAYLA/etiquetas» y registra un servicio de usuario
# (LaunchAgent) que escucha SOLO en 127.0.0.1:9631. No toca la impresora ni la configuración de Chrome.

set -u
PATH="/usr/bin:/bin:/usr/sbin:/sbin"

ETIQUETA="pe.cayla.etiquetas"
PUERTO=9631
BASE="${CAYLA_BASE:-https://cayla-retail.vercel.app}"
DIR="${CAYLA_ETIQUETAS_DIR:-$HOME/Library/Application Support/CAYLA/etiquetas}"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
UID_USUARIO=$(id -u)

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Esto es solo para Mac. En Windows no hace falta: se imprime con el botón de siempre."
  exit 1
fi

parar() {
  launchctl bootout "gui/$UID_USUARIO/$ETIQUETA" >/dev/null 2>&1 || launchctl unload "$PLIST" >/dev/null 2>&1 || true
}

if [ "${1:-}" = "quitar" ]; then
  parar
  rm -f "$PLIST"
  rm -rf "$DIR"
  echo "Listo: el ayudante de etiquetas se quitó de esta Mac."
  exit 0
fi

echo "Instalando el ayudante de etiquetas CAYLA…"
mkdir -p "$DIR" "$HOME/Library/LaunchAgents" || exit 1

# `CAYLA_FUENTE` (carpeta local) solo la usan las pruebas; en las tiendas se baja de la web.
if [ -n "${CAYLA_FUENTE:-}" ]; then
  cp "$CAYLA_FUENTE/servidor.sh" "$DIR/servidor.sh" || exit 1
else
  curl -fsSL "$BASE/mac-etiquetas/servidor.sh" -o "$DIR/servidor.sh" || {
    echo "No pude bajar el ayudante de $BASE. Revisa que la Mac tenga internet y vuelve a intentar."
    exit 1
  }
fi
chmod 755 "$DIR/servidor.sh"
head -n 1 "$DIR/servidor.sh" | grep -q '^#!/bin/sh' || {
  echo "El archivo que bajé no es el ayudante (¿entraste a un Wi-Fi con portal?). No instalé nada."
  rm -f "$DIR/servidor.sh"
  exit 1
}

cat >"$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>$DIR/servidor.sh</string>
  </array>
  <key>inetdCompatibility</key><dict><key>Wait</key><false/></dict>
  <key>Sockets</key>
  <dict>
    <key>Listeners</key>
    <dict>
      <key>SockNodeName</key><string>127.0.0.1</string>
      <key>SockServiceName</key><string>$PUERTO</string>
    </dict>
  </dict>
  <key>EnvironmentVariables</key>
  <dict><key>CAYLA_ETIQUETAS_DIR</key><string>$DIR</string></dict>
  <key>StandardErrorPath</key><string>$DIR/errores.log</string>
</dict>
</plist>
PLIST

parar
if ! launchctl bootstrap "gui/$UID_USUARIO" "$PLIST" 2>/dev/null; then
  launchctl load -w "$PLIST" || { echo "No pude registrar el servicio."; exit 1; }
fi

sleep 1
ESTADO=$(curl -fsS --max-time 5 "http://127.0.0.1:$PUERTO/estado" 2>/dev/null || true)
case "$ESTADO" in
  *'"ok":true'*)
    echo "Listo. El ayudante responde en esta Mac."
    case "$ESTADO" in *'"chrome":false'*) echo "AVISO: no encuentro Google Chrome en Aplicaciones; sin él no se pueden preparar las etiquetas." ;; esac
    case "$ESTADO" in *'"impresora":false'*) echo "AVISO: la Mac no tiene la Brother agregada (Ajustes del Sistema ▸ Impresoras y escáneres)." ;; esac
    echo "Ahora, en «Etiquetas de precio», el botón Imprimir manda las etiquetas directo a la Brother, sin diálogo."
    echo "Si Chrome pregunta por acceso a la red local, elige Permitir."
    ;;
  *)
    echo "Quedó instalado, pero no responde. Mira «$DIR/errores.log» y avísale a Felipe."
    exit 1
    ;;
esac
