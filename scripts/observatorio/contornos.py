#!/usr/bin/env python3
"""
Genera apps/web/lib/observatorio-mapa-datos.ts (los contornos del mapa del Observatorio, ADR-0322) a partir de los
límites departamentales del INEI (2007) publicados en github.com/juaneladio/peru-geojson (MPL-2.0).

USO
  curl -o /tmp/deps.geojson https://raw.githubusercontent.com/juaneladio/peru-geojson/master/peru_departamental_simple.geojson
  python3 scripts/observatorio/contornos.py /tmp/deps.geojson

QUÉ HACE
  · El contorno del Perú es la unión de los 25 departamentos: los tramos que comparten dos departamentos se descartan y lo
    que queda (el borde) se encadena en un anillo. No hace falta ninguna librería de geometría.
  · Lima va unida con el Callao (la tienda de Lima vive en el área metropolitana de los dos).
  · Cada anillo se simplifica (Douglas-Peucker) y las coordenadas se guardan con 3 decimales (~100 m): de sobra para un mapa
    que, acercado, muestra un departamento entero.
"""
import collections, json, math, sys, os

TOL_PERU = 0.025   # grados
TOL_DEP = 0.02

def anillos(g):
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    return [p[0] for p in polys]

def clave(p):
    return (round(p[0], 5), round(p[1], 5))

def union(feats):
    cnt = collections.Counter(); seg = []
    for f in feats:
        for r in anillos(f['geometry']):
            for a, b in zip(r, r[1:]):
                A, B = clave(a), clave(b)
                if A == B:
                    continue
                cnt[frozenset((A, B))] += 1; seg.append((A, B))
    borde = [(A, B) for (A, B) in seg if cnt[frozenset((A, B))] == 1]
    sig = collections.defaultdict(list)
    for A, B in borde:
        sig[A].append(B)
    usados = set(); res = []
    for A, B in borde:
        if (A, B) in usados:
            continue
        ring = [A]; cur = (A, B)
        while cur not in usados:
            usados.add(cur); ring.append(cur[1])
            nxt = [c for c in sig[cur[1]] if (cur[1], c) not in usados]
            if not nxt:
                break
            cur = (cur[1], nxt[0])
        res.append(ring)
    res.sort(key=len, reverse=True)
    return res[0]

def dp(pts, tol):
    if len(pts) < 3:
        return pts
    def dist(p, a, b):
        (x, y), (x1, y1), (x2, y2) = p, a, b
        dx, dy = x2 - x1, y2 - y1
        if dx == dy == 0:
            return math.hypot(x - x1, y - y1)
        t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        d = dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        return dp(pts[:idx + 1], tol)[:-1] + dp(pts[idx:], tol)
    return [pts[0], pts[-1]]

def simplificar(ring, tol):
    r = ring[:-1] if ring[0] == ring[-1] else ring
    # partir el anillo en dos mitades para que Douglas-Peucker no colapse un anillo cerrado
    m = len(r) // 2
    s = dp(r[:m + 1], tol)[:-1] + dp(r[m:] + [r[0]], tol)[:-1]
    return [[round(x, 3), round(y, 3)] for x, y in s]

def ts(nombre, ring):
    return f"export const {nombre}: Contorno = {json.dumps(ring, separators=(',', ':'))};\n"

def main(ruta):
    d = json.load(open(ruta))
    por = {f['properties']['NOMBDEP']: f for f in d['features']}
    peru = simplificar(union(d['features']), TOL_PERU)
    tiendas = {
        'TRU': simplificar(anillos(por['LA LIBERTAD']['geometry'])[0], TOL_DEP / 2),
        'AQP': simplificar(anillos(por['AREQUIPA']['geometry'])[0], TOL_DEP / 2),
        'LIM': simplificar(union([por['LIMA'], por['CALLAO']]), TOL_DEP / 2),
    }
    salida = os.path.join(os.path.dirname(__file__), '../../apps/web/lib/observatorio-mapa-datos.ts')
    with open(salida, 'w', encoding='utf-8') as o:
        o.write("// Contornos del mapa del Observatorio (ADR-0322). GENERADO por scripts/observatorio/contornos.py: no editar a mano.\n")
        o.write("//\n// Fuente: límites departamentales del INEI (2007), publicados en github.com/juaneladio/peru-geojson bajo la licencia\n")
        o.write("// Mozilla Public License 2.0. Este archivo deriva de esos datos (contornos unidos y simplificados) y se distribuye bajo\n")
        o.write("// la misma licencia, MPL-2.0 (https://mozilla.org/MPL/2.0/). Coordenadas: [longitud, latitud], 3 decimales.\n\n")
        o.write("export type Contorno = readonly (readonly [number, number])[];\n\n")
        o.write("/** El borde del Perú: la unión de los 25 departamentos. */\n")
        o.write(ts('PERU', peru))
        o.write("\n/** El departamento de cada tienda, por su sigla: La Libertad (TRU), Arequipa (AQP) y Lima con el Callao (LIM). */\n")
        o.write("export const DEPARTAMENTO_DE_TIENDA: Readonly<Record<\"TRU\" | \"AQP\" | \"LIM\", { nombre: string; contorno: Contorno }>> = {\n")
        nombres = {'TRU': 'La Libertad', 'AQP': 'Arequipa', 'LIM': 'Lima'}
        for k in ('TRU', 'AQP', 'LIM'):
            o.write(f"  {k}: {{ nombre: \"{nombres[k]}\", contorno: {json.dumps(tiendas[k], separators=(',', ':'))} }},\n")
        o.write("};\n")
    print('Perú', len(peru), 'puntos; tiendas', {k: len(v) for k, v in tiendas.items()})

if __name__ == '__main__':
    main(sys.argv[1])
