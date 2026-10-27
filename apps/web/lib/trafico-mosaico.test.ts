import { describe, expect, it } from "vitest";
import { conIcono, etiquetaQueCabe, franjasDe, squarify } from "./trafico-mosaico";

const area = (b: { w: number; h: number }) => b.w * b.h;

describe("squarify", () => {
  it("cada baldosa ocupa lo que la miraron, y entre todas llenan la vitrina", () => {
    const valores = [40, 25, 12, 9, 6, 5, 2, 1];
    const b = squarify(valores, 800, 400);
    const total = valores.reduce((a, v) => a + v, 0);
    valores.forEach((v, i) => expect(area(b[i])).toBeCloseTo((v / total) * 800 * 400, 6));
    expect(b.reduce((a, x) => a + area(x), 0)).toBeCloseTo(800 * 400, 6);
  });

  it("ninguna baldosa se sale de la vitrina ni se pisa con otra", () => {
    const b = squarify([13, 11, 8, 8, 5, 3, 3, 2, 1, 1], 600, 360);
    for (const x of b) {
      expect(x.x).toBeGreaterThanOrEqual(-1e-9);
      expect(x.y).toBeGreaterThanOrEqual(-1e-9);
      expect(x.x + x.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(x.y + x.h).toBeLessThanOrEqual(360 + 1e-6);
    }
    for (let i = 0; i < b.length; i++)
      for (let j = i + 1; j < b.length; j++) {
        const ancho = Math.min(b[i].x + b[i].w, b[j].x + b[j].w) - Math.max(b[i].x, b[j].x);
        const alto = Math.min(b[i].y + b[i].h, b[j].y + b[j].h) - Math.max(b[i].y, b[j].y);
        expect(ancho > 1e-6 && alto > 1e-6).toBe(false);
      }
  });

  it("las baldosas salen casi cuadradas, no tiras finas", () => {
    const b = squarify([30, 20, 15, 10, 10, 8, 4, 3], 900, 450);
    for (const x of b) expect(Math.max(x.w / x.h, x.h / x.w)).toBeLessThan(4);
  });

  it("una sola prenda llena toda la vitrina", () => {
    expect(squarify([7], 500, 300)).toEqual([{ x: 0, y: 0, w: 500, h: 300 }]);
  });

  it("un cero deja su lugar vacío sin correr a las demás", () => {
    const b = squarify([5, 0, 5], 400, 200);
    expect(area(b[1])).toBe(0);
    expect(area(b[0])).toBeCloseTo(40000, 6);
    expect(area(b[2])).toBeCloseTo(40000, 6);
  });

  it("sin nadie, o sin espacio, no dibuja nada (ni se cuelga)", () => {
    expect(squarify([], 400, 200)).toEqual([]);
    expect(squarify([0, 0], 400, 200).every((x) => area(x) === 0)).toBe(true);
    expect(squarify([3, 2], 0, 200).every((x) => area(x) === 0)).toBe(true);
  });
});

describe("lo que le cabe a una baldosa", () => {
  it("la etiqueta va de grande a nada según su tamaño", () => {
    expect(etiquetaQueCabe(200, 120)).toBe("grande");
    expect(etiquetaQueCabe(120, 70)).toBe("media");
    expect(etiquetaQueCabe(60, 40)).toBe("chica");
    expect(etiquetaQueCabe(30, 30)).toBe("nada");
  });
  it("una baldosa angosta no lleva el nombre: la cifra se cortaría", () => {
    expect(etiquetaQueCabe(100, 70)).toBe("chica");
  });
  it("el ícono, solo con 64 px de lado corto y sin chocar con la etiqueta", () => {
    expect(conIcono(200, 63)).toBe(false);
    expect(conIcono(120, 70)).toBe(false); // nombre y cifra: el ícono quedaría debajo
    expect(conIcono(120, 96)).toBe(true);
    expect(conIcono(70, 70)).toBe(true); // solo la cifra
  });
});

describe("franjasDe", () => {
  const negro = { hex: "#1a1a18", nombre: "Negro" };
  const crema = { hex: "#f5f0e8", nombre: "Crema" };
  it("los colores que eligieron, del más elegido al menos", () => {
    expect(franjasDe([{ ...crema, n: 2 }, { ...negro, n: 9 }], [negro, crema]).map((f) => f.nombre)).toEqual(["Negro", "Crema"]);
  });
  it("un color elegido una vez entre muchos se ve igual (piso del 4 %)", () => {
    const f = franjasDe([{ ...negro, n: 99 }, { ...crema, n: 1 }], []);
    expect(f[1].peso).toBeCloseTo(4, 6);
  });
  it("si nadie eligió color, los del catálogo, todos iguales", () => {
    expect(franjasDe([], [negro, crema])).toEqual([
      { hex: "#f5f0e8", nombre: "Crema", peso: 1 },
      { hex: "#1a1a18", nombre: "Negro", peso: 1 },
    ]);
  });
  it("un color sin su #hex no se dibuja", () => {
    expect(franjasDe([{ hex: null, nombre: "Sin dato", n: 3 }], [{ hex: null, nombre: "Sin dato" }])).toEqual([]);
  });
});
