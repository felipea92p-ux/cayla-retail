import { describe, it, expect } from "vitest";
import { calcularEstado, UMBRAL_REPOSICION_PISO } from "./inventario-reglas";

// «Reponer piso» tiene que saltar ANTES de que el piso quede vacío (Felipe,
// 2026-09-15): con 4 unidades o menos en el piso y algo en el almacén, la
// tienda ya tiene tarea. Con el piso vacío y el almacén vacío, no hay nada
// que reponer: es «sin stock», que se lee distinto.

describe("calcularEstado", () => {
  it("el umbral es 4 unidades en el piso", () => {
    expect(UMBRAL_REPOSICION_PISO).toBe(4);
  });

  it("piso en el umbral o por debajo, con almacén: reponer", () => {
    expect(calcularEstado(4, 8)).toBe("reponer_piso");
    expect(calcularEstado(1, 8)).toBe("reponer_piso");
    expect(calcularEstado(0, 12)).toBe("reponer_piso");
  });

  it("piso por encima del umbral: normal, tenga o no almacén", () => {
    expect(calcularEstado(5, 8)).toBe("normal");
    expect(calcularEstado(12, 0)).toBe("normal");
  });

  it("piso bajo pero almacén vacío: no hay qué reponer, es normal con poco", () => {
    expect(calcularEstado(2, 0)).toBe("normal");
  });

  it("nada en ningún lado: sin stock", () => {
    expect(calcularEstado(0, 0)).toBe("sin_stock");
  });
});
