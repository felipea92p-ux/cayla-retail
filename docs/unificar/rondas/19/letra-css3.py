# Sube la letra chica del CSS propio de un módulo, mirando el BLOQUE entero: si la regla lleva versalitas o letras espaciadas, no se toca. EXTRA (regex) salta más selectores (gráficos, mapas, teclas).
import re, sys, os
MAPA={"10":"12","10.5":"12","11":"13","11.5":"14","12":"14","12.5":"14","13":"14","13.5":"15"}
SALTA_BLOQUE=re.compile(r"uppercase|letter-spacing|small-caps")
SALTA_SEL=re.compile(r"sello|estampa|badge|grafico|eje|pulso-ritmo|anillo-num|fin-pestana|fin-cuenta-tab|data-l|fin-etq|fin-marcas|fin-control|fin-delta|chip|insignia|kbd|mono|riel|semanas|flag|tecla|calendario-dia|agenda-dia|agenda-rotulo|ok-ic|umbral-escala|desplegable-caja|calor|cal-dia|celda|foto-pildora|marco-direccion|previa-boton")
seco="--seco" in sys.argv
for p in [a for a in sys.argv[1:] if a!="--seco"]:
    s=open(p).read(); n=0
    def bloque(m):
        global n
        sel, cuerpo = m.group(1), m.group(2)
        if SALTA_BLOQUE.search(cuerpo) or SALTA_SEL.search(sel) or (os.environ.get("EXTRA") and re.search(os.environ["EXTRA"], sel)) or re.search(r"(?<!min-)(?<!max-)height: ?1[0-9]px", cuerpo): return m.group(0)
        nuevo=re.sub(r"font-size: ?(1[0-3](?:\.5)?)px", lambda k: k.group(0).replace(k.group(1)+"px", MAPA[k.group(1)]+"px"), cuerpo)
        if nuevo!=cuerpo: n+=1
        return sel+"{"+nuevo+"}"
    s2=re.sub(r"([^{}]*)\{([^{}]*)\}", bloque, s)
    if not seco: open(p,"w").write(s2)
    print(n, p)
