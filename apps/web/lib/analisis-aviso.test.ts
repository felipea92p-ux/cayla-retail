import { describe, expect, it } from "vitest";
import { avisoDatosDeHoy, leerDatosDeHoy } from "./analisis-aviso";

describe("ver Análisis con los datos de hoy (ADR-0357, decisión 2)", () => {
  it("la URL lo enciende solo con ?datos=hoy", () => {
    expect(leerDatosDeHoy("hoy")).toBe(true);
    expect(leerDatosDeHoy(["hoy"])).toBe(true);
    expect(leerDatosDeHoy("ejemplo")).toBe(false);
    expect(leerDatosDeHoy(undefined)).toBe(false);
  });
  it("el aviso dice cuántas ventas tienen su prenda, redondeando hacia abajo", () => {
    expect(avisoDatosDeHoy(0.369)).toBe("Solo 36 de cada 100 ventas tienen su prenda: estas cifras pueden fallar.");
    expect(avisoDatosDeHoy(0)).toBe("Solo 0 de cada 100 ventas tienen su prenda: estas cifras pueden fallar.");
    expect(avisoDatosDeHoy(null)).toBe("No hubo ventas en los últimos 14 días para medirlo: estas cifras pueden fallar.");
  });
});
