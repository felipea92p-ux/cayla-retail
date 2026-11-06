import { describe, expect, it } from "vitest";
import { leerCostoEstimado, notaCostoEstimado } from "./costo-estimado-reglas";

const base = { unidades_estimadas: 0, venta_estimada: 0, unidades_sin_costo: 0, venta_sin_costo: 0, venta_total: 1000 };

describe("notaCostoEstimado", () => {
  it("sin lectura o sin ventas, no avisa nada", () => {
    expect(notaCostoEstimado(null)).toBeNull();
    expect(notaCostoEstimado(leerCostoEstimado({ ...base, venta_total: 0 }))).toBeNull();
  });

  it("con todo el costo real, no avisa nada", () => {
    expect(notaCostoEstimado(leerCostoEstimado(base))).toBeNull();
  });

  it("dice el porcentaje de la venta, igual que el medidor de confianza (octubre: 38 %)", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 12, venta_estimada: 380 }));
    expect(n?.texto).toBe("38 % de lo vendido lleva costo estimado (12 prendas sin registrar)");
    expect(n?.tono).toBe("ambar");
    expect(n?.href).toBe("/inventario/por-regularizar");
  });

  it("una sola prenda va en singular", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 1, venta_estimada: 100 }));
    expect(n?.texto).toContain("(1 prenda sin registrar)");
  });

  it("un estimado chico no se esconde: dice «menos del 1 %»", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, venta_total: 100000, unidades_estimadas: 1, venta_estimada: 100 }));
    expect(n?.texto).toMatch(/^Menos del 1 % de lo vendido/);
  });

  it("lo que no tiene costo ninguno es peor que lo estimado: tono rojo", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 5, venta_estimada: 200, unidades_sin_costo: 2, venta_sin_costo: 100 }));
    expect(n?.tono).toBe("rojo");
    expect(n?.texto).toContain("20 % de lo vendido lleva costo estimado");
    expect(n?.texto).toContain("10 % no tiene costo (2 prendas)");
  });

  it("nunca pasa de 100 % aunque la base mande una venta estimada mayor al total", () => {
    const n = notaCostoEstimado(leerCostoEstimado({ ...base, unidades_estimadas: 3, venta_estimada: 5000 }));
    expect(n?.texto).toContain("100 %");
  });
});
