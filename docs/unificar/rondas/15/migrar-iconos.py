# Ronda 15 de /unificar: lleva cada ícono fuera de la regla (grosor 2; 12 · 14 · 16 · 20 px) a la pieza elegida. Desde apps/web:
#   python3 ../../docs/unificar/rondas/15/migrar-iconos.py ver | aplicar
# Cada sitio se decidió mirando su contenedor (docs/unificar/icono.md): 16 en un botón, un campo o una tecla de 32 px; 20 en una tecla
# grande (40 px o más) o una tarjeta de opción; 14 junto a un texto; 12 en una insignia. La «marca» (✓ − ‖ ✕ sobre un punto lleno) lleva
# trazo 3 como la casilla, y el ícono grande (24 px o más) 1,5 como el de un vacío: las dos con su `unificar-fijo`.
import re, sys
MODO = sys.argv[1] if len(sys.argv) > 1 else "ver"
TAM = {  # archivo: {línea: px}
  "components/BarraCierreCaja.tsx": {16: 16, 47: 16},
  "components/CajaAbiertaPanel.tsx": {644: 14},
  "components/CajaTablero.tsx": {81: 16, 194: 20, 195: 20, 196: 20, 198: 20, 200: 20, 213: 20, 214: 20, 215: 20, 251: 16, 256: 16, 261: 16, 267: 16, 336: 12, 633: 20},
  "components/CajonMovimiento.tsx": {200: 16},
  "components/CambioResumen.tsx": {114: 20},
  "components/CambiosPanel.tsx": {314: 20},
  "components/DevolucionesPanel.tsx": {401: 20},
  "components/InventarioPanel.tsx": {1517: 20},
  "components/ComboResponsable.tsx": {222: 16},
  "components/ComprobanteLineaTiempo.tsx": {56: 16},
  "components/ComprobantesTarjetas.tsx": {65: 16, 92: 16, 108: 16, 153: 16},
  "components/ProformasTarjetas.tsx": {23: 16, 34: 16, 52: 16, 64: 16},
  "components/ExistenciasChips.tsx": {16: 12, 25: 12},
  "components/FiltrosExistencias.tsx": {380: 16},
  "components/FiltrosMovimientos.tsx": {325: 16},
  "components/NotasCreditoPanel.tsx": {323: 12},
  "components/OpcionesComprobante.tsx": {80: 20, 89: 20, 97: 20, 105: 20, 114: 20, 120: 20, 129: 20, 138: 20},
  "components/PestanasComprobantesMovil.tsx": {39: 20},
  "components/RecepcionEnvio.tsx": {1117: 20, 1336: 16},
  "components/alta-producto/MatrizVariantes.tsx": {262: 16},
  "components/apartados/TodosVista.tsx": {472: 12},
  "components/clientas/AvisosClubPanel.tsx": {405: 20},
  "components/colaboradores/EquipoLista.tsx": {109: 20},
  "components/existencias/FlujoTalla.tsx": {1104: 16},
  "components/existencias/PanelTalla.tsx": {822: 16, 1047: 16},
  "components/existencias/PieTarjeta.tsx": {75: 16},
  "components/ficha-producto/MatrizStockFicha.tsx": {327: 12},
  "components/ficha-producto/FotosPorColor.tsx": {280: 12},
  "components/guias/ElegirDemoModal.tsx": {61: 16, 88: 16, 94: 16},
  "components/plan-compra/PlanCampana.tsx": {314: 16},
  "components/punto-de-venta/BolsaDelTicket.tsx": {82: 20},
  "components/recepcion-conteo/ContarEnvio.tsx": {436: 20, 457: 20},
  "components/recepcion-conteo/EnvioCerrado.tsx": {150: 16},
  "components/recepcion-conteo/LlegoSinAviso.tsx": {132: 16, 162: 16},
  "components/recepcion-conteo/SepararPrendas.tsx": {158: 16, 174: 16},
  "app/(app)/page.tsx": {289: 16, 432: 20},
}
MARCA = "unificar-fijo: la marca sobre un punto lleno lleva trazo 3, como la casilla (ronda 15)"
GRANDE = "unificar-fijo: un ícono grande (24 px o más) es un dibujo: trazo 1,5, como el de un vacío (ronda 15)"
MARCAS = {("components/punto-de-venta/HojaDeCobro.tsx", 207), ("components/punto-de-venta/HojaDeCobro.tsx", 397), ("components/conteo/PasosConteo.tsx", 133),
          ("components/colaboradores/DarAccesoModal.tsx", 145), ("components/HistorialCierresTabla.tsx", 94), ("components/RecepcionEnvio.tsx", 1056),
          ("components/existencias/FiltrosRapidos.tsx", 100), ("components/alta-producto/FotosAlta.tsx", 109), ("components/ExistenciasTarjetas.tsx", 128),
          ("components/existencias/PanelTalla.tsx", 693), ("components/ui/Casilla.tsx", 43), ("components/ui/Casilla.tsx", 44),
          ("components/ui/FiltrosPildora.tsx", 449), ("components/ui/FiltrosPildora.tsx", 450)}
