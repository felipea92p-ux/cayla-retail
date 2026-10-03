// El mapa del Observatorio (ADR-0322): geometría pura, sin React ni base. La usan el mapa (cliente) y sus pruebas.
//
// PROMETE: proyectar longitud/latitud a las unidades del dibujo, el contorno del Perú y el de cada departamento con
// tienda remuestreados a los MISMOS puntos (para transformar uno en otro), la «caja» que se quiere mostrar en cada foco y el
// encuadre (viewBox) que la llena según la proporción real del espacio, sin márgenes vacíos.
// ASUME: los contornos de `observatorio-mapa-datos.ts` (INEI, simplificados) y que una tienda se reconoce por su sigla
// (`siglaSede`: TRU, AQP, LIM). Una tienda de otra ciudad no tiene lugar en el mapa: sale en el ranking y en el panel.

import { DEPARTAMENTO_DE_TIENDA, PERU, type Contorno } from "./observatorio-mapa-datos";

export type Punto = [number, number];
/** [x, y, ancho, alto] en unidades del dibujo. */
export type Caja = [number, number, number, number];
export type SiglaConMapa = "TRU" | "AQP" | "LIM";
export type FocoMapa = "TODAS" | SiglaConMapa;

// Proyección equirectangular con la corrección del coseno a 9,5° S (la mitad del Perú): 1° de latitud = 40 unidades.
// El origen deja a la izquierda una franja de mar donde van las etiquetas de las tiendas.
const LON0 = -86.6;
const LAT0 = 0.6;
const ESCALA = 40;
const COS = Math.cos((9.5 * Math.PI) / 180);

export function proyectar(lon: number, lat: number): Punto {
  return [(lon - LON0) * COS * ESCALA, (LAT0 - lat) * ESCALA];
}

/** Dónde está cada tienda (la ciudad) y su nombre. */
export const CIUDAD_DE_TIENDA: Readonly<Record<SiglaConMapa, { ciudad: string; lon: number; lat: number }>> = {
  TRU: { ciudad: "Trujillo", lon: -79.0, lat: -8.1 },
  AQP: { ciudad: "Arequipa", lon: -71.54, lat: -16.4 },
  LIM: { ciudad: "Lima", lon: -77.03, lat: -12.05 },
};

export function esSiglaConMapa(s: string): s is SiglaConMapa {
  return s === "TRU" || s === "AQP" || s === "LIM";
}

export function posicionDeTienda(s: SiglaConMapa): Punto {
  const c = CIUDAD_DE_TIENDA[s];
  return proyectar(c.lon, c.lat);
}

/** El Taller: en la vista del país va corrido al este de Lima (si no, se taparía con la tienda); acercado a Lima, en su lugar. */
export const TALLER_EN_EL_PAIS: Punto = proyectar(-75.7, -11.25);
export const TALLER_EN_LIMA: Punto = proyectar(-76.94, -11.96);

/** La franja de mar donde van las etiquetas de las tiendas: su borde derecho, en unidades. */
export const BORDE_DE_ETIQUETAS = 250;

/**
 * Un contorno cerrado remuestreado a `n` puntos repartidos a lo largo del borde, en el mismo sentido (horario en pantalla) y
 * empezando por su punto más al norte. Así dos contornos cualesquiera se pueden transformar uno en otro punto por punto.
 */
export function remuestrear(contorno: Contorno, n = 160): Punto[] {
  let pts = contorno.map(([lon, lat]) => proyectar(lon, lat));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area < 0) pts = [...pts].reverse();
  const cerrado = [...pts, pts[0]];
  const tramos: number[] = [];
  let largo = 0;
  for (let i = 0; i < cerrado.length - 1; i++) {
    const d = Math.hypot(cerrado[i + 1][0] - cerrado[i][0], cerrado[i + 1][1] - cerrado[i][1]);
    tramos.push(d);
    largo += d;
  }
  const out: Punto[] = [];
  let i = 0;
  let acumulado = 0;
  for (let k = 0; k < n; k++) {
    const t = (k * largo) / n;
    while (i < tramos.length - 1 && acumulado + tramos[i] < t) {
      acumulado += tramos[i];
      i++;
    }
    const f = tramos[i] ? (t - acumulado) / tramos[i] : 0;
    out.push([
      +(cerrado[i][0] + (cerrado[i + 1][0] - cerrado[i][0]) * f).toFixed(2),
      +(cerrado[i][1] + (cerrado[i + 1][1] - cerrado[i][1]) * f).toFixed(2),
    ]);
  }
  let norte = 0;
  out.forEach((p, j) => {
    if (p[1] < out[norte][1]) norte = j;
  });
  return [...out.slice(norte), ...out.slice(0, norte)];
}

