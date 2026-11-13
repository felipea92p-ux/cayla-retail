// Estados financieros ▸ la línea de los meses (ADR-0611; maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`). Solo geometría: de una serie de valores salen el trazo, el
// área y dónde cae cada mes, en un lienzo de 1000 × 300 que el SVG estira a lo ancho.

export const LIENZO = { ancho: 1000, alto: 300 } as const;

export type PuntoDeLinea = { etiqueta: string; nombre: string; valor: number };

/** Una curva suave por los puntos, sin pasarse de ninguno. */
function curva(pts: readonly (readonly [number, number])[]): string {
  let d = `M${pts[0]![0]},${pts[0]![1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const k = 0.18;
    d += ` C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export type GeometriaDeLinea = {
  trazo: string;
  area: string;
  /** Dónde cae cada mes, en % del lienzo. */
  puntos: { x: number; y: number }[];
  /** Dónde cae el cero, en % del alto. `null` si ningún mes baja de cero: entonces no se dibuja. */
  cero: number | null;
};

/** Con un mes en pérdida el cero se ve y el trazo cambia de color justo ahí. Si no, el piso queda más abajo que el peor mes, para que la línea respire. */
export function geometriaDeLinea(valores: readonly number[]): GeometriaDeLinea | null {
  if (valores.length < 2) return null;
  const { ancho: A, alto: B } = LIENZO;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const pad = (max - min) * 0.16 || 1;
  const lo = min < 0 ? min - pad : min - (max - min) * 0.5 - (max === min ? 1 : 0);
  // Con todos los meses en pérdida el techo quedaba bajo cero y la raya del cero se salía por arriba del gráfico, encima del chip (Felipe 2026-11-06):
  // el cero siempre cae dentro, con aire por encima para su etiqueta.
  const hi = min < 0 ? Math.max(max, 0) + pad * 2.2 : max + pad * 2.2;
  const X = (i: number) => ((i + 0.5) / valores.length) * A;
  const Y = (v: number) => B - ((v - lo) / (hi - lo)) * B;
  const pts = valores.map((v, i) => [X(i), Y(v)] as const);
  const conCero = min < 0;
  const y0 = Y(0);
  const extremos = [[0, pts[0]![1]] as const, ...pts, [A, pts.at(-1)![1]] as const];
  const trazo = curva(extremos);
  const base = conCero ? y0 : B;
  return {
    trazo,
    area: `${trazo} L${A},${base} L0,${base} Z`,
    puntos: pts.map(([x, y]) => ({ x: (x / A) * 100, y: (y / B) * 100 })),
    cero: conCero ? (y0 / B) * 100 : null,
  };
}

/** La franja que marca un período que no es un mes entero, en % del ancho. Cada mes ocupa lo mismo; dentro de él, los días avanzan parejo. */
export function franjaDelPeriodo(meses: readonly string[], desde: string, hasta: string): { de: number; a: number } | null {
  const posicion = (iso: string, alFinal: boolean) => {
    const mes = iso.slice(0, 7);
    const i = meses.indexOf(mes);
    if (i < 0) return null;
    const [anio, m] = mes.split("-").map(Number) as [number, number];
    const dias = new Date(Date.UTC(anio, m, 0)).getUTCDate();
    const dia = Number(iso.slice(8, 10)) - (alFinal ? 0 : 1);
    return ((i + dia / dias) / meses.length) * 100;
  };
  const de = posicion(desde, false);
  const a = posicion(hasta, true);
  // Si empieza antes de la línea, la franja nace en su borde.
  if (a === null) return null;
  return { de: de ?? 0, a };
}
