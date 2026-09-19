// Geometría de las visualizaciones de las tarjetas del Resumen (spec §7). Pura: los componentes
// solo dibujan lo que sale de acá, y se prueba sin navegador.

/** El eje de horas de las tarjetas: la jornada de las tiendas, de 10 h a 18 h. Una venta
 *  fuera de ese rango se pega al borde y el acumulado del día la sigue contando. */
export const HORA_INICIO = 10;
export const HORA_FIN = 18;

/** Una venta en la hora de reloj de Lima con decimales (13:09 → 13.15). */
export type VentaEnHora = { hora: number; monto: number };

const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const redondear = (n: number) => Math.round(n * 10) / 10;

/** Dónde cae una venta sobre el eje de 10 h a 18 h, de 0 a 100 %. */
export function posicionEnEje(hora: number): number {
  return entre(((hora - HORA_INICIO) / (HORA_FIN - HORA_INICIO)) * 100, 0, 100);
}

/** La línea del acumulado: una marca por hora en punto desde las 10 h y un último punto en la
 *  hora de `hasta` (ahora). `x` va de 0 a 1 sobre el eje. Pasadas las 18 h la línea termina en
 *  el borde con el total del día, incluido lo vendido después de las 18 h. */
export function acumuladoPorHora(ventas: VentaEnHora[], hasta: number): { x: number; acumulado: number }[] {
  const tope = entre(hasta, HORA_INICIO, HORA_FIN);
  const vendidoHasta = (hora: number) => ventas.filter((v) => v.hora <= hora).reduce((suma, v) => suma + v.monto, 0);
  const puntos: { x: number; acumulado: number }[] = [];
  for (let h = HORA_INICIO; h < tope; h++) puntos.push({ x: (h - HORA_INICIO) / (HORA_FIN - HORA_INICIO), acumulado: vendidoHasta(h) });
  puntos.push({ x: (tope - HORA_INICIO) / (HORA_FIN - HORA_INICIO), acumulado: vendidoHasta(hasta) });
  return puntos;
}

/** La altura (y) de un valor sobre el lienzo de 36: 0 abajo (y = 34) y el máximo arriba (y = 4). */
export function alturaEnLienzo(valor: number, maximo: number, alto = 36): number {
  return maximo > 0 ? alto - 2 - (valor / maximo) * (alto - 6) : alto - 2;
}

/** El trazo SVG («M0 34 L25 34 …») de una serie sobre un lienzo de 200 × 36. El máximo lo pone
 *  quien dibuja, común a las dos líneas, para que «hoy» y «la semana pasada» se comparen a
 *  simple vista. */
export function trazoDeSerie(puntos: { x: number; acumulado: number }[], maximo: number, ancho = 200, alto = 36): string {
  return puntos.map((p, i) => `${i === 0 ? "M" : "L"}${redondear(p.x * ancho)} ${redondear(alturaEnLienzo(p.acumulado, maximo, alto))}`).join(" ");
}

/** Cuántas ventas caben como barras: con más, se dibujan las últimas. */
export const MAX_BARRAS = 16;

/** Las barras del ticket: cada una es una venta, la más alta mide 100 % y la línea punteada
 *  marca el promedio de las que se ven. Una venta chica nunca baja de 4 %: no desaparece. */
export function barrasDeTicket(totales: number[]): { alturas: number[]; promedio: number } {
  const visibles = totales.slice(-MAX_BARRAS);
  const maximo = Math.max(0, ...visibles);
  if (visibles.length === 0 || maximo <= 0) return { alturas: visibles.map(() => 0), promedio: 0 };
  const promedio = visibles.reduce((suma, t) => suma + t, 0) / visibles.length;
  return { alturas: visibles.map((t) => (t > 0 ? Math.max(4, (t / maximo) * 100) : 0)), promedio: (promedio / maximo) * 100 };
}
