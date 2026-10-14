import { describe, it, expect } from "vitest";
import { vigenciaDe } from "./etiqueta-vigencia";

describe("vigenciaDe", () => {
  it("sin fechas es permanente: no hay temporada", () => {
    expect(vigenciaDe(null, null, "2026-09-18")).toBeNull();
  });

  it("dentro del rango está vigente, incluidos el primer y el último día", () => {
    expect(vigenciaDe("2026-09-01", "2026-09-30", "2026-09-18")).toEqual({ estado: "vigente", hasta: "2026-09-30" });
    expect(vigenciaDe("2026-09-18", "2026-09-30", "2026-09-18")?.estado).toBe("vigente");
    expect(vigenciaDe("2026-09-01", "2026-09-18", "2026-09-18")?.estado).toBe("vigente");
  });

  it("antes de empezar es próxima y dice en cuántos días", () => {
    expect(vigenciaDe("2026-11-09", "2026-11-30", "2026-09-18")).toEqual({ estado: "proxima", desde: "2026-11-09", enDias: 52 });
  });

  it("después de terminar es terminada", () => {
    expect(vigenciaDe("2026-04-26", "2026-05-10", "2026-09-18")).toEqual({ estado: "terminada", hasta: "2026-05-10" });
  });

  it("con solo una fecha, la otra punta queda abierta", () => {
    expect(vigenciaDe("2026-09-01", null, "2026-09-18")?.estado).toBe("vigente");
    expect(vigenciaDe(null, "2026-12-31", "2026-09-18")?.estado).toBe("vigente");
    expect(vigenciaDe(null, "2026-09-01", "2026-09-18")?.estado).toBe("terminada");
  });
});
