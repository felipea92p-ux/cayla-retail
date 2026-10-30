// Dónde va cada texto de `<Linea>` para que ninguna línea lo tape (Felipe 2026-10-30, al elegir la C2 de «Cuándo» en Gastos: «que se lea
// mejor el texto, en distintos tamaños se llega a tapar por la línea»). Lógica pura: el componente mide los textos y dibuja; aquí se decide.
//
// CONTRATO
//   PROMETE: las notas (`<Linea notas>`) van en una franja SOBRE el gráfico, nunca encima de un trazo, cada una en una fila donde no toca
//            a otra y con su hilo bajando a su punto sin atravesar otra nota; la cifra de un punto va en el primer lugar libre a su
//            alrededor (o, si no hay ninguno, en el que menos pisa); dos cifras al final de las líneas no se encima.
//   NO HACE: no mueve ningún dato; no mide el texto (lo hace el componente con la letra de verdad).

export type NotaParaUbicar = { x: number; ancho: number };
/** Dónde quedó una nota: su fila (0 = la más cercana al gráfico; −1 = no cabe) y de dónde a dónde va. */
export type NotaUbicada = { fila: number; desde: number; hasta: number };

/** El texto empieza (o termina) a 6 px de su hilo, y dos notas de una misma fila se separan 16 px. */
const SANGRIA = 6;
const AIRE = 16;

/**
 * Las filas de las notas. Son pocas (las de `<Linea>` no pasan de tres o cuatro), así que se prueban todas las combinaciones —fila ×
 * hacia dónde crece × escribirla o no— y gana la que escribe más notas; a igual cantidad, la de menos filas; y a igual, la que más notas
 * empieza en su punto (se lee de izquierda a derecha). Devuelve en el mismo orden que `notas`. `min`/`max`: el ancho disponible en px.
 */
export function filasDeNotas(notas: readonly NotaParaUbicar[], min: number, max: number, maxFilas = 3): NotaUbicada[] {
  type Puesta = NotaUbicada & { i: number; x: number; derecha: boolean };
  // Dos notas conviven si en la misma fila no se tocan y si el hilo de la de más arriba no atraviesa a la de más abajo.
  const conviven = (o: Puesta, c: Puesta) =>
    !(o.fila === c.fila && c.desde < o.hasta + AIRE && o.desde < c.hasta + AIRE) &&
    !(o.fila < c.fila && c.x > o.desde - SANGRIA && c.x < o.hasta + SANGRIA) &&
    !(o.fila > c.fila && o.x > c.desde - SANGRIA && o.x < c.hasta + SANGRIA);
  let mejor: Puesta[] = [];
  let puntos = -Infinity;
  const buscar = (i: number, puestas: Puesta[]) => {
    if (i === notas.length) {
      const p = puestas.filter((o) => o.fila >= 0);
      const s = p.length * 100 - Math.max(0, ...p.map((o) => o.fila + 1)) * 10 - p.filter((o) => o.derecha).length;
      if (s > puntos) {
        puntos = s;
        mejor = puestas;
      }
      return;
    }
    const n = notas[i]!;
    for (let fila = 0; fila < maxFilas; fila++)
      for (const derecha of [false, true]) {
        const desde = Math.max(min, Math.min(max - n.ancho, derecha ? n.x - n.ancho + SANGRIA : n.x - SANGRIA));
        const c: Puesta = { i, x: n.x, fila, desde, hasta: desde + n.ancho, derecha };
        if (puestas.every((o) => o.fila < 0 || conviven(o, c))) buscar(i + 1, [...puestas, c]);
      }
    buscar(i + 1, [...puestas, { i, x: n.x, fila: -1, desde: 0, hasta: 0, derecha: false }]);
  };
  buscar(0, []);
  return mejor.sort((a, b) => a.i - b.i).map(({ fila, desde, hasta }) => ({ fila, desde, hasta }));
}

/** Los puntos de un trazo cada `paso` px: con ellos se sabe si un texto lo pisa. */
export function muestrearTrazo(puntos: readonly (readonly [number, number])[], paso = 3): [number, number][] {
  const salida: [number, number][] = puntos.length ? [[puntos[0]![0], puntos[0]![1]]] : [];
  for (let i = 1; i < puntos.length; i++) {
    const [x0, y0] = puntos[i - 1]!;
    const [x1, y1] = puntos[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / paso));
    for (let k = 1; k <= n; k++) salida.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return salida;
}

