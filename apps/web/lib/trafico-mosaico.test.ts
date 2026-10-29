import { describe, expect, it } from "vitest";
import { franjasDe } from "./trafico-mosaico";

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
