import { describe, expect, it } from "vitest";
import { politicaDe, resolverPolitica } from "./politica-operativa-inventario";

// Política operativa de Inventario (Felipe, 2026-09-25, tercera ronda): fuente única de los
// umbrales que gobiernan «Acción hoy» — hoy `minDiasExposicionRitmo` (jornadas) y
// `umbralStockPisoReposicion` (unidades de piso, regla física — reemplaza al viejo umbral de
// días de cobertura, retirado). `OVERRIDES_POR_SEDE` está vacío a propósito (ninguna sede tiene
// hoy un número distinto del default) — por eso el merge se prueba por separado
// (`resolverPolitica`), con un override de prueba, en vez de depender del contenido del mapa real.

describe("politicaDe — hoy toda sede hereda el mismo default", () => {
  it("sin overrides reales, cualquier sede recibe exactamente el default (3 jornadas, piso <= 4)", () => {
    expect(politicaDe("cualquier-sede")).toEqual({ minDiasExposicionRitmo: 3, umbralStockPisoReposicion: 4 });
    expect(politicaDe("otra-sede-distinta")).toEqual({ minDiasExposicionRitmo: 3, umbralStockPisoReposicion: 4 });
  });
});

describe("resolverPolitica — el mecanismo de override, probado sin depender de datos reales", () => {
  it("sin override: default completo", () => {
    expect(resolverPolitica(undefined)).toEqual({ minDiasExposicionRitmo: 3, umbralStockPisoReposicion: 4 });
  });

  it("override parcial: solo el campo dado cambia, el resto sigue siendo el default (ej. LIM con 5 unidades en vez de 4)", () => {
    expect(resolverPolitica({ umbralStockPisoReposicion: 5 })).toEqual({ minDiasExposicionRitmo: 3, umbralStockPisoReposicion: 5 });
  });

  it("override total: los dos campos cambian", () => {
    expect(resolverPolitica({ minDiasExposicionRitmo: 5, umbralStockPisoReposicion: 1 })).toEqual({ minDiasExposicionRitmo: 5, umbralStockPisoReposicion: 1 });
  });
});
