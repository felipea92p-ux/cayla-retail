import { describe, expect, it } from "vitest";
import { filasDelLugar, lugarGuardado, LUGARES, tarjetasDelLugar, textosDelLugar, unidadesPorLugar } from "./existencias-lugar";

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

    it("«Ambos» o una sede que no separa: la lista tal cual", () => {
      expect(tarjetasDelLugar(modelos, "ambos", true)).toEqual({ modelos, escondidas: 0 });
      expect(tarjetasDelLugar(modelos, "piso", false)).toEqual({ modelos, escondidas: 0 });
      expect(tarjetasDelLugar(modelos, "almacen", false)).toEqual({ modelos, escondidas: 0 });
    });

    it("una tarjeta con todos sus colores colgados es la misma (no se copia)", () => {
      expect(tarjetasDelLugar(modelos, "piso", true).modelos[1]).toBe(modelos[2]);
    });
  });

  describe("«Almacén» esconde lo que no tiene nada guardado", () => {
    const talla = (almacen: number | null, piso = 0) => ({ pisoDisponible: piso, almacenDisponible: almacen });
    const guardado = { clave: "a-negro", tallas: [talla(0, 3), talla(4)] };
    const soloPiso = { clave: "a-beige", tallas: [talla(0, 2), talla(null, 1)] };
    const modelos = [
      { clave: "a", colores: [guardado, soloPiso] },
      { clave: "b", colores: [{ clave: "b-rojo", tallas: [talla(0, 5)] }] },
      { clave: "c", colores: [{ clave: "c-azul", tallas: [talla(1)] }] },
    ];

    it("mira el almacén, no el piso: saca el color y la tarjeta sin nada guardado aunque tengan colgado", () => {
      const r = tarjetasDelLugar(modelos, "almacen", true);
      expect(r.modelos.map((m) => m.clave)).toEqual(["a", "c"]);
      expect(r.modelos[0].colores).toEqual([guardado]);
      expect(r.escondidas).toBe(1);
    });

    it("el mismo modelo se esconde distinto en cada lugar", () => {
      expect(tarjetasDelLugar(modelos, "piso", true).modelos.map((m) => m.clave)).toEqual(["a", "b"]);
    });
  });

  it("cada lugar habla con sus palabras, en singular y en plural", () => {
    expect(textosDelLugar("piso", 1).aviso).toBe("1 prenda sin nada colgado no se muestra");
    expect(textosDelLugar("almacen", 3).aviso).toBe("3 prendas sin nada guardado no se muestran");
    expect(textosDelLugar("piso", 2).vacioTitulo).toBe("Nada colgado en el piso");
    expect(textosDelLugar("almacen", 2).vacioTitulo).toBe("Nada guardado en el almacén");
    expect(textosDelLugar("almacen", 1).vacioFrase).toBe("La prenda de esta lista no tiene nada guardado en el almacén.");
  });
});
