import { describe, it, expect } from "vitest";
import { describirRotacion } from "./reorden-reglas";

describe("describirRotacion", () => {
  it("sin ventas en el período: nada que mostrar", () => {
    expect(describirRotacion(0)).toBeNull();
    expect(describirRotacion(-0.5)).toBeNull();
  });

  it("vende una unidad o más por día: unidades/día", () => {
    expect(describirRotacion(2.3)).toBe("~2.3/día");
    expect(describirRotacion(1)).toBe("~1.0/día");
  });

  it("vende menos de una unidad por día: cada cuántos días", () => {
    expect(describirRotacion(0.5)).toBe("cada ~2 días");
    expect(describirRotacion(1 / 12)).toBe("cada ~12 días");
  });

  it("exactamente 1 día: singular", () => {
    expect(describirRotacion(0.99)).toBe("cada ~1 día");
  });
});
