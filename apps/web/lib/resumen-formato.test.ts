import { describe, expect, it } from "vitest";
import { textoRitmoReciente, textoRitmoRecienteCelda } from "./resumen-formato";

// Cómo se escribe el ritmo reciente de Existencias: lo que lee una persona, nunca una fracción física que no existe.

describe("textoRitmoRecienteCelda — la celda de Existencias del diseño aprobado (2026-09-28)", () => {
  const dia = (fecha: string, ventas: number) => ({ fecha, ventas });
  it("una tasa medida se escribe con su unidad: «1 ud/día», «2 uds/día», «0.8 uds/día»", () => {
    expect(textoRitmoRecienteCelda({ tipo: "medida", dias: [dia("2026-09-20", 1)], unidadesDia: 1 })).toBe("1 ud/día");
    expect(textoRitmoRecienteCelda({ tipo: "medida", dias: [dia("2026-09-20", 2)], unidadesDia: 2 })).toBe("2 uds/día");
    expect(textoRitmoRecienteCelda({ tipo: "medida", dias: [dia("2026-09-20", 2)], unidadesDia: 0.8 })).toBe("0.8 uds/día");
  });
  it("con menos jornadas que la política: «Sin datos suficientes» (los hechos por jornada siguen en el detalle y el CSV)", () => {
    const ritmo = { tipo: "insuficiente" as const, dias: [dia("2026-09-19", 3), dia("2026-09-20", 1)] };
    expect(textoRitmoRecienteCelda(ritmo)).toBe("Sin datos suficientes");
    expect(textoRitmoReciente(ritmo)).toBe("D1: 3 · D2: 1"); // el CSV y el cálculo del detalle no cambian
  });
  it("3 o más jornadas y ninguna venta: «Sin salida reciente», nunca un 0 fabricado", () => {
    expect(textoRitmoRecienteCelda({ tipo: "sin_salida", dias: [dia("a", 0), dia("b", 0), dia("c", 0)], unidadesDia: 0 })).toBe("Sin salida reciente");
  });
});
