import { describe, expect, it } from "vitest";
import { bandaDeCobertura, calcularCobertura, calcularVelocidad, ventasNetasDe } from "./resumen-reglas";

// ---------------------------------------------------------------------------
describe("velocidad", () => {
  it("normal: ventas netas ÷ días en venta", () => {
    const v = calcularVelocidad({ ventas: 30, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    expect(v).toMatchObject({ estado: "ok", unidadesDia: 1, diasBase: 30, metodo: "dias_con_stock", estimada: false });
  });

  it("una prenda en venta 5 días que vendió 10 y luego estuvo 25 días agotada vende 2/día, no 0.33", () => {
    const v = calcularVelocidad({ ventas: 10, devoluciones: 0, diasConStock: 5, diasObservables: 30, ledgerConsistente: true });
    expect(v.estado).toBe("ok");
    expect(v.unidadesDia).toBeCloseTo(2, 5);
    expect(v.unidadesDia).not.toBeCloseTo(10 / 30, 2);
  });

  it("las devoluciones restan y nunca dejan la venta neta en negativo", () => {
    expect(ventasNetasDe(10, 3)).toBe(7);
    expect(ventasNetasDe(2, 5)).toBe(0);
    const v = calcularVelocidad({ ventas: 10, devoluciones: 3, diasConStock: 14, diasObservables: 30, ledgerConsistente: true });
    expect(v.ventasNetas).toBe(7);
    expect(v.unidadesDia).toBeCloseTo(0.5, 5);
  });

  it("sin ventas, solo se afirma «sin ventas» con 14 días o más en venta", () => {
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 20, diasObservables: 30, ledgerConsistente: true }).estado).toBe("sin_ventas");
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 10, diasObservables: 30, ledgerConsistente: true }).estado).toBe("poco_historial");
  });

  it("con menos de 3 días en venta no se calcula velocidad, aunque haya ventas", () => {
    const v = calcularVelocidad({ ventas: 5, devoluciones: 0, diasConStock: 2, diasObservables: 30, ledgerConsistente: true });
    expect(v).toMatchObject({ estado: "poco_historial", unidadesDia: null, ventasNetas: 5 });
  });

  it("nunca estuvo en venta: sin historial; con ventas pero sin base: poco historial", () => {
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 0, diasObservables: null, ledgerConsistente: true }).estado).toBe("sin_historial");
    expect(calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: null, diasObservables: null, ledgerConsistente: true }).estado).toBe("sin_historial");
    expect(calcularVelocidad({ ventas: 4, devoluciones: 0, diasConStock: null, diasObservables: null, ledgerConsistente: true }).estado).toBe("poco_historial");
  });

  it("si el ledger no cuadra usa los días desde que llegó y lo marca como estimada", () => {
    const v = calcularVelocidad({ ventas: 10, devoluciones: 0, diasConStock: 3, diasObservables: 20, ledgerConsistente: false });
    expect(v).toMatchObject({ estado: "ok", metodo: "ventana_observable", estimada: true, diasBase: 20 });
    expect(v.unidadesDia).toBeCloseTo(0.5, 5);
  });
});

// ---------------------------------------------------------------------------
describe("cobertura", () => {
  const ritmo = (u: number) => calcularVelocidad({ ventas: u * 30, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });

  it("cobertura 0: agotado, aunque haya un ritmo medible", () => {
    const c = calcularCobertura(0, ritmo(4));
    expect(c).toEqual({ tipo: "agotado", dias: 0 });
    expect(bandaDeCobertura(c)).toBe("agotado");
  });

  it("cobertura crítica: 7 unidades a 4.1/día ≈ 1.7 días", () => {
    const v = calcularVelocidad({ ventas: 123, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    const c = calcularCobertura(7, v);
    expect(c.tipo).toBe("medida");
    expect(c.dias).toBeCloseTo(1.7, 1);
    expect(bandaDeCobertura(c)).toBe("critica");
  });

  it("los cortes de banda: ≤3, ≤7, ≤30 y más", () => {
    const banda = (u: number) => bandaDeCobertura(calcularCobertura(u, ritmo(1)));
    expect(banda(3)).toBe("critica");
    expect(banda(3.01)).toBe("atencion");
    expect(banda(7)).toBe("atencion");
    expect(banda(7.01)).toBe("saludable");
    expect(banda(30)).toBe("saludable");
    expect(banda(30.01)).toBe("alta");
  });

  it("cobertura saludable y muy alta", () => {
    expect(bandaDeCobertura(calcularCobertura(20, ritmo(1)))).toBe("saludable");
    expect(bandaDeCobertura(calcularCobertura(400, ritmo(1)))).toBe("alta");
  });

  it("sin historial suficiente no hay número, ni cero ni infinito", () => {
    const poco = calcularVelocidad({ ventas: 3, devoluciones: 0, diasConStock: 2, diasObservables: 2, ledgerConsistente: true });
    expect(calcularCobertura(12, poco)).toEqual({ tipo: "sin_historial", dias: null });
    expect(bandaDeCobertura(calcularCobertura(12, poco))).toBe("sin_historial");
  });

  it("sin ventas con evidencia: alta cobertura sin inventar un número", () => {
    const sinVentas = calcularVelocidad({ ventas: 0, devoluciones: 0, diasConStock: 30, diasObservables: 30, ledgerConsistente: true });
    const c = calcularCobertura(12, sinVentas);
    expect(c).toEqual({ tipo: "sin_ventas", dias: null });
    expect(bandaDeCobertura(c)).toBe("alta");
  });
});
