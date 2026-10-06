import { describe, expect, it } from "vitest";
import { etiquetaRango, hoyEnLima, parseIso, sumarDias } from "./resumen-periodo";

describe("fechas sin zona horaria", () => {
  it("parseIso rechaza lo que no es una fecha real", () => {
    expect(parseIso("2026-09-18")).toEqual({ a: 2026, m: 9, d: 18 });
    expect(parseIso("2026-02-30")).toBeNull();
    expect(parseIso("2026-13-01")).toBeNull();
    expect(parseIso("18/09/2026")).toBeNull();
    expect(parseIso("")).toBeNull();
    expect(parseIso(null)).toBeNull();
  });

  it("sumarDias cruza meses y años sin correrse un día", () => {
    expect(sumarDias("2026-09-18", -29)).toBe("2026-08-20");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(sumarDias("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("hoyEnLima no se corre un día por la zona horaria", () => {
    // 2026-09-19 02:00 UTC = 2026-09-18 21:00 en Lima.
    expect(hoyEnLima(new Date("2026-09-19T02:00:00Z"))).toBe("2026-09-18");
    // 2026-09-18 05:30 UTC = 2026-09-18 00:30 en Lima (recién empezó el día).
    expect(hoyEnLima(new Date("2026-09-18T05:30:00Z"))).toBe("2026-09-18");
    // 2026-09-18 04:30 UTC = 2026-09-17 23:30 en Lima (todavía ayer).
    expect(hoyEnLima(new Date("2026-09-18T04:30:00Z"))).toBe("2026-09-17");
  });
});

describe("textos", () => {
  it("etiquetaRango según cruce de mes o de año", () => {
    expect(etiquetaRango({ desde: "2026-09-18", hasta: "2026-09-18" })).toBe("18 sep.");
    expect(etiquetaRango({ desde: "2026-08-28", hasta: "2026-09-15" })).toBe("28 ago. – 15 sep.");
    expect(etiquetaRango({ desde: "2025-12-28", hasta: "2026-01-03" })).toBe("28 dic. 2025 – 3 ene. 2026");
  });

  it("con el año pedido siempre lo dice (comparar con el año anterior no debe leerse como el período de hoy)", () => {
    expect(etiquetaRango({ desde: "2025-08-20", hasta: "2025-09-18" }, true)).toBe("20 ago. – 18 sep. 2025");
    expect(etiquetaRango({ desde: "2025-09-01", hasta: "2025-09-15" }, true)).toBe("1–15 sep. 2025");
    expect(etiquetaRango({ desde: "2025-09-18", hasta: "2025-09-18" }, true)).toBe("18 sep. 2025");
  });

});
