import { describe, it, expect } from "vitest";
import { calcularEstado, necesitaReponerPiso, UMBRAL_REPOSICION_PISO, UMBRAL_STOCK_BAJO_TIENDA } from "./inventario-reglas";

// «Reponer piso» tiene que saltar ANTES de que el piso quede vacío (Felipe,
// 2026-09-15): con 4 unidades o menos en el piso y algo en el almacén, la
// tienda ya tiene tarea. «Stock bajo» (Felipe, 2026-09-16) salta cuando ni
// sumando piso y almacén se llega a más de 6: ahí bajar del almacén no
// alcanza, hay que pedir traslado. Con todo en cero es «sin stock».

describe("calcularEstado", () => {
  it("los umbrales son 4 en el piso y 6 en toda la tienda", () => {
    expect(UMBRAL_REPOSICION_PISO).toBe(4);
    expect(UMBRAL_STOCK_BAJO_TIENDA).toBe(6);
  });

  it("piso en el umbral o por debajo, con almacén y total holgado: reponer", () => {
    expect(calcularEstado(4, 8)).toBe("reponer_piso");
    expect(calcularEstado(1, 8)).toBe("reponer_piso");
    expect(calcularEstado(0, 12)).toBe("reponer_piso");
    // Total 7: justo por encima del umbral de tienda, sigue siendo reponer.
    expect(calcularEstado(2, 5)).toBe("reponer_piso");
  });

  it("piso por encima del umbral: normal, tenga o no almacén", () => {
    expect(calcularEstado(5, 8)).toBe("normal");
    expect(calcularEstado(12, 0)).toBe("normal");
    expect(calcularEstado(7, 0)).toBe("normal");
  });

  it("toda la tienda en el umbral o por debajo: stock bajo, gane o no reponer", () => {
    expect(calcularEstado(2, 4)).toBe("stock_bajo"); // total 6, y además se podría reponer
    expect(calcularEstado(1, 1)).toBe("stock_bajo");
    expect(calcularEstado(6, 0)).toBe("stock_bajo");
    // Piso bajo con almacén vacío: antes era «normal con poco»; ahora tiene
    // nombre, porque el arreglo ya no está dentro de la tienda.
    expect(calcularEstado(2, 0)).toBe("stock_bajo");
  });

  it("nada en ningún lado: sin stock", () => {
    expect(calcularEstado(0, 0)).toBe("sin_stock");
  });
});

describe("necesitaReponerPiso", () => {
  it("ofrece bajar del almacén aunque el estado sea stock bajo", () => {
    expect(necesitaReponerPiso(1, 1)).toBe(true);
    expect(necesitaReponerPiso(4, 8)).toBe(true);
  });

  it("no ofrece nada si el almacén está vacío o el piso ya está cubierto", () => {
    expect(necesitaReponerPiso(2, 0)).toBe(false);
    expect(necesitaReponerPiso(5, 8)).toBe(false);
  });
});
