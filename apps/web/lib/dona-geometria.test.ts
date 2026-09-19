import { describe, it, expect } from "vitest";
import { arcosDona, arcoDeMarca, CIRCUNFERENCIA } from "./dona-geometria";

describe("arcosDona", () => {
  it("reparte la vuelta entera: arcos + los dos huecos suman la circunferencia", () => {
    const [a, b] = arcosDona([413, 537]); // el caso real de la caja: 43% / 57%
    expect([a!, b!].map((x) => Math.round(x.frac * 100))).toEqual([43, 57]);
    const huecoAB = b!.inicio - (a!.inicio + a!.largo);
    const huecoBA = CIRCUNFERENCIA - (b!.inicio + b!.largo) + a!.inicio; // el que cierra la vuelta
    expect(huecoAB).toBeCloseTo(huecoBA, 6); // simétricos: ninguno se ve más ancho
    expect(huecoAB).toBeGreaterThan(2);
    expect(huecoAB).toBeLessThan(3.2); // ~2,2° del anillo, ~2 px al tamaño de la pantalla
    expect(a!.largo + b!.largo + huecoAB + huecoBA).toBeCloseTo(CIRCUNFERENCIA, 6);
  });

  it("un solo método cierra el anillo, sin hueco", () => {
    const [a] = arcosDona([950]);
    expect(a!.largo).toBeCloseTo(CIRCUNFERENCIA, 6);
    expect(a!.inicio).toBe(0);
  });

  it("una porción minúscula igual se ve", () => {
    const arcos = arcosDona([1000, 0.01]);
    expect(arcos[1]!.largo).toBeGreaterThanOrEqual(1.5);
  });

  it("sin plata no hay arcos (evita dividir entre cero)", () => {
    expect(arcosDona([])).toEqual([]);
    expect(arcosDona([0, 0])).toEqual([]);
  });

  it("el arco activo se adelanta hacia afuera, por su propio lado", () => {
    // Mitad y mitad: el primero ocupa de las 12 a las 6 por la derecha, el segundo por la
    // izquierda. El anillo se dibuja rotado -90° (pantalla = (y, -x) del eje local), así que
    // "hacia la derecha" en pantalla es dy > 0 en el eje local.
    const [a, b] = arcosDona([1, 1]);
    expect(a!.dy).toBeGreaterThan(0);
    expect(b!.dy).toBeLessThan(0);
    expect(Math.hypot(a!.dx, a!.dy)).toBeCloseTo(3, 6);
  });
});

describe("arcoDeMarca", () => {
  it("cada marca del bisel vale 1% y sigue a su arco: 43 marcas al primero, 57 al segundo", () => {
    const arcos = arcosDona([43, 57]);
    const duenos = Array.from({ length: 100 }, (_, k) => arcoDeMarca(arcos, k, 100));
    expect(duenos.filter((i) => i === 0)).toHaveLength(43);
    expect(duenos.filter((i) => i === 1)).toHaveLength(57);
    expect(duenos[42]).toBe(0);
    expect(duenos[43]).toBe(1);
  });

  it("nunca se sale del arreglo aunque las fracciones sumen 0,9999…", () => {
    expect(arcoDeMarca(arcosDona([1, 1, 1]), 99, 100)).toBe(2);
  });
});
