import { describe, expect, it } from "vitest";
import { componentesDeMezcla, esCombinado, fondoDeMezcla, fondoDeMezclaEnFranja, fondoDelPunto, tonosDeLasMezclas, mezclaExistente, nombreDeMezcla, normalizarComponentes, puedeAcompanar, tonosDeMezcla } from "./color-combinado";

describe("normalizarComponentes", () => {
  it("acepta la base y de 1 a 3 acompañantes, en mayúsculas y en el orden recibido", () => {
    expect(normalizarComponentes(["cru", " AZU "])).toEqual(["CRU", "AZU"]);
    expect(normalizarComponentes(["CRU", "NEG", "AZU", "ROJ"])).toEqual(["CRU", "NEG", "AZU", "ROJ"]);
  });

  it("rechaza un solo color, cinco, uno repetido, un código mal escrito o algo que no es lista", () => {
    expect(normalizarComponentes(["CRU"])).toBeNull();
    expect(normalizarComponentes(["CRU", "AZU", "NEG", "ROJ", "AZM"])).toBeNull();
    expect(normalizarComponentes(["CRU", "cru"])).toBeNull();
    expect(normalizarComponentes(["CRU", "AZUL"])).toBeNull();
    expect(normalizarComponentes(["CRU", 3])).toBeNull();
    expect(normalizarComponentes("CRU,AZU")).toBeNull();
    expect(normalizarComponentes(undefined)).toBeNull();
  });
});

describe("el punto partido", () => {
  const porCodigo = new Map([
    ["CRU", { hex: "#F3ECE0" }],
    ["AZU", { hex: "#4D91C6" }],
    ["NEG", { hex: "#2D2C2F" }],
    ["SIN", { hex: null }],
  ]);

  it("un color de un tono no es mezcla ni tiene tonos", () => {
    expect(esCombinado({ componentes: null })).toBe(false);
    expect(esCombinado({})).toBe(false);
    expect(tonosDeMezcla({ componentes: null }, porCodigo)).toBeNull();
  });

  it("una mezcla toma los tonos de sus componentes, la base primero", () => {
    expect(esCombinado({ componentes: ["CRU", "AZU"] })).toBe(true);
    expect(tonosDeMezcla({ componentes: ["CRU", "AZU", "NEG"] }, porCodigo)).toEqual(["#F3ECE0", "#4D91C6", "#2D2C2F"]);
  });

  it("si la pantalla no tiene dos tonos, se dibuja lisa", () => {
    expect(tonosDeMezcla({ componentes: ["CRU", "ZZZ"] }, porCodigo)).toBeNull();
    expect(tonosDeMezcla({ componentes: ["CRU", "SIN"] }, porCodigo)).toBeNull();
  });

  it("la base ocupa la mitad y los acompañantes se reparten la otra", () => {
    expect(fondoDeMezcla(["#111111", "#222222"])).toBe("conic-gradient(from 180deg, #111111 0% 50%, #222222 50% 100%)");
    expect(fondoDeMezcla(["#111111", "#222222", "#333333"])).toBe("conic-gradient(from 180deg, #111111 0% 50%, #222222 50% 75%, #333333 75% 100%)");
    expect(fondoDeMezclaEnFranja(["#111111", "#222222", "#333333"])).toBe("linear-gradient(90deg, #111111 0% 50%, #222222 50% 75%, #333333 75% 100%)");
  });
});

