#!/bin/zsh
cd <apps/web>
F=accion.guardar,accion.editar,modal
for cuenta in admin terminal-ventas; do
  node unificar/cli.mjs --base-url http://localhost:3110 --cuenta $cuenta --todas --escenarios --familia $F --salida unificar/.salida/r12b-$cuenta > unificar/.salida/r12b-$cuenta.log 2>&1 &
  CENSO=$!
  while kill -0 $CENSO 2>/dev/null; do
    [ "$(df -g ~ | tail -1 | awk '{print $4}')" -lt 8 ] && { kill $CENSO; echo "DISCO BAJO: censo $cuenta detenido"; }
    sleep 30
  done
  wait $CENSO 2>/dev/null; echo "censo $cuenta terminó: $(tail -3 unificar/.salida/r12b-$cuenta.log | head -1)"
done
