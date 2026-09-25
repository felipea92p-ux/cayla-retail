import { describe, expect, it } from "vitest";
import { calidadDeExposicion, calidadDeRotacionUnidades, calidadDeRotacionValorizada, calidadDeSellThroughExposicion, calidadDeSinVenta, calidadDeTendencia, calidadDeVelocidad } from "./inventario-calidad";

// Contrato de calidad del dato (sección 5 del pedido, 2026-09-24): una sola taxonomía de
// exacto/estimado/no_disponible + motivo para todo el dominio, en vez de que cada métrica invente su
// propio vocabulario. Lo que se prueba: cada adaptador traduce correctamente la forma propia de SU
// métrica al contrato común, sin perder la causa raíz real.

describe("calidadDeSellThroughExposicion", () => {
  it("exacto: sin ningún ciclo piso↔almacén de por medio", () => {
    expect(calidadDeSellThroughExposicion({ pct: 60, estimado: false })).toEqual({ estado: "exacto" });
  });
  it("estimado: hubo al menos un regreso desde almacén (aproximación por cantidad)", () => {
    expect(calidadDeSellThroughExposicion({ pct: 60, estimado: true })).toEqual({ estado: "estimado", motivo: "TRAZABILIDAD_INSUFICIENTE" });
  });
  it("no_disponible: ninguna cohorte maduró todavía", () => {
    expect(calidadDeSellThroughExposicion({ pct: null, estimado: true })).toEqual({ estado: "no_disponible", motivo: "EXPOSICION_INSUFICIENTE" });
  });
});

describe("calidadDeRotacionUnidades (piso/total, en unidades)", () => {
  it("exacto cuando es calculable", () => {
    expect(calidadDeRotacionUnidades({ calculable: true }, true)).toEqual({ estado: "exacto" });
  });
  it("SIN_INVENTARIO cuando el ledger cuadra pero el promedio no es positivo", () => {
    expect(calidadDeRotacionUnidades({ calculable: false }, true)).toEqual({ estado: "no_disponible", motivo: "SIN_INVENTARIO" });
  });
  it("HISTORIAL_INCOMPLETO cuando la causa real es que el ledger no cuadra — no se confunde con «sin inventario»", () => {
    expect(calidadDeRotacionUnidades({ calculable: false }, false)).toEqual({ estado: "no_disponible", motivo: "HISTORIAL_INCOMPLETO" });
  });
});

describe("calidadDeRotacionValorizada (rotacion.ts, soles) — motivo propio, nunca se confunde con la de unidades", () => {
  it("exacto cuando es calculable", () => {
    expect(calidadDeRotacionValorizada({ calculable: true, motivo: null })).toEqual({ estado: "exacto" });
  });
  it("SIN_INVENTARIO cuando el motivo original es 'sin_inventario'", () => {
    expect(calidadDeRotacionValorizada({ calculable: false, motivo: "sin_inventario" })).toEqual({ estado: "no_disponible", motivo: "SIN_INVENTARIO" });
  });
  it("SIN_COSTO_VERIFICABLE cuando falta costo de la venta o del stock", () => {
    expect(calidadDeRotacionValorizada({ calculable: false, motivo: "ventas_sin_costo" })).toEqual({ estado: "no_disponible", motivo: "SIN_COSTO_VERIFICABLE" });
    expect(calidadDeRotacionValorizada({ calculable: false, motivo: "inventario_sin_valor" })).toEqual({ estado: "no_disponible", motivo: "SIN_COSTO_VERIFICABLE" });
  });
});

describe("calidadDeVelocidad (Ritmo observado)", () => {
  it("exacto con base honesta y ledger consistente", () => {
    expect(calidadDeVelocidad({ unidadesDia: 0.5, estimada: false, estado: "ok" })).toEqual({ estado: "exacto" });
  });
  it("estimado cuando el ledger no cuadra (cae al denominador de calendario)", () => {
    expect(calidadDeVelocidad({ unidadesDia: 0.5, estimada: true, estado: "ok" })).toEqual({ estado: "estimado", motivo: "HISTORIAL_INCOMPLETO" });
  });
  it("«sin_ventas» con evidencia suficiente es un dato real (0), no falta de dato: exacto", () => {
    expect(calidadDeVelocidad({ unidadesDia: null, estimada: false, estado: "sin_ventas" })).toEqual({ estado: "exacto" });
  });
  it("sin base honesta (poco o ningún historial), no_disponible", () => {
    expect(calidadDeVelocidad({ unidadesDia: null, estimada: false, estado: "poco_historial" })).toEqual({ estado: "no_disponible", motivo: "EXPOSICION_INSUFICIENTE" });
  });
});

describe("calidadDeSinVenta", () => {
  it("exacto con historial suficiente para reconstruir el intervalo", () => {
    expect(calidadDeSinVenta(4)).toEqual({ estado: "exacto" });
    expect(calidadDeSinVenta(0)).toEqual({ estado: "exacto" }); // 0 es un dato real («vendió hoy»)
  });
  it("no_disponible sin historial suficiente", () => {
    expect(calidadDeSinVenta(null)).toEqual({ estado: "no_disponible", motivo: "HISTORIAL_INCOMPLETO" });
  });
});

describe("calidadDeTendencia", () => {
  it("exacto cuando hay una dirección afirmada", () => {
    expect(calidadDeTendencia({ direccion: "alza", variacionPct: 30 })).toEqual({ estado: "exacto" });
  });
  it("no_disponible (nunca «estable» por defecto) cuando falta base comparable", () => {
    expect(calidadDeTendencia(null)).toEqual({ estado: "no_disponible", motivo: "SIN_BASE_COMPARABLE" });
  });
});

describe("calidadDeExposicion (días con stock en piso — solo 2 estados: NUNCA 'estimado', corregido 2026-09-24 sección 6)", () => {
  it("exacto con exposición suficiente frente al período", () => {
    expect(calidadDeExposicion(20)).toEqual({ estado: "exacto" });
  });
  it("SIGUE siendo exacto con muestra corta frente al período: es el mismo cálculo exacto, no una técnica sustituta — 'muestra limitada' es una advertencia aparte (booleano), no pertenece a este contrato", () => {
    expect(calidadDeExposicion(2)).toEqual({ estado: "exacto" });
  });
  it("no_disponible sin ningún intervalo de piso reconstruido", () => {
    expect(calidadDeExposicion(null)).toEqual({ estado: "no_disponible", motivo: "HISTORIAL_INCOMPLETO" });
  });
});