GRANDES = {("components/RecepcionEnvio.tsx", 1096), ("components/AbrirConteo.tsx", 293), ("components/EnvioRecibido.tsx", 49), ("components/RolesPanel.tsx", 627), ("components/ficha-producto/FotosPorColor.tsx", 301)}
FUERA = {"components/traslados-pases/PasePedido.tsx", "components/traslados-pases/PaseTraslado.tsx", "components/traslados-pases/ReversoPase.tsx",
         "components/GastoRapidoModal.tsx", "components/MosaicoPrenda.tsx", "components/vista-rapida/MatrizUnidades.tsx",
         "components/colaboradores/IconoModulo.tsx", "components/guias/BotonDemo.tsx", "components/AppShell.tsx"}
CLASE = {12: "3", 14: "3.5", 16: "4", 20: "5"}
ETIQ = re.compile(r"<([A-Z][\w.]*)\b((?:[^>]|=>)*?)/?>", re.S)

def lineas(firmas_txt):
    out = {}
    for ln in open(firmas_txt):
        ln = ln.strip()
        if not ln or ln.endswith("líneas") or ":" in ln.split()[0] and False: continue
        partes = ln.split()
        if len(partes) != 2 or not re.match(r"^[\d,]+$", partes[1]): continue
        out.setdefault(partes[0], set()).update(int(x) for x in partes[1].split(","))
    return out

def tam_tag(t, px):
    t2 = re.sub(r"\bsize=\{\d+\}", f"size={{{px}}}", t)
    c = CLASE[px]
    t2 = re.sub(r"\b(h|w)-(?:2\.5|4\.5|\[(?:10|11|13|15|17|18|19|22)px\])", lambda m: f"{m.group(1)}-{c}", t2)
    t2 = re.sub(r"\bsize-(?:2\.5|4\.5|\[(?:10|11|13|15|17|18|19|22)px\])", f"size-{c}", t2)
    return t2

def trazo_tag(t, valor, motivo):
    if valor is None:
        return re.sub(r"\s*\bstrokeWidth=(?:\{[\d.]+\}|\"[\d.]+\")", "", t)
    t2 = re.sub(r"\bstrokeWidth=(?:\{[\d.]+\}|\"[\d.]+\")", f"strokeWidth={{{valor}}}", t)
    # El motivo va DENTRO de la etiqueta, en la línea donde empieza (la que mira la firma): `<Check /* unificar-fijo: … */ …`.
    if "unificar-fijo" in t2: return t2
    return re.sub(r"^(<[A-Z][\w.]*)", lambda m: f"{m.group(1)} /* {motivo} */", t2, count=1)

total = 0
for archivo, ls in sorted(lineas(sys.argv[2] if len(sys.argv) > 2 else "/dev/stdin").items()):
    if archivo in FUERA or archivo.endswith(".css"): continue
    s = open(archivo).read()
    nuevos = []
    pos = 0
    cambios = []
    for m in ETIQ.finditer(s):
        ini = s.count("\n", 0, m.start()) + 1
        fin = ini + m.group(0).count("\n")
        tocadas = [l for l in ls if ini <= l <= fin]
        if not tocadas: continue
        t = m.group(0)
        if not re.search(r"\b(size=|strokeWidth=|className=)", m.group(2)): continue
        nuevo = t
        px = next((TAM.get(archivo, {}).get(l) for l in range(ini, fin + 1) if TAM.get(archivo, {}).get(l)), None)
        if px and re.search(r"\bsize=\{(?:10|11|13|15|17|18|19|22)\}|\b(?:h|w|size)-(?:2\.5|4\.5|\[(?:10|11|13|15|17|18|19|22)px\])", t):
            nuevo = tam_tag(nuevo, px)
        sw = re.search(r"\bstrokeWidth=(?:\{([\d.]+)\}|\"([\d.]+)\")", nuevo)
        if sw and (sw.group(1) or sw.group(2)) != "2":
            clave = (archivo, ini)
            if clave in MARCAS: nuevo = trazo_tag(nuevo, 3, MARCA); cambios.append((ini, "marca"))
            elif clave in GRANDES: nuevo = trazo_tag(nuevo, 1.5, GRANDE); cambios.append((ini, "grande"))
            else: nuevo = trazo_tag(nuevo, None, None)
        if nuevo != t:
            cambios.append((ini, t.replace("\n", " ")[:110], nuevo.replace("\n", " ")[:110]))
            nuevos.append((m.start(), m.end(), nuevo))
    if not nuevos: continue
    out = s
    for a, b, n in reversed(nuevos):
        out = out[:a] + n + out[b:]
    total += len(nuevos)
    print(f"\n{archivo}: {len(nuevos)}")
    for c in cambios:
        print("   ", c if len(c) == 2 else f"{c[0]}: {c[1]}\n        → {c[2]}")
    if MODO == "aplicar":
        open(archivo, "w").write(out)
print("\ntotal", total)
