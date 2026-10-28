# Censo de control: por cada familia DECIDIDA, las variantes que el censo vio y que no vienen de su pieza, de las que la acompañan
# (`tambien`) ni de una excepción con motivo. Son lo que hay que depurar a mano: un falso positivo del motor, algo decidido a
# propósito o una pieza dibujada a mano que la firma no ve.
#   python3 ../../docs/unificar/control/fuera-de-pieza.py unificar/.salida/control-admin [más carpetas]   (desde apps/web)
import json, sys, collections, subprocess
dec = json.loads(subprocess.run(["node", "-e", "import('./unificar/familias.mjs').then(m=>console.log(JSON.stringify(m.DECISIONES)))"], capture_output=True, text=True).stdout)
salida = collections.defaultdict(lambda: collections.defaultdict(lambda: {"usos": 0, "pantallas": set(), "huellas": set(), "ej": ""}))
for carpeta in sys.argv[1:]:
    d = json.load(open(f"{carpeta}/censo.json"))
    for f in d["familias"]:
        if f["id"] not in dec:
            continue
        de = dec[f["id"]]
        propios = {de["pieza"], *(de.get("tambien") or []), *[e["archivo"] for e in de.get("excepciones") or []]}
        for sg in f["subgrupos"]:
            for v in sg["variantes"]:
                arch = [a for a in (v.get("archivos") or [])]
                if not arch:
                    continue
                ajenos = [a for a in arch if not any(p and (a.endswith(p) or p.endswith(a)) for p in propios)]
                if len(ajenos) < len(arch):
                    continue  # al menos uno de sus archivos es la pieza: la variante es la pieza vista en otro contexto
                for a in ajenos[:1]:
                    r = salida[f["id"]][a]
                    r["usos"] += v["usos"]
                    r["pantallas"].update(p.split(" · ")[0] for p in v["pantallas"])
                    r["huellas"].add(v["hash"])
                    r["ej"] = r["ej"] or " · ".join(v.get("ejemplos", [])[:2])[:90]
for fam in sorted(salida):
    filas = sorted(salida[fam].items(), key=lambda kv: -kv[1]["usos"])
    print(f"\n{fam}: {len(filas)} archivos fuera de la pieza")
    for a, r in filas[:14]:
        print(f"  {r['usos']:4} usos · {len(r['huellas'])} formas · {a}  [{', '.join(sorted(r['pantallas']))[:70]}]  «{r['ej']}»")
