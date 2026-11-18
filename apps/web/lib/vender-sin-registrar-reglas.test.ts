import { describe, expect, it } from "vitest";
import { fraseSinRegistrar, inicioDeHoyLimaIso } from "./vender-sin-registrar-reglas";

describe("fraseSinRegistrar — el pie del ticket sobre las prendas sin registrar", () => {
  it("hoy y pendientes, juntas", () => {
    expect(fraseSinRegistrar({ hoy: 3, pendientes: 71 })).toBe("Hoy 3 sin registrar · 71 por regularizar en tu tienda");
  });

  it("solo lo que haya: hoy sin pendientes, o pendientes de otros días", () => {
    expect(fraseSinRegistrar({ hoy: 1, pendientes: 0 })).toBe("Hoy 1 sin registrar");
    expect(fraseSinRegistrar({ hoy: 0, pendientes: 5 })).toBe("5 por regularizar en tu tienda");
  });

  it("sin nada que decir, o sin poder leer, no hay frase", () => {
    expect(fraseSinRegistrar({ hoy: 0, pendientes: 0 })).toBeNull();
    expect(fraseSinRegistrar(null)).toBeNull();
  });
});

describe("inicioDeHoyLimaIso — desde cuándo cuenta «hoy»", () => {
  it("es la medianoche de Lima del día de Lima, aunque en UTC ya sea mañana", () => {
    // 2026-10-14 23:30 en Lima = 2026-10-15 04:30 UTC: sigue siendo el 14 en Lima.
    expect(inicioDeHoyLimaIso(new Date("2026-10-15T04:30:00Z"))).toBe("2026-10-14T00:00:00-05:00");
    expect(inicioDeHoyLimaIso(new Date("2026-10-15T05:00:00Z"))).toBe("2026-10-15T00:00:00-05:00");
  });
});
