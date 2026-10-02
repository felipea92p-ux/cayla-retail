import { describe, expect, it } from "vitest";
import { leerFacetas, opcionesConConteo, textoTramo, tramoActivo } from "./productos-facetas";

describe("productos-facetas — leer lo que devuelve la base", () => {
  it("lee total, facetas, precio y tramos; numeric de Postgres puede venir como texto", () => {
    const f = leerFacetas({
      total: 10,
      facetas: { color: { NEG: 5, AZM: "3" }, marca: { sin: 1 } },
      precio: { min: "64.90", max: 179.9 },
      tramos: [{ desde: null, hasta: 70, n: 2 }, { desde: 150, hasta: null, n: 2 }],
    });
    expect(f).toEqual({
      total: 10,
      facetas: { color: { NEG: 5, AZM: 3 }, marca: { sin: 1 } },
      precio: { min: 64.9, max: 179.9 },
      tramos: [{ desde: null, hasta: 70, n: 2 }, { desde: 150, hasta: null, n: 2 }],
    });
  });

  it("lo que no se entiende se descarta, nunca rompe", () => {
    expect(leerFacetas(null)).toBeNull();
    expect(leerFacetas({ facetas: {} })).toBeNull(); // sin total no hay facetas confiables
    const f = leerFacetas({ total: 3, facetas: { color: { NEG: "x" }, raro: 7 }, precio: null, tramos: [{ desde: null, hasta: null, n: 4 }, { n: 0, hasta: 9 }] });
    expect(f).toEqual({ total: 3, facetas: { color: {} }, precio: null, tramos: [] });
  });
});

describe("productos-facetas — opciones con su número", () => {
  const opciones = [{ valor: "a", texto: "Blusas" }, { valor: "b", texto: "Casacas" }, { valor: "c", texto: "Faldas" }];

  it("esconde las de 0 (los callejones sin salida) y suma el número a las demás", () => {
    expect(opcionesConConteo(opciones, { a: 12, c: 3 })).toEqual([
      { valor: "a", texto: "Blusas", cantidad: 12 },
      { valor: "c", texto: "Faldas", cantidad: 3 },
    ]);
  });

  it("la elegida se queda aunque hoy dé 0: se tiene que poder ver y quitar", () => {
    expect(opcionesConConteo(opciones, { a: 12 }, ["b"]).map((o) => o.valor)).toEqual(["a", "b"]);
  });

  it("sin conteos (la base no respondió), todas como antes: nunca una lista vacía", () => {
    expect(opcionesConConteo(opciones, undefined)).toEqual(opciones);
  });
});

describe("productos-facetas — tramos de precio", () => {
  it("cada tramo dice lo que pide como filtro", () => {
    expect(textoTramo({ desde: null, hasta: 70, n: 2 })).toBe("Hasta S/ 70");
    expect(textoTramo({ desde: 70, hasta: 100, n: 3 })).toBe("S/ 70 – S/ 100");
    expect(textoTramo({ desde: 150, hasta: null, n: 2 })).toBe("Desde S/ 150");
  });

  it("se marca el tramo que es justo el filtro puesto", () => {
    expect(tramoActivo({ desde: 70, hasta: 100, n: 3 }, "70", "100")).toBe(true);
    expect(tramoActivo({ desde: null, hasta: 70, n: 2 }, "", "70")).toBe(true);
    expect(tramoActivo({ desde: null, hasta: 70, n: 2 }, "10", "70")).toBe(false);
  });
});
