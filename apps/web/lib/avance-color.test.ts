import { describe, expect, it } from "vitest";
import { colorDeAvance, textoDeAvance } from "./avance-color";

describe("textoDeAvance", () => {
  it("con algo contado nunca dice 0%, y sin terminar nunca dice 100%", () => {
    expect(textoDeAvance(0)).toBe("0%");
    expect(textoDeAvance(0.13)).toBe("menos de 1%");
    expect(textoDeAvance(49.6)).toBe("50%");
    expect(textoDeAvance(99.6)).toBe("99%");
    expect(textoDeAvance(100)).toBe("100%");
  });

  it("pasado de lo que dijeron lo dice tal cual, y lo que viene mal es 0%", () => {
    expect(textoDeAvance(112)).toBe("112%");
    expect(textoDeAvance(Number.NaN)).toBe("0%");
  });
});

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
