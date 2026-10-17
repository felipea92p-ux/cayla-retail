import { describe, expect, it } from "vitest";
import { partirTitulo } from "./textos";

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
