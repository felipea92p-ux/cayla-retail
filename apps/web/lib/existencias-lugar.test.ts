import { describe, expect, it } from "vitest";
import { filasDelLugar, lugarGuardado, LUGARES, unidadesPorLugar } from "./existencias-lugar";

describe("existencias-lugar", () => {
  it("lo guardado vuelve a «ambos» si falta o es un valor que no existe", () => {
    expect(lugarGuardado(null)).toBe("ambos");
    expect(lugarGuardado(undefined)).toBe("ambos");
    expect(lugarGuardado("taller")).toBe("ambos");
    expect(lugarGuardado("piso")).toBe("piso");
    expect(lugarGuardado("almacen")).toBe("almacen");
  });

  it("cada opción deja las filas de su lugar; «ambos», las dos", () => {
    expect(filasDelLugar("piso", true).map((f) => f.clave)).toEqual(["piso"]);
    expect(filasDelLugar("almacen", true).map((f) => f.clave)).toEqual(["almacen"]);
    expect(filasDelLugar("ambos", true).map((f) => f.clave)).toEqual(["piso", "almacen"]);
    // Ida y vuelta: volver a «ambos» deja la tarjeta como al principio.
    expect(filasDelLugar("ambos", true)).toEqual(filasDelLugar(LUGARES[2].valor, true));
  });

  it("donde la sede no separa, siempre una fila «Disponibles», elija lo que elija", () => {
    for (const { valor } of LUGARES) expect(filasDelLugar(valor, false)).toEqual([{ clave: "piso", texto: "Disponibles" }]);
  });

  it("suma solo lo libre de cada lugar, sin negativos ni nulos", () => {
    expect(
      unidadesPorLugar([
        { pisoDisponible: 3, almacenDisponible: 2 },
        { pisoDisponible: null, almacenDisponible: 5 },
        { pisoDisponible: -1, almacenDisponible: null },
      ])
    ).toEqual({ piso: 3, almacen: 7 });
    expect(unidadesPorLugar([])).toEqual({ piso: 0, almacen: 0 });
  });
});