export type Caja = { x: number; y: number; ancho: number; alto: number };
export type Anclaje = "start" | "middle" | "end";

/** Los lugares alrededor de un punto, en orden de preferencia: a la derecha abajo, a la derecha arriba, a la izquierda arriba… */
const LUGARES: readonly (readonly [number, number, Anclaje])[] = [
  [11, 20, "start"],
  [11, -9, "start"],
  [-11, -9, "end"],
  [-11, 22, "end"],
  [0, -15, "middle"],
  [0, 30, "middle"],
  [11, 36, "start"],
  [-11, -26, "end"],
  [-11, 38, "end"],
  [11, -26, "start"],
];

/**
 * Dónde va la cifra de un punto (`px`, `py`): en el primer lugar libre (a 4 px de todo punto de `obstaculos` y dentro de `dentro`),
 * probando primero `primero` —el lugar de siempre de esa pieza, para que una cifra que hoy no choca con nada no se mueva— y después
 * `LUGARES`; si ninguno está libre, en el que menos pisa (el borde de papel del texto la deja leer igual). `x`/`y` son los de un
 * `<text>` (la línea de base), con su `anclaje`.
 */
export function lugarDeLaCifra(
  px: number,
  py: number,
  ancho: number,
  alto: number,
  obstaculos: readonly (readonly [number, number])[],
  dentro: Caja,
  primero?: readonly [number, number, Anclaje],
): { x: number; y: number; anclaje: Anclaje } {
  const pisa = (c: Caja) => {
    const fuera = c.x < dentro.x || c.x + c.ancho > dentro.x + dentro.ancho || c.y < dentro.y || c.y + c.alto > dentro.y + dentro.alto;
    return (fuera ? 1e6 : 0) + obstaculos.filter(([ox, oy]) => ox > c.x - 4 && ox < c.x + c.ancho + 4 && oy > c.y - 4 && oy < c.y + c.alto + 4).length;
  };
  const lugares = primero ? [primero, ...LUGARES] : LUGARES;
  let mejor = { x: px + lugares[0]![0], y: py + lugares[0]![1], anclaje: lugares[0]![2], pisa: Infinity };
  for (const [dx, dy, anclaje] of lugares) {
    const x = px + dx;
    const izquierda = anclaje === "end" ? x - ancho : anclaje === "middle" ? x - ancho / 2 : x;
    // La caja del texto va de la línea de base hacia arriba (alto − 3) y baja 3 px (la cola de la «g»).
    const p = pisa({ x: izquierda, y: py + dy - alto + 3, ancho, alto });
    if (p < mejor.pisa) mejor = { x, y: py + dy, anclaje, pisa: p };
    if (p === 0) break;
  }
  return { x: mejor.x, y: mejor.y, anclaje: mejor.anclaje };
}

/**
 * Las cifras al final de las líneas (la referencia, el «si sigue así»), a su altura (`ys`, en el orden que llegan): las que quedan a
 * menos de `minimo` px se separan alrededor de su centro, sin cambiar cuál va arriba. Devuelve en el mismo orden.
 */
export function separarAlFinal(ys: readonly number[], minimo = 15): number[] {
  const orden = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  // Bloques de las que chocan, cada uno centrado en el promedio de los suyos (como `separarMarcas`, de arriba abajo).
  const bloques: { suma: number; n: number; de: number[] }[] = [];
  for (const o of orden) {
    bloques.push({ suma: o.y, n: 1, de: [o.i] });
    for (;;) {
      const b = bloques.at(-1)!;
      const a = bloques.at(-2);
      if (!a) break;
      const finA = a.suma / a.n + ((a.n - 1) * minimo) / 2;
      const inicioB = b.suma / b.n - ((b.n - 1) * minimo) / 2;
      if (inicioB - finA >= minimo) break;
      bloques.pop();
      a.suma += b.suma;
      a.n += b.n;
      a.de.push(...b.de);
    }
  }
  const salida = Array<number>(ys.length).fill(0);
  for (const b of bloques) {
    const centro = b.suma / b.n;
    b.de.forEach((i, k) => (salida[i] = centro + (k - (b.n - 1) / 2) * minimo));
  }
  return salida;
}
