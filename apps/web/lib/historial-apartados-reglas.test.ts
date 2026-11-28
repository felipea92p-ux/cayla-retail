import { describe, expect, it } from "vitest";
import { PERIODO_DE_FABRICA, rangoDelPeriodo } from "./historial-apartados-reglas";

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
});
