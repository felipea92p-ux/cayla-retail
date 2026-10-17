import { describe, expect, it } from "vitest";
import { anuncioDeCampana, destacadoDeCampana, finDeCampana, largoDelNombre, partesCuenta, partirTitulo } from "./textos";

describe("partir el nombre de la campaña", () => {
  it("sin corte, la última palabra en cursiva (como siempre)", () => {
    expect(partirTitulo("Aniversario CAYLA")).toEqual(["Aniversario", "CAYLA"]);
    expect(partirTitulo("  CyberWow ")).toEqual(["CyberWow", ""]);
  });
  it("con corte, desde esa palabra", () => {
    expect(partirTitulo("Día Internacional del Gato", 1)).toEqual(["Día", "Internacional del Gato"]);
    expect(partirTitulo("Día Internacional del Gato", 0)).toEqual(["", "Día Internacional del Gato"]);
    expect(partirTitulo("Día Internacional del Gato", 4)).toEqual(["Día Internacional del Gato", ""]);
    expect(partirTitulo("Navidad", 9)).toEqual(["Navidad", ""]);
  });
});

describe("el largo del nombre (el tamaño de la letra)", () => {
  it("corto, medio o largo por las letras del nombre y por su palabra más larga, que no se parte", () => {
    expect(largoDelNombre("Navidad")).toBe("corto");
    expect(largoDelNombre("Día del Gato")).toBe("corto");
    expect(largoDelNombre("Black Friday")).toBe("corto");
    expect(largoDelNombre("Aniversario CAYLA")).toBe("medio");
    expect(largoDelNombre("Liquidación")).toBe("medio");
    expect(largoDelNombre("Día Internacional del Gato")).toBe("largo");
    // Una sola palabra de 13 letras ya es «largo»: a 124 px, «Internacional» se metía debajo de las polaroids.
    expect(largoDelNombre("Internacional")).toBe("largo");
    expect(largoDelNombre("  Navidad  ")).toBe("corto");
  });
});

describe("la cuenta regresiva (la de la tienda y la de la vista previa del ERP)", () => {
  it("la campaña rige todo su último día en Lima (hasta las 23:59:59, UTC−5)", () => {
    expect(new Date(finDeCampana("2026-10-21")).toISOString()).toBe("2026-10-22T04:59:59.000Z");
  });

  it("parte lo que falta en días, horas, minutos y segundos; nunca negativo", () => {
    expect(partesCuenta(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ d: 2, h: 3, m: 4, s: 5 });
    expect(partesCuenta(-5000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
});

describe("lo que anuncia una campaña, con y sin descuento", () => {
  it("la franja de arriba: con su % pegado al número y su fin; sin descuento, sin %", () => {
    expect(anuncioDeCampana({ nombre: "Día del Gato", pct: 15, hasta: "2026-10-30" })).toBe("Día del Gato · −15\u00a0% hasta el 30 oct.");
    expect(anuncioDeCampana({ nombre: "Liquidación", pct: 12.5, hasta: null })).toBe("Liquidación · −12.5\u00a0%");
    expect(anuncioDeCampana({ nombre: "Navidad", pct: null, hasta: "2026-12-25" })).toBe("Navidad · mira lo que elegimos");
  });
  it("lo que el héroe dice en negrita", () => {
    expect(destacadoDeCampana({ nombre: "Día del Gato", pct: 15 })).toBe("−15 % en prendas elegidas.");
    expect(destacadoDeCampana({ nombre: "Navidad", pct: null })).toBe("Prendas elegidas para Navidad.");
  });
});