describe("armar la mezcla", () => {
  const CRU = { codigo: "CRU", nombre: "Crudo" };
  const AZU = { codigo: "AZU", nombre: "Azur" };
  const NEG = { codigo: "NEG", nombre: "Negro" };
  const ROJ = { codigo: "ROJ", nombre: "Rojo" };
  const AZM = { codigo: "AZM", nombre: "Azul marino" };

  it("el nombre es el que arma la base, con los acompañantes en el orden de su código", () => {
    expect(nombreDeMezcla(CRU, [AZU])).toBe("Crudo con azur");
    expect(nombreDeMezcla(CRU, [NEG, AZU])).toBe("Crudo con azur y negro");
    expect(nombreDeMezcla(CRU, [ROJ, NEG, AZU])).toBe("Crudo con azur, negro y rojo");
    expect(nombreDeMezcla(CRU, [AZM])).toBe("Crudo con azul marino");
    expect(nombreDeMezcla(CRU, [])).toBe("Crudo");
  });

  it("los componentes llevan la base primero y los acompañantes ordenados", () => {
    expect(componentesDeMezcla("CRU", ["NEG", "AZU"])).toEqual(["CRU", "AZU", "NEG"]);
    expect(componentesDeMezcla("NEG", ["AZU"])).toEqual(["NEG", "AZU"]);
  });

  it("encuentra la mezcla que ya existe, y no confunde la base", () => {
    const mezcla = { codigo: "CZU", nombre: "Crudo con azur", componentes: ["CRU", "AZU"] };
    const otra = { codigo: "AZC", nombre: "Azur con crudo", componentes: ["AZU", "CRU"] };
    expect(mezclaExistente([CRU, mezcla, otra], ["CRU", "AZU"])).toBe(mezcla);
    expect(mezclaExistente([CRU, mezcla, otra], ["AZU", "CRU"])).toBe(otra);
    expect(mezclaExistente([CRU, mezcla], ["CRU", "NEG"])).toBeNull();
  });

  it("acompaña cualquier color de un tono menos la base; una mezcla o un desactivado, no", () => {
    expect(puedeAcompanar(AZU, "CRU")).toBe(true);
    expect(puedeAcompanar(CRU, "CRU")).toBe(false);
    expect(puedeAcompanar({ codigo: "CZU", nombre: "Crudo con azur", componentes: ["CRU", "AZU"] }, "NEG")).toBe(false);
    expect(puedeAcompanar({ ...ROJ, activo: false }, "CRU")).toBe(false);
  });
});

describe("el punto partido en las grillas (Productos, Existencias, Vender)", () => {
  const carta = [
    { codigo: "HUE", nombre: "Hueso", hex: "#EFE8DA", componentes: null },
    { codigo: "AZU", nombre: "Azul", hex: "#1F3A93", componentes: null },
    { codigo: "NEG", nombre: "Negro", hex: "#111111", componentes: null },
    { codigo: "HAZ", nombre: "Hueso con azul", hex: "#EFE8DA", componentes: ["HUE", "AZU"] },
    { codigo: "HAN", nombre: "Hueso con azul y negro", hex: "#EFE8DA", componentes: ["HUE", "AZU", "NEG"] },
    // Un acompañante que la carta no trae (otra pantalla lo filtró): no se puede partir y queda fuera.
    { codigo: "HXX", nombre: "Hueso con algo", hex: "#EFE8DA", componentes: ["HUE", "XXX"] },
  ];

  it("solo trae las mezclas que se pueden partir, por código o por nombre, la base primero", () => {
    expect(tonosDeLasMezclas(carta, "codigo")).toEqual({ HAZ: ["#EFE8DA", "#1F3A93"], HAN: ["#EFE8DA", "#1F3A93", "#111111"] });
    expect(Object.keys(tonosDeLasMezclas(carta, "nombre"))).toEqual(["Hueso con azul", "Hueso con azul y negro"]);
  });

  it("parte el punto de una mezcla y deja liso el de un tono", () => {
    expect(fondoDelPunto("#EFE8DA", ["#EFE8DA", "#1F3A93"])).toBe(fondoDeMezcla(["#EFE8DA", "#1F3A93"]));
    expect(fondoDelPunto("#1F3A93", undefined)).toBe("#1F3A93");
    expect(fondoDelPunto("#1F3A93", ["#1F3A93"])).toBe("#1F3A93");
    expect(fondoDelPunto(null, null)).toBeUndefined();
  });
});
