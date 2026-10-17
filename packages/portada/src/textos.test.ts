import { describe, expect, it } from "vitest";
import { finDeCampana, partesCuenta, partirTitulo } from "./textos";

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

describe("la cuenta regresiva (la de la tienda y la de la vista previa del ERP)", () => {
  it("la campaña rige todo su último día en Lima (hasta las 23:59:59, UTC−5)", () => {
    expect(new Date(finDeCampana("2026-10-21")).toISOString()).toBe("2026-10-22T04:59:59.000Z");
  });

  it("parte lo que falta en días, horas, minutos y segundos; nunca negativo", () => {
    expect(partesCuenta(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ d: 2, h: 3, m: 4, s: 5 });
    expect(partesCuenta(-5000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
});
