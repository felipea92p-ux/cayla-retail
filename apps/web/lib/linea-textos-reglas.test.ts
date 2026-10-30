import { describe, expect, it } from "vitest";
import { filasDeNotas, lugarDeLaCifra, muestrearTrazo, separarAlFinal, type NotaParaUbicar } from "./linea-textos-reglas";

/** Lo que el contrato promete de un acomodo cualquiera: nada se toca y ningún hilo atraviesa otra nota. */
function cumple(notas: readonly NotaParaUbicar[], min: number, max: number) {
  const u = filasDeNotas(notas, min, max);
  u.forEach((a, i) => {
    if (a.fila < 0) return;
    expect(a.desde).toBeGreaterThanOrEqual(min);
    expect(a.hasta).toBeLessThanOrEqual(max + 0.001);
    expect(notas[i]!.x).toBeGreaterThanOrEqual(a.desde - 6);
    expect(notas[i]!.x).toBeLessThanOrEqual(a.hasta + 6);
    u.forEach((b, j) => {
      if (j === i || b.fila < 0) return;
      if (a.fila === b.fila) expect(a.hasta + 16 <= b.desde || b.hasta + 16 <= a.desde).toBe(true);
      // El hilo de la de más arriba baja por las filas de abajo: no puede cruzar una nota de ellas.
      if (a.fila > b.fila) expect(notas[i]!.x <= b.desde - 6 || notas[i]!.x >= b.hasta + 6).toBe(true);
    });
  });
  return u;
}

describe("las notas en su franja", () => {
  it("una sola empieza en su punto, en la fila de abajo", () => {
    expect(filasDeNotas([{ x: 100, ancho: 80 }], 0, 600)).toEqual([{ fila: 0, desde: 94, hasta: 174 }]);
  });

  it("si caben lado a lado, todas en una fila", () => {
    expect(cumple([{ x: 50, ancho: 120 }, { x: 300, ancho: 120 }, { x: 480, ancho: 100 }], 0, 600).map((n) => n.fila)).toEqual([0, 0, 0]);
  });

  it("si el punto de una cae bajo el texto de la otra, la de la izquierda sube y su hilo pasa por fuera", () => {
    expect(cumple([{ x: 50, ancho: 200 }, { x: 120, ancho: 100 }], 0, 600)).toEqual([
      { fila: 1, desde: 44, hasta: 244 },
      { fila: 0, desde: 114, hasta: 214 },
    ]);
  });

  it("junto al borde derecho termina dentro del gráfico, sobre su punto", () => {
    expect(cumple([{ x: 590, ancho: 100 }], 0, 600)).toEqual([{ fila: 0, desde: 500, hasta: 600 }]);
  });

  it("tres apretadas en un gráfico angosto se escalonan; la que no cabe en tres filas no se escribe", () => {
    expect(cumple([{ x: 52, ancho: 94 }, { x: 115, ancho: 92 }, { x: 186, ancho: 90 }], 4, 273).every((n) => n.fila >= 0)).toBe(true);
    expect(cumple([{ x: 10, ancho: 200 }, { x: 20, ancho: 200 }, { x: 30, ancho: 200 }, { x: 40, ancho: 200 }], 0, 220).filter((n) => n.fila < 0).length).toBeGreaterThan(0);
  });

  it("cualquier acomodo cumple el contrato (casos al azar con semilla)", () => {
    let s = 7;
    const azar = () => ((s = (s * 1664525 + 1013904223) % 4294967296), s / 4294967296);
    for (let caso = 0; caso < 200; caso++) {
      const ancho = 250 + azar() * 1200;
      const notas = Array.from({ length: 1 + Math.floor(azar() * 3) }, () => ({ x: 10 + azar() * (ancho - 20), ancho: 60 + azar() * 180 }));
      cumple(notas, 4, ancho - 4);
    }
  });
});

describe("la cifra de un punto", () => {
  const dentro = { x: 0, y: 0, ancho: 400, alto: 200 };

  it("sin nada alrededor, a la derecha y abajo", () => {
    expect(lugarDeLaCifra(100, 100, 60, 15, [], dentro)).toEqual({ x: 111, y: 120, anclaje: "start" });
  });

  it("si una línea pasa por ahí, en el siguiente lugar libre", () => {
    const linea = muestrearTrazo([[100, 115], [200, 115]]);
    expect(lugarDeLaCifra(100, 100, 60, 15, linea, dentro)).toEqual({ x: 111, y: 91, anclaje: "start" });
  });

  it("no se sale del gráfico: pegada al borde derecho va a la izquierda", () => {
    expect(lugarDeLaCifra(380, 100, 60, 15, [], dentro)).toMatchObject({ x: 369, anclaje: "end" });
  });

  it("si ningún lugar está libre, el que menos pisa", () => {
    const todo: [number, number][] = [];
    for (let x = 40; x <= 160; x += 3) for (let y = 50; y <= 150; y += 3) if (!(x > 110 && y > 100 && y < 125)) todo.push([x, y]);
    // Solo la derecha-abajo tiene menos puntos encima.
    expect(lugarDeLaCifra(100, 100, 40, 15, todo, dentro)).toMatchObject({ x: 111, y: 120 });
  });
});

describe("los trazos y las cifras del final", () => {
  it("un trazo se muestrea cada 3 px, con sus dos puntas", () => {
    expect(muestrearTrazo([[0, 0], [9, 0]])).toEqual([[0, 0], [3, 0], [6, 0], [9, 0]]);
    expect(muestrearTrazo([])).toEqual([]);
  });

  it("dos cifras lejos no se mueven; juntas se separan alrededor de su centro sin cambiar cuál va arriba", () => {
    expect(separarAlFinal([100, 200])).toEqual([100, 200]);
    expect(separarAlFinal([100, 105])).toEqual([95, 110]);
    expect(separarAlFinal([105, 100])).toEqual([110, 95]);
    expect(separarAlFinal([100, 101, 102])).toEqual([86, 101, 116]);
  });
});
