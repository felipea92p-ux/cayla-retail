import { describe, expect, it } from "vitest";
import { filasDelLugar, lugarGuardado, LUGARES, tarjetasDelLugar, unidadesPorLugar } from "./existencias-lugar";

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

  describe("«Piso» esconde lo que no tiene nada colgado", () => {
    const talla = (piso: number | null) => ({ pisoDisponible: piso });
    const colgado = { clave: "a-negro", tallas: [talla(0), talla(2)] };
    const guardado = { clave: "a-beige", tallas: [talla(0), talla(null)] };
    const modelos = [
      { clave: "a", colores: [colgado, guardado] },
      { clave: "b", colores: [{ clave: "b-rojo", tallas: [talla(0)] }] },
      { clave: "c", colores: [{ clave: "c-azul", tallas: [talla(1)] }] },
    ];

    it("saca el color sin nada colgado y la tarjeta que se queda sin colores; las tallas en 0 del color que queda siguen", () => {
      const r = tarjetasDelLugar(modelos, "piso", true);
      expect(r.modelos.map((m) => m.clave)).toEqual(["a", "c"]);
      expect(r.modelos[0].colores).toEqual([colgado]);
      expect(r.modelos[0].colores[0].tallas).toHaveLength(2);
      expect(r.escondidas).toBe(1);
    });

    it("«Almacén», «Ambos» o una sede que no separa: la lista tal cual", () => {
      for (const lugar of ["almacen", "ambos"] as const) expect(tarjetasDelLugar(modelos, lugar, true)).toEqual({ modelos, escondidas: 0 });
      expect(tarjetasDelLugar(modelos, "piso", false)).toEqual({ modelos, escondidas: 0 });
    });

    it("una tarjeta con todos sus colores colgados es la misma (no se copia)", () => {
      expect(tarjetasDelLugar(modelos, "piso", true).modelos[1]).toBe(modelos[2]);
    });
  });
});
