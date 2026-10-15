#!/bin/zsh
# Censo de la ronda 13 (gráficos, menú, copiar y buscar), dirigido a los módulos donde viven, con sus escenarios.
# El primero, con todo el ERP y además los íconos, se cortó por disco (la caché de Turbopack llegó a 19 GB): este no compila lo que no hace falta.
# El vigilante detiene el censo si quedan menos de 6 GB (con el disco lleno se apaga Docker y cae la base local).
cd <apps/web>
F=grafico,accion.buscar,accion.menu,accion.copiar
correr() { # $1 cuenta · $2 módulos
  node unificar/cli.mjs --base-url http://localhost:3110 --cuenta $1 --modulo $2 --escenarios --familia $F --salida unificar/.salida/r13b-$1 > unificar/.salida/r13b-$1.log 2>&1 &
  CENSO=$!
  while kill -0 $CENSO 2>/dev/null; do
    [ "$(df -g ~ | tail -1 | awk '{print $4}')" -lt 6 ] && { kill $CENSO; echo "DISCO BAJO: censo $1 detenido"; }
    sleep 20
  done
  wait $CENSO 2>/dev/null; echo "censo $1 terminó: $(tail -3 unificar/.salida/r13b-$1.log | head -1)"
}
correr admin inicio,caja,rendimiento,compras,inventario,productos,clientas,colaboradores,movimientos,configuracion,vender
correr terminal-ventas inicio,caja,clientas,vender
