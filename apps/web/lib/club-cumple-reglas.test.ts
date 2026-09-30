import { describe, expect, it } from "vitest";
import {
  CUMPLE_VACIO,
  OPCIONES_MES_CUMPLE,
  ajustarAnio,
  ajustarDia,
  cajaDelProblemaCumple,
  cumpleCompleto,
  cumpleEscrito,
  cumpleParaGuardar,
  cumpleVacio,
  problemaCumple,
} from "./club-cumple-reglas";

// UNA regla del cumpleaños para Cobrar y /clientas (antes eran dos y no coincidían: /clientas aceptaba el 31 de abril).

describe("el cumpleaños: la misma regla en Cobrar y en /clientas", () => {
  it("el día y el año solo aceptan cifras; el mes, abreviado como el spike para caber a 375 px", () => {
    expect(ajustarDia("1a2b3")).toBe("12");
    expect(ajustarAnio("19x905")).toBe("1990");
    expect(OPCIONES_MES_CUMPLE).toHaveLength(12);
    expect(OPCIONES_MES_CUMPLE.map((m) => m.valor)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(OPCIONES_MES_CUMPLE[8]).toEqual({ valor: "9", texto: "sep" });
  });

  it("no es obligatorio; día y mes van juntos; el año, opcional (CL-3)", () => {
    expect(problemaCumple(CUMPLE_VACIO, 2026)).toBeNull();
    expect(problemaCumple({ dia: "14", mes: "", anio: "" }, 2026)).toMatch(/mes/);
    expect(problemaCumple({ dia: "", mes: "3", anio: "" }, 2026)).toMatch(/día/);
    expect(problemaCumple({ dia: "", mes: "", anio: "1990" }, 2026)).toMatch(/día y el mes/);
    expect(problemaCumple({ dia: "14", mes: "3", anio: "" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "14", mes: "3", anio: "1990" }, 2026)).toBeNull();
  });

  it("no deja un día que el mes no tiene (el 31 de abril, que /clientas aceptaba), ni un año imposible", () => {
    expect(problemaCumple({ dia: "31", mes: "4", anio: "" }, 2026)).toBe("Abril no tiene día 31.");
    expect(problemaCumple({ dia: "31", mes: "11", anio: "" }, 2026)).toBe("Noviembre no tiene día 31.");
    expect(problemaCumple({ dia: "30", mes: "2", anio: "" }, 2026)).toBe("Febrero no tiene día 30.");
    expect(problemaCumple({ dia: "32", mes: "3", anio: "" }, 2026)).toBe("Marzo no tiene día 32.");
    expect(problemaCumple({ dia: "0", mes: "3", anio: "" }, 2026)).toMatch(/no tiene día 0/);
    // El 29 de febrero sin año vale; con un año que no fue bisiesto, no.
    expect(problemaCumple({ dia: "29", mes: "2", anio: "" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "29", mes: "2", anio: "1992" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "29", mes: "2", anio: "2000" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "29", mes: "2", anio: "1990" }, 2026)).toMatch(/28 días/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "90" }, 2026)).toMatch(/4 cifras/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "2031" }, 2026)).toMatch(/no puede ser/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "1900" }, 2026)).toMatch(/no puede ser/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "2026" }, 2026)).toBeNull();
  });

  it("recorre los 12 meses: el último día de cada uno vale y el siguiente no", () => {
    const dias = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    dias.forEach((ultimo, i) => {
      const mes = String(i + 1);
      expect(problemaCumple({ dia: String(ultimo), mes, anio: "" }, 2026), `mes ${mes}`).toBeNull();
      expect(problemaCumple({ dia: String(ultimo + 1), mes, anio: "" }, 2026), `mes ${mes}`).not.toBeNull();
    });
  });

  it("completo es día y mes bien escritos (el año, si está, también)", () => {
    expect(cumpleCompleto({ dia: "12", mes: "3", anio: "" }, 2026)).toBe(true);
    expect(cumpleCompleto({ dia: "12", mes: "3", anio: "1990" }, 2026)).toBe(true);
    expect(cumpleCompleto({ dia: "12", mes: "3", anio: "2030" }, 2026)).toBe(false);
    expect(cumpleCompleto({ dia: "31", mes: "4", anio: "" }, 2026)).toBe(false);
    expect(cumpleCompleto(CUMPLE_VACIO, 2026)).toBe(false);
    expect(cumpleVacio(CUMPLE_VACIO)).toBe(true);
    expect(cumpleVacio({ dia: "", mes: "", anio: "1990" })).toBe(false);
  });

  it("el cursor va al año solo si el problema es del año; si no, al día", () => {
    expect(cajaDelProblemaCumple({ dia: "12", mes: "3", anio: "2030" }, 2026)).toBe("anio");
    expect(cajaDelProblemaCumple({ dia: "29", mes: "2", anio: "1990" }, 2026)).toBe("anio");
    expect(cajaDelProblemaCumple({ dia: "31", mes: "4", anio: "1990" }, 2026)).toBe("dia");
    expect(cajaDelProblemaCumple({ dia: "", mes: "", anio: "1990" }, 2026)).toBe("dia");
    expect(cajaDelProblemaCumple({ dia: "12", mes: "", anio: "" }, 2026)).toBe("dia");
    expect(cajaDelProblemaCumple({ dia: "12", mes: "3", anio: "" }, 2026)).toBeNull();
  });

  it("lo que viaja a la base: números o null, y el año solo con día y mes", () => {
    expect(cumpleParaGuardar({ dia: "14", mes: "3", anio: "1990" })).toEqual({ cumpleDia: 14, cumpleMes: 3, cumpleAnio: 1990 });
    expect(cumpleParaGuardar({ dia: "14", mes: "3", anio: "" })).toEqual({ cumpleDia: 14, cumpleMes: 3, cumpleAnio: null });
    expect(cumpleParaGuardar(CUMPLE_VACIO)).toEqual({ cumpleDia: null, cumpleMes: null, cumpleAnio: null });
  });

  it("el de la ficha se escribe en la hoja tal cual, vacío si no lo tenía", () => {
    expect(cumpleEscrito(14, 3, 1990)).toEqual({ dia: "14", mes: "3", anio: "1990" });
    expect(cumpleEscrito(14, 3, null)).toEqual({ dia: "14", mes: "3", anio: "" });
    expect(cumpleEscrito(null, undefined, null)).toEqual(CUMPLE_VACIO);
  });
});
