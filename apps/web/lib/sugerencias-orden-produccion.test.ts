import { describe, expect, it } from "vitest";
import { MAX_NOTA_ORDEN, TIPOS_DE_ORDEN, sugerirNotaDeOrden } from "./sugerencias-orden-produccion";

// Contrato. PROMETE: que cada tipo de orden tiene su ejemplo (totalidad), que no se contradicen (una muestra no lleva el ejemplo de un lote), que es estable
// (A → B → A da lo mismo) y que cabe a 375 px. NO PROMETE que el texto sea el mejor: eso lo decide quien conoce el Taller.

describe("sugerirNotaDeOrden", () => {
  it("todos los tipos tienen un ejemplo, no vacío y que cabe", () => {
    for (const tipo of TIPOS_DE_ORDEN) {
      const t = sugerirNotaDeOrden(tipo);
      expect(t.trim().length, tipo).toBeGreaterThan(0);
      expect(t.length, tipo).toBeLessThanOrEqual(MAX_NOTA_ORDEN);
    }
  });
  it("una muestra y una producción no comparten ejemplo", () => {
    expect(sugerirNotaDeOrden("muestra")).not.toBe(sugerirNotaDeOrden("produccion"));
  });
  it("sigue al control: producción → muestra → producción vuelve al mismo ejemplo, sin azar", () => {
    const a = sugerirNotaDeOrden("produccion");
    sugerirNotaDeOrden("muestra");
    expect(sugerirNotaDeOrden("produccion")).toBe(a);
  });
  it("el ejemplo de una muestra habla de probar y aprobar, no de telas ni de clientes", () => {
    expect(sugerirNotaDeOrden("muestra")).toMatch(/prueba|aprueba/i);
    expect(sugerirNotaDeOrden("muestra")).not.toMatch(/cliente|urgencia/i);
  });
});
