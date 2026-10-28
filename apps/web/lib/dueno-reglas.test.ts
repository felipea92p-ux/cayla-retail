import { describe, expect, it } from "vitest";
import { conDueno, conDuenoPorLineas, faltaElegirDueno, hayQueElegirDueno, ENCABEZADO_DUENO, ENCABEZADO_DUENO_LINEAS } from "./dueno-reglas";

const DOS = [
  { id: "c", clave: "cayla", nombre: "CAYLA" },
  { id: "x", clave: "claure", nombre: "CLAURE" },
];

class Consulta {
  encabezados: Record<string, string> = {};
  setHeader(n: string, v: string) {
    this.encabezados[n] = v;
    return this;
  }
}

describe("hayQueElegirDueno / faltaElegirDueno (ADR-0542)", () => {
  it("solo se pregunta donde operan dos empresas", () => {
    expect(hayQueElegirDueno(DOS)).toBe(true);
    expect(hayQueElegirDueno([DOS[0]])).toBe(false);
    expect(hayQueElegirDueno(null)).toBe(false);
    expect(hayQueElegirDueno(undefined)).toBe(false);
  });
  it("falta mientras no se elija una empresa que opere aquí; sin pregunta, nunca falta", () => {
    expect(faltaElegirDueno(DOS, "")).toBe(true);
    expect(faltaElegirDueno(DOS, "otra")).toBe(true);
    expect(faltaElegirDueno(DOS, "x")).toBe(false);
    expect(faltaElegirDueno([DOS[0]], "")).toBe(false);
    expect(faltaElegirDueno(null, "")).toBe(false);
  });
});

describe("los encabezados", () => {
  it("conDueno manda x-dueno, y sin dueño no toca la consulta", () => {
    expect(conDueno(new Consulta(), "x").encabezados).toEqual({ [ENCABEZADO_DUENO]: "x" });
    expect(conDueno(new Consulta(), "").encabezados).toEqual({});
    expect(conDueno(new Consulta(), null).encabezados).toEqual({});
  });
  it("conDuenoPorLineas manda el mapa como JSON, y vacío no manda nada", () => {
    const c = conDuenoPorLineas(new Consulta(), { v1: "c", v2: "x" });
    expect(JSON.parse(c.encabezados[ENCABEZADO_DUENO_LINEAS])).toEqual({ v1: "c", v2: "x" });
    expect(conDuenoPorLineas(new Consulta(), {}).encabezados).toEqual({});
  });
});
