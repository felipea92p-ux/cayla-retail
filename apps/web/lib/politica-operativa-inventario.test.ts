import { describe, expect, it } from "vitest";
import { politicaDe, resolverPolitica } from "./politica-operativa-inventario";

// Política operativa de Inventario (Felipe, 2026-09-25, tercera ronda): hoy solo `minDiasExposicionRitmo` (jornadas). El umbral
// de piso (`umbralStockPisoBajada`, piso ≤ 4) se retiró el 2026-10-04: lo que el piso pide lo decide el motor del piso
// (`lib/piso-plan.ts`, ADR-0328 act. 7). `OVERRIDES_POR_SEDE` está vacío a propósito — por eso el merge se prueba por separado
// (`resolverPolitica`), con un override de prueba, en vez de depender del contenido del mapa real.

describe("politicaDe — hoy toda sede hereda el mismo default", () => {
  it("sin overrides reales, cualquier sede recibe exactamente el default (3 jornadas), y ya no trae umbral de piso", () => {
    expect(politicaDe("cualquier-sede")).toEqual({ minDiasExposicionRitmo: 3 });
    expect(politicaDe("otra-sede-distinta")).toEqual({ minDiasExposicionRitmo: 3 });
    expect("umbralStockPisoBajada" in politicaDe("cualquier-sede")).toBe(false);
  });
});

describe("resolverPolitica — el mecanismo de override, probado sin depender de datos reales", () => {
  it("sin override: default completo", () => {
    expect(resolverPolitica(undefined)).toEqual({ minDiasExposicionRitmo: 3 });
  });

  it("override: el campo dado cambia", () => {
    expect(resolverPolitica({ minDiasExposicionRitmo: 5 })).toEqual({ minDiasExposicionRitmo: 5 });
  });
});
