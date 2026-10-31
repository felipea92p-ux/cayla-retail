# Ronda 19: sube la letra chica de las pantallas de un módulo. Lo que se lee pasa a 14 px; el título de una fila de 13,5 a 15 px.
# Se salta lo que no es texto de lectura: versalitas, botones del sistema, controles de alto fijo y letra monoespaciada.
import re, sys
MAPA = {"text-[13.5px]": "text-[15px]"}
for t in ["text-[10px]", "text-[10.5px]", "text-[11px]", "text-[11.5px]", "text-[12px]", "text-[12.5px]", "text-[13px]", "text-xs"]:
    MAPA[t] = "text-sm"
SALTA = re.compile(r"label-cayla|uppercase|btn-cayla|tracking-|font-mono|\bh-[5678]\b|\bh-\[1\.|min-w-\[|\bsize-|kbd")
patron = re.compile(r"(?<![\w-])(text-\[1[0-3](?:\.5)?px\]|text-xs)(?![\w-])")
seco = "--seco" in sys.argv
total = 0
for f in open(sys.argv[1]).read().split():
    lineas = open(f).read().split("\n")
    n = 0
    for i, l in enumerate(lineas):
        if SALTA.search(l) or "sm:text-" in l and False:
            continue
        nueva = patron.sub(lambda m: MAPA.get(m.group(1), m.group(1)), l)
        if nueva != l:
            n += len(patron.findall(l)); lineas[i] = nueva
    if n:
        total += n; print(f"{n:4} {f}")
        if not seco: open(f, "w").write("\n".join(lineas))
print("total", total)