const FORMAS: Partial<Record<FocoMapa, Punto[]>> = {};
/** El contorno que se dibuja en cada foco (el Perú entero o el departamento de la tienda), ya remuestreado. */
export function formaDe(foco: FocoMapa): Punto[] {
  return (FORMAS[foco] ??= remuestrear(foco === "TODAS" ? PERU : DEPARTAMENTO_DE_TIENDA[foco].contorno));
}

export function nombreDeDepartamento(s: SiglaConMapa): string {
  return DEPARTAMENTO_DE_TIENDA[s].nombre;
}

/** Lo que se quiere mostrar del país entero: el Perú con la franja de mar de las etiquetas. */
export const CAJA_PAIS: Caja = [52, 12, 690, 768];

/** Lo que se quiere mostrar en cada foco: el país, o el departamento con aire alrededor (más arriba, para su nombre). */
export function cajaDe(foco: FocoMapa): Caja {
  if (foco === "TODAS") return CAJA_PAIS;
  const pts = formaDe(foco);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = x1 - x0;
  const h = y1 - y0;
  const aire = 0.28;
  return [x0 - w * aire, y0 - h * aire - h * 0.18, w * (1 + 2 * aire), h * (1 + 2 * aire) + h * 0.18].map((v) => +v.toFixed(2)) as Caja;
}

/** El encuadre: la caja centrada y estirada hasta la proporción del espacio (`alto / ancho`). Nunca recorta la caja. */
export function ajustar(c: Caja, proporcion: number): Caja {
  let [x, y, w, h] = c;
  if (h / w > proporcion) {
    const nw = h / proporcion;
    x -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = w * proporcion;
    y -= (nh - h) / 2;
    h = nh;
  }
  return [x, y, w, h];
}

/** Un paso del zoom entre dos cajas: el centro en línea recta y el tamaño en escala logarítmica (para que el acercamiento se
 *  sienta parejo). Entre dos tiendas, a mitad de camino se aleja (`alejar`), sin pasar el tamaño del país. */
export function cajaIntermedia(a: Caja, b: Caja, k: number, alejar: boolean): Caja {
  const bump = alejar ? 1 + 1.5 * Math.sin(Math.PI * k) : 1;
  const w = Math.min(CAJA_PAIS[2], Math.exp(Math.log(a[2]) + (Math.log(b[2]) - Math.log(a[2])) * k) * bump);
  const h = Math.min(CAJA_PAIS[3], Math.exp(Math.log(a[3]) + (Math.log(b[3]) - Math.log(a[3])) * k) * bump);
  const cx = a[0] + a[2] / 2 + (b[0] + b[2] / 2 - (a[0] + a[2] / 2)) * k;
  const cy = a[1] + a[3] / 2 + (b[1] + b[3] / 2 - (a[1] + a[3] / 2)) * k;
  return [cx - w / 2, cy - h / 2, w, h];
}

/** ¿El viaje es de una tienda a otra (los dos extremos acercados)? Entonces el zoom se aleja a mitad de camino. */
export function esEntreTiendas(a: Caja, b: Caja): boolean {
  return a[2] < 420 && b[2] < 420 && (a[0] !== b[0] || a[1] !== b[1]);
}

export function interpolarForma(a: readonly Punto[], b: readonly Punto[], k: number): Punto[] {
  if (a.length !== b.length) return [...b];
  return a.map((p, i) => [p[0] + (b[i][0] - p[0]) * k, p[1] + (b[i][1] - p[1]) * k]);
}

export function poligono(pts: readonly (readonly [number, number])[]): string {
  return `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L")}Z`;
}

/** Una cuadrícula de meridianos y paralelos cada `paso` grados que cubre mucho más que el Perú (el mapa llena cualquier
 *  proporción sin que se vean bordes). */
export function trazoDeCuadricula(paso: number, desdeLon: number, hastaLon: number, desdeLat: number, hastaLat: number): string {
  const [x0, y0] = proyectar(desdeLon, desdeLat);
  const [x1, y1] = proyectar(hastaLon, hastaLat);
  let d = "";
  for (let lon = desdeLon; lon <= hastaLon + 1e-9; lon += paso) d += `M${proyectar(lon, 0)[0].toFixed(1)} ${y0.toFixed(0)}V${y1.toFixed(0)}`;
  for (let lat = desdeLat; lat >= hastaLat - 1e-9; lat -= paso) d += `M${x0.toFixed(0)} ${proyectar(0, lat)[1].toFixed(1)}H${x1.toFixed(0)}`;
  return d;
}

/** El arco de un traslado entre dos puntos, curvado tierra adentro. */
export function arcoEntre(a: Punto, b: Punto, curva = 150): string {
  return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${(Math.max(a[0], b[0]) + curva).toFixed(1)} ${((a[1] + b[1]) / 2).toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
}
