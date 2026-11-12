import { describe, expect, it } from "vitest";
import { colorDeAvance } from "./avance-color";

describe("colorDeAvance", () => {
  it("empieza en rojo, pasa por ámbar a la mitad y termina en verde", () => {
    expect(colorDeAvance(0)).toBe("color-mix(in oklab, var(--color-avance-medio) 0%, var(--color-rojo))");
    expect(colorDeAvance(50)).toBe("color-mix(in oklab, var(--color-avance-medio) 100%, var(--color-rojo))");
    expect(colorDeAvance(100)).toBe("var(--color-verde)");
  });

  it("cambia de a poco mientras se llena", () => {
    expect(colorDeAvance(25)).toContain("var(--color-avance-medio) 50%");
    expect(colorDeAvance(75)).toBe("color-mix(in oklab, var(--color-verde) 50%, var(--color-avance-medio))");
    const tonos = new Set([10, 20, 30, 40, 60, 70, 80, 90].map(colorDeAvance));
    expect(tonos.size).toBe(8);
  });

  it("lo que viene mal se queda en la punta que le toca", () => {
    expect(colorDeAvance(140)).toBe("var(--color-verde)");
    expect(colorDeAvance(-5)).toBe(colorDeAvance(0));
    expect(colorDeAvance(Number.NaN)).toBe(colorDeAvance(0));
  });
});
