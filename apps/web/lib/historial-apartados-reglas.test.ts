import { describe, expect, it } from "vitest";
import { PERIODOS_APARTADOS, PERIODO_DE_FABRICA, esDeFabrica, rangoDelPeriodo, textoDelPeriodo, type PeriodoApartados } from "./historial-apartados-reglas";

const HOY = "2026-10-10";

describe("historial de apartados por fecha", () => {
  it("al entrar se ven los últimos 30 días, hoy incluido", () => {
    expect(PERIODO_DE_FABRICA).toBe("30");
    expect(rangoDelPeriodo("30", HOY)).toEqual({ desde: "2026-09-11", hasta: null });
  });

  it("hoy, 7 y 90 días terminan hoy; «todo» no limita", () => {
    expect(rangoDelPeriodo("hoy", HOY)).toEqual({ desde: HOY, hasta: null });
    expect(rangoDelPeriodo("7", HOY)).toEqual({ desde: "2026-10-04", hasta: null });
    expect(rangoDelPeriodo("90", HOY)).toEqual({ desde: "2026-07-13", hasta: null });
    expect(rangoDelPeriodo("todo", HOY)).toEqual({ desde: null, hasta: null });
  });

  it("personalizado: fechas vacías o mal escritas no limitan, y al revés se dan vuelta", () => {
    expect(rangoDelPeriodo("personalizado", HOY, { desde: "2026-10-01", hasta: "2026-10-05" })).toEqual({ desde: "2026-10-01", hasta: "2026-10-05" });
    expect(rangoDelPeriodo("personalizado", HOY, { desde: "2026-10-05", hasta: "2026-10-01" })).toEqual({ desde: "2026-10-01", hasta: "2026-10-05" });
    expect(rangoDelPeriodo("personalizado", HOY, { desde: "", hasta: "x" })).toEqual({ desde: null, hasta: null });
    expect(rangoDelPeriodo("personalizado", HOY, { hasta: "2026-10-05" })).toEqual({ desde: null, hasta: "2026-10-05" });
  });

  it("solo el período de fábrica evita volver a la base", () => {
    expect(esDeFabrica("30", rangoDelPeriodo("30", HOY), HOY)).toBe(true);
    expect(esDeFabrica("personalizado", { desde: "2026-09-11", hasta: null }, HOY)).toBe(true);
    for (const p of ["hoy", "7", "90", "todo"] as PeriodoApartados[]) expect(esDeFabrica(p, rangoDelPeriodo(p, HOY), HOY)).toBe(false);
  });

  it("cada período se dice en palabras", () => {
    expect(textoDelPeriodo("hoy", rangoDelPeriodo("hoy", HOY))).toBe("de hoy");
    expect(textoDelPeriodo("30", rangoDelPeriodo("30", HOY))).toBe("de los últimos 30 días");
    expect(textoDelPeriodo("todo", rangoDelPeriodo("todo", HOY))).toBe("de todo el historial");
    expect(textoDelPeriodo("personalizado", { desde: "2026-10-02", hasta: "2026-10-09" })).toBe("del 2 oct al 9 oct");
    expect(textoDelPeriodo("personalizado", { desde: "2026-10-02", hasta: "2026-10-02" })).toBe("del 2 oct");
    expect(textoDelPeriodo("personalizado", { desde: "2026-10-02", hasta: null })).toBe("desde el 2 oct");
    expect(textoDelPeriodo("personalizado", { desde: null, hasta: null })).toBe("de todo el historial");
  });

  it("los botones son los mismos que en el Historial de ventas", () => {
    expect(PERIODOS_APARTADOS.map((p) => p.etiqueta)).toEqual(["Hoy", "7 días", "30 días", "90 días", "Personalizado"]);
  });
});
