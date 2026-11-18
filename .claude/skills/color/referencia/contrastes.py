#!/usr/bin/env python3
"""Tabla de contraste de la paleta REAL del repo, en claro y en oscuro (skill /color).

Lee los tokens de `apps/web/app/globals.css` (`@theme static`) y de `apps/web/app/estilos/tema.css`
(`:root[data-tema="oscuro"]`), nunca una copia: si un token cambia, la tabla cambia. Solo stdlib.

Uso (desde la raíz del repo):
    python3 .claude/skills/color/referencia/contrastes.py > .claude/skills/color/referencia/contrastes.md

Fórmulas (verificadas contra valores publicados, ver --verificar):
- WCAG 2: luminancia relativa sRGB (umbral 0.04045), (L1 + 0.05) / (L2 + 0.05).
- APCA 0.0.98G-4g (SAPC, Somers): Lc con signo (negativo = texto claro sobre fondo oscuro).
- Alfa: se compone en sRGB sobre el fondo (es lo que pinta el navegador con `bg-verde/15` o `color-mix(..., transparent)`).
- Daltonismo: matrices de Machado, Oliveira y Fernandes 2009 (severidad 1.0) en RGB lineal; ΔE CIE76 en Lab D65,
  la misma medida que usa `lib/tema-tokens.test.ts`.
- OKLCH: matrices de Ottosson 2020.
"""
import math, re, sys, pathlib

RAIZ = pathlib.Path(sys.argv[sys.argv.index("--repo") + 1]) if "--repo" in sys.argv else pathlib.Path.cwd()

def bloque(css, inicio):
    i = css.index(inicio); j = css.index("{", i) + 1; hondo = 1; k = j
    while hondo:
        hondo += {"{": 1, "}": -1}.get(css[k], 0); k += 1
    return css[j:k - 1]

def tokens(texto):
    texto = re.sub(r"/\*.*?\*/", "", texto, flags=re.S)
    return {m[1]: m[2].lower() for m in re.finditer(r"--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;", texto)}

globals_css = (RAIZ / "apps/web/app/globals.css").read_text(encoding="utf8")
tema_css = (RAIZ / "apps/web/app/estilos/tema.css").read_text(encoding="utf8")
CLARO = tokens(bloque(globals_css, "@theme static"))
OSCURO = {**CLARO, **tokens(bloque(tema_css, ':root[data-tema="oscuro"]'))}

