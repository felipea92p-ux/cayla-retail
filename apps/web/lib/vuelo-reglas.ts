// El vuelo de la prenda a «Tu compra» (Felipe 2026-10-28, maqueta docs/maquetas/mis-compras-prendas-2026-10/): al agregar una prenda,
// su miniatura sale de donde se anotó, cruza en arco y aterriza en su línea de «Tu compra» (en el celular, en la barra de abajo); el
// total cuenta hasta la cifra nueva. Aquí vive solo la cuenta, sin DOM: dónde empieza, a dónde llega, cuánto tarda y cómo cuenta el total.

export type Caja = { left: number; top: number; width: number; height: number };

export type TrayectoDelVuelo = {
  /** Cuánto se corre el centro de la miniatura, de un punto al otro. */
  dx: number;
  dy: number;
  /** Con qué tamaño aterriza, respecto al que salió (nunca menos de un tercio, para que no se pierda de vista). */
  escala: number;
  /** Cuánto sube en el arco antes de bajar a su lugar. */
  subida: number;
  /** Cuánto dura: lo justo para que se vea, un poco más si el camino es largo. */
  ms: number;
};

const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const centro = (c: Caja) => ({ x: c.left + c.width / 2, y: c.top + c.height / 2 });

export function trayectoDelVuelo(origen: Caja, destino: Caja): TrayectoDelVuelo {
  const o = centro(origen);
  const d = centro(destino);
  const dx = d.x - o.x;
  const dy = d.y - o.y;
  const camino = Math.hypot(dx, dy);
  return {
    dx,
    dy,
    escala: origen.width > 0 ? entre(destino.width / origen.width, 0.34, 1) : 1,
    subida: Math.min(70, Math.abs(dy) * 0.35 + 24),
    ms: Math.round(entre(480 + camino * 0.12, 520, 680)),
  };
}

/** La cifra del total mientras cuenta de `de` a `a`: arranca rápido y frena (`x` va de 0 a 1). */
export function valorDeLaCuenta(de: number, a: number, x: number): number {
  const t = entre(x, 0, 1);
  return de + (a - de) * (1 - Math.pow(1 - t, 3));
}
