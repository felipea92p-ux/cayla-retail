import { describe, expect, it } from "vitest";
import { desplazamientos, indiceSiguiente } from "./comprobantes-lista-movimiento";

describe("desplazamientos (FLIP)", () => {
  it("solo mueve las filas que ya estaban y cambiaron de lugar", () => {
    const antes = new Map([["a", 0], ["b", 60], ["c", 120]]);
    const ahora = new Map([["b", 0], ["c", 60], ["d", 120]]); // «a» sale, «d» entra
    expect(desplazamientos(antes, ahora)).toEqual([
      { id: "b", dy: 60 },
      { id: "c", dy: 60 },
    ]);
  });
  it("una fila que no se movió (o se movió menos de 1 px) no anima", () => {
    const antes = new Map([["a", 10], ["b", 70]]);
    const ahora = new Map([["a", 10], ["b", 70.4]]);
    expect(desplazamientos(antes, ahora)).toEqual([]);
  });
  it("una fila que baja se anima hacia arriba (dy negativo: viene de más arriba)", () => {
    expect(desplazamientos(new Map([["a", 0]]), new Map([["a", 90]]))).toEqual([{ id: "a", dy: -90 }]);
  });
  it("la lista vacía o la primera vez (sin previas) no anima nada", () => {
    expect(desplazamientos(new Map(), new Map([["a", 0]]))).toEqual([]);
    expect(desplazamientos(new Map([["a", 0]]), new Map())).toEqual([]);
  });
});

describe("indiceSiguiente (j / k)", () => {
  it("sin fila activa arranca en la primera, con j o con k", () => {
    expect(indiceSiguiente(-1, 5, 1)).toBe(0);
    expect(indiceSiguiente(-1, 5, -1)).toBe(0);
  });
  it("avanza y retrocede sin salirse de la lista", () => {
    expect(indiceSiguiente(1, 5, 1)).toBe(2);
    expect(indiceSiguiente(1, 5, -1)).toBe(0);
    expect(indiceSiguiente(0, 5, -1)).toBe(0);
    expect(indiceSiguiente(4, 5, 1)).toBe(4);
  });
  it("sin filas no hay a dónde ir", () => {
    expect(indiceSiguiente(-1, 0, 1)).toBe(-1);
  });
});
