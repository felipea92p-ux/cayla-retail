import { describe, expect, it } from "vitest";
import { airePara } from "./posicion-lista-reglas";

// La parte pura de `usePosicionLista` (components/ui/useAnclaje.ts). Los números salen de las capturas del iPhone del 2026-11-01:
// los filtros de Productos con el teclado abierto, donde la lista abría hacia arriba y la hoja la cortaba por arriba.
const base = { separacion: 6, alto: 288 };

describe("airePara · sin hoja que recorte (la ventana entera)", () => {
  it("abre hacia abajo si cabe", () => {
    const r = airePara({ ...base, controlTop: 100, controlBottom: 140, techo: 0, piso: 800 });
    expect(r.haciaAbajo).toBe(true);
    expect(r.maxHeight).toBe(288);
  });

  it("abre hacia arriba si abajo no alcanza y arriba hay más", () => {
    const r = airePara({ ...base, controlTop: 600, controlBottom: 640, techo: 0, piso: 700 });
    expect(r.haciaAbajo).toBe(false);
    expect(r.maxHeight).toBe(288);
  });

  it("hacia abajo conserva el mínimo de 120 px aunque sobre poco aire (lo demás se desplaza)", () => {
    const r = airePara({ ...base, controlTop: 100, controlBottom: 140, techo: 90, piso: 180 });
    expect(r.haciaAbajo).toBe(true);
    expect(r.maxHeight).toBe(120);
  });

  it("`entero` (el calendario) solo abre hacia abajo si cabe entero", () => {
    const aprieta = { ...base, alto: 300, controlTop: 300, controlBottom: 340, techo: 0, piso: 560 };
    expect(airePara({ ...aprieta, entero: true }).haciaAbajo).toBe(false);
    expect(airePara({ ...aprieta, entero: false }).haciaAbajo).toBe(true);
  });
});

describe("airePara · lista dentro de una hoja que la recorta", () => {
  it("la lista hacia arriba no pasa del borde de la hoja (caso del iPhone: hoja desde y=90, píldora en y=285)", () => {
    // Antes: arriba = 285 − 0 − 14 = 271 → una lista de 271 px cuyo tope (y=8) quedaba 82 px bajo el borde de la hoja, cortada.
    const sinHoja = airePara({ ...base, controlTop: 285, controlBottom: 331, techo: 0, piso: 330 });
    expect(sinHoja.haciaAbajo).toBe(false);
    expect(sinHoja.maxHeight).toBe(271);
    // Ahora el techo es el borde de la hoja: caben 285 − 90 − 14 = 181 px, y el buscador queda a la vista.
    const conHoja = airePara({ ...base, controlTop: 285, controlBottom: 331, techo: 90, piso: 330, recortada: true });
    expect(conHoja.haciaAbajo).toBe(false);
    expect(conHoja.maxHeight).toBe(181);
  });

  it("hoja de media altura con el filtro al pie: usa el aire que hay dentro de la hoja", () => {
    const r = airePara({ ...base, controlTop: 540, controlBottom: 580, techo: 380, piso: 640, recortada: true });
    expect(r.haciaAbajo).toBe(false);
    expect(r.maxHeight).toBe(540 - 380 - 6 - 8);
  });

  it("un aire de pocos píxeles no deja una lista inservible: mínimo de 96 px en las dos direcciones", () => {
    const arriba = airePara({ ...base, controlTop: 400, controlBottom: 440, techo: 380, piso: 430, recortada: true });
    expect(arriba.maxHeight).toBe(96);
    const abajo = airePara({ ...base, controlTop: 100, controlBottom: 140, techo: 90, piso: 150, recortada: true });
    expect(abajo.maxHeight).toBe(96);
  });

  it("con aire de sobra, la hoja no cambia nada", () => {
    const libre = airePara({ ...base, controlTop: 100, controlBottom: 140, techo: 0, piso: 800 });
    const conHoja = airePara({ ...base, controlTop: 100, controlBottom: 140, techo: 0, piso: 800, recortada: true });
    expect(conHoja).toEqual(libre);
  });
});
