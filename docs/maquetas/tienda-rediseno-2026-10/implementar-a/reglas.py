"""Reemplaza reglas CSS de una línea por su selector exacto (lo que va antes de « {» al inicio de la línea, con su sangría).
Uso: python3 reglas.py <archivo.css> <cambios.py>, donde cambios.py define CAMBIOS = {selector: nueva_linea_o_None (borrar)}."""
import sys, re
archivo, cambios = sys.argv[1], sys.argv[2]
ns = {}; exec(open(cambios).read(), ns); C = ns["CAMBIOS"]
lineas = open(archivo).read().split("\n")
usados = set()
for i, l in enumerate(lineas):
    m = re.match(r"^(\s*)(.+?) \{", l)
    if not m: continue
    sel = m.group(1) + m.group(2)  # la sangría cuenta: «  .x» es la regla de adentro de un @container
    if sel in C and l.rstrip().endswith("}"):
        if sel in usados: print("REPETIDO", sel); continue
        usados.add(sel)
        nuevo = C[sel]
        lineas[i] = None if nuevo is None else m.group(1) + nuevo.lstrip()
faltan = [k for k in C if k not in usados]
open(archivo, "w").write("\n".join(x for x in lineas if x is not None))
print("cambiadas", len(usados), "faltan", faltan)