# ---------- color ----------
def rgb(h): h = h.lstrip("#"); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
def hexde(c): return "#" + "".join(f"{round(max(0, min(1, v)) * 255):02x}" for v in c)
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def delin(c): return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
def relL(h): r, g, b = [lin(c) for c in rgb(h)]; return 0.2126 * r + 0.7152 * g + 0.0722 * b
def wcag(a, b): la, lb = relL(a), relL(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
def mezcla(frente, fondo, alfa): return hexde([f * alfa + b * (1 - alfa) for f, b in zip(rgb(frente), rgb(fondo))])

def apca(txt, bg):
    def Y(h): r, g, b = rgb(h); return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.0721750 * b ** 2.4
    yt, yb = Y(txt), Y(bg)
    yt = yt if yt > 0.022 else yt + (0.022 - yt) ** 1.414
    yb = yb if yb > 0.022 else yb + (0.022 - yb) ** 1.414
    if abs(yb - yt) < 0.0005: return 0.0
    if yb > yt:
        s = (yb ** 0.56 - yt ** 0.57) * 1.14; return 0.0 if s < 0.1 else (s - 0.027) * 100
    s = (yb ** 0.65 - yt ** 0.62) * 1.14; return 0.0 if s > -0.1 else (s + 0.027) * 100

def oklch(h):
    r, g, b = [lin(c) for c in rgb(h)]
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L * 100, math.hypot(A, B), math.degrees(math.atan2(B, A)) % 360

MACHADO = {
    "protan": [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    "deutan": [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    "tritan": [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
def simular(h, tipo):
    v = [lin(c) for c in rgb(h)]; M = MACHADO[tipo]
    return hexde([delin(max(0, min(1, sum(M[i][j] * v[j] for j in range(3))))) for i in range(3)])
def lab(h):
    r, g, b = [lin(c) for c in rgb(h)]
    X, Y, Z = 0.4124 * r + 0.3576 * g + 0.1805 * b, 0.2126 * r + 0.7152 * g + 0.0722 * b, 0.0193 * r + 0.1192 * g + 0.9505 * b
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(X / 0.95047), f(Y), f(Z / 1.08883)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)
def dE(a, b): return math.dist(lab(a), lab(b))

if "--verificar" in sys.argv:
    print("APCA #888 sobre #fff =", round(apca("#888888", "#ffffff"), 1), "(ref 63.1)")
    print("APCA #fff sobre #888 =", round(apca("#ffffff", "#888888"), 1), "(ref -68.5)")
    print("APCA #000 sobre #aaa =", round(apca("#000000", "#aaaaaa"), 1), "(ref 58.1)")
    print("WCAG #767676 sobre #fff =", round(wcag("#767676", "#ffffff"), 2), "(ref 4.54)")
    sys.exit()

# ---------- qué se mide ----------
SUP = ["crema", "papel", "hueso", "sand"]
TEXTOS = ["tinta", "tinta-60", "taupe", "rojo", "rojo-profundo", "verde", "verde-profundo", "ambar", "ambar-profundo", "pizarra",
          "metodo-efectivo-tinta", "metodo-tarjeta", "metodo-yape", "metodo-plin", "metodo-transferencia"]
NO_TEXTO = ["borde-control", "sand", "tinta", "rojo", "taupe", "grafico-alza", "grafico-neutro", "grafico-baja", "naranja", "avance-medio",
            "metodo-efectivo", "metodo-tarjeta", "metodo-yape", "metodo-plin", "metodo-transferencia",
            "sede-tru", "sede-aqp", "sede-lim", "sede-tal", "sede-emp"]

def marca(r, u): return f"**{r:.2f}**" if r < u else f"{r:.2f}"
def fila_texto(T, t):
    celdas = []
    for s in SUP:
        r = wcag(T[t], T[s]); lc = apca(T[t], T[s])
        celdas.append(f"{marca(r, 4.5)} · {lc:+.0f}")
    return f"| `{t}` {T[t]} | " + " | ".join(celdas) + " |"

def seccion(nombre, T):
    out = [f"## {nombre}", ""]
    out += ["### Texto sobre cada superficie (WCAG 2 · APCA Lc)", "",
            "En **negrita**, bajo 4.5:1 (texto normal, 1.4.3). APCA es la segunda mirada: Lc 75 cuerpo de texto, 60 texto de contenido, 45 títulos, 30 marcadores.", "",
            "| Texto | " + " | ".join(f"{s} {T[s]}" for s in SUP) + " |", "|---|" + "---|" * len(SUP)]
    out += [fila_texto(T, t) for t in TEXTOS]
    piso = 0.60 if T is OSCURO else 0.64
    out += [f"| tinta al {round(piso*100)} % (piso de `text-tinta/35…`) | " + " | ".join(
        f"{marca(wcag(mezcla(T['tinta'], T[s], piso), T[s]), 4.5)} · {apca(mezcla(T['tinta'], T[s], piso), T[s]):+.0f}" for s in SUP) + " |"]
    out += [f"| tinta al 50 % sin piso (un `color-mix` en CSS) | " + " | ".join(
        f"{marca(wcag(mezcla(T['tinta'], T[s], .5), T[s]), 4.5)} · {apca(mezcla(T['tinta'], T[s], .5), T[s]):+.0f}" for s in SUP) + " |", ""]

    out += ["### Pares de pieza (texto sobre su propio fondo)", "", "| Par | Fondo efectivo | WCAG 2 | APCA Lc | Pasa |", "|---|---|---|---|---|"]
    pares = [
        ("Botón primario: `crema` sobre `tinta`", T["crema"], T["tinta"]),
        ("Primario al pasar el mouse: `crema` sobre `rojo-profundo`", T["crema"], T["rojo-profundo"]),
        ("Fondo `rojo` plano con letra `crema` (pasa plano; sobre vidrio no y el ERP no lo usa: «Lo peligroso»)", T["crema"], T["rojo"]),
        ("`btn-peligro`: `rojo-profundo` sobre papel", T["rojo-profundo"], T["papel"]),
        ("Chip neutro: `taupe` sobre `sand`", T["taupe"], T["sand"]),
    ]
    for t, a in [("verde", .15), ("ambar", .15), ("pizarra", .15)]:
        pares.append((f"Chip {t}: `{t}` sobre `{t}/15` en papel", T[t], mezcla(T[t], T["papel"], a)))
    pares.append(("Chip rojo: `rojo-profundo` sobre `rojo/10` en papel", T["rojo-profundo"], mezcla(T["rojo"], T["papel"], .10)))
    pares.append(("Error bajo el campo (`.pie-error`): `rojo-profundo` sobre crema", T["rojo-profundo"], T["crema"]))
    pares.append(("Avance a medias sobre su pista: `avance-medio` sobre `sand` (no texto, 3:1)", T["avance-medio"], T["sand"], 3))
    for n, f, b, *u in pares:
        u = u[0] if u else 4.5
        r = wcag(f, b); out.append(f"| {n} | {b} | {r:.2f} | {apca(f, b):+.0f} | {'sí' if r >= u else f'**no ({u:g})**'} |")
    out.append("")

    out += ["### Lo que no es texto: bordes, foco, marcas de gráfico (WCAG 1.4.11 · 3:1)", "",
            "| Color | " + " | ".join(SUP[:3]) + " | Uso |", "|---|---|---|---|---|"]
    usos = {"borde-control": "borde de lo que se toca o se escribe", "sand": "línea DECORATIVA (no identifica un control)",
            "tinta": "anillo de foco (`--foco-color`) y hilo de la guía", "rojo": "hilo de fila abierta, acento gráfico",
            "taupe": "referencia punteada en `<Linea>`, metas"}
    for c in NO_TEXTO:
        uso = usos.get(c, "relleno de dato (va con su nombre al lado)")
        out.append(f"| `{c}` {T[c]} | " + " | ".join(marca(wcag(T[c], T[s]), 3) for s in SUP[:3]) + f" | {uso} |")
    out.append("")
    return out

def daltonismo(T, nombre):
    pares = [("verde", "rojo"), ("verde", "ambar"), ("rojo", "ambar"), ("rojo", "taupe"), ("rojo", "rojo-profundo"),
             ("pizarra", "verde"), ("grafico-alza", "grafico-baja"), ("grafico-alza", "grafico-neutro"), ("grafico-baja", "grafico-neutro"),
             ("naranja", "rojo"), ("sede-aqp", "rojo"), ("sede-tru", "sede-tal"), ("sede-lim", "sede-tru"), ("metodo-yape", "metodo-transferencia"),
             ("metodo-plin", "verde")]
    out = [f"### Daltonismo — {nombre} (ΔE CIE76 entre los dos colores; < 11 = se confunden como relleno vecino)", "",
           "| Par | normal | protán | deután | tritán |", "|---|---|---|---|---|"]
    for a, b in pares:
        vals = [dE(T[a], T[b])] + [dE(simular(T[a], k), simular(T[b], k)) for k in ("protan", "deutan", "tritan")]
        out.append(f"| `{a}` / `{b}` | " + " | ".join(f"**{v:.1f}**" if v < 11 else f"{v:.1f}" for v in vals) + " |")
    out.append("")
    return out

print("# Contrastes medidos de la paleta real de cayla-retail")
print()
print("> **Generado, no se edita a mano.** Regenerar desde la raíz del repo:")
print("> `python3 .claude/skills/color/referencia/contrastes.py > .claude/skills/color/referencia/contrastes.md`")
print("> Fuente: `apps/web/app/globals.css` (`@theme static`) y `apps/web/app/estilos/tema.css` (`:root[data-tema=\"oscuro\"]`).")
print("> Etiqueta de todo lo que sigue: **[Medido]** con fórmula de [Norma] (WCAG 2) y de [Práctica] (APCA 0.0.98G-4g, Machado 2009).")
print("> Mide TOKENS planos. El vidrio (degradados) lo mide `lib/vidrio-contraste.test.ts` y la pantalla real `tema:auditar` o `referencia/medir.js`.")
print()
print("## OKLCH de los tokens (L % · C · H°)")
print()
print("| Token | Claro | OKLCH claro | Oscuro | OKLCH oscuro |")
print("|---|---|---|---|---|")
for t in ["crema", "papel", "hueso", "sand", "tinta", "tinta-60", "taupe", "borde-control", "rojo", "rojo-profundo", "verde", "ambar", "pizarra", "naranja"]:
    a, b = oklch(CLARO[t]), oklch(OSCURO[t])
    print(f"| `{t}` | {CLARO[t]} | {a[0]:.1f} · {a[1]:.3f} · {a[2]:.0f} | {OSCURO[t]} | {b[0]:.1f} · {b[1]:.3f} · {b[2]:.0f} |")
print()
print("\n".join(seccion("Claro (el de fábrica)", CLARO)))
print("\n".join(daltonismo(CLARO, "claro")))
print("\n".join(seccion("Oscuro (`data-tema=\"oscuro\"`)", OSCURO)))
print("\n".join(daltonismo(OSCURO, "oscuro")))
