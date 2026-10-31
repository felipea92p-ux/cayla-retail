import { describe, expect, it } from "vitest";
import { MAX_NOTA_ORDEN, TIPOS_DE_ORDEN, sugerirNotaDeOrden } from "./sugerencias-orden-produccion";

// Contrato. PROMETE: que cada tipo de orden tiene su ejemplo (totalidad), que no se contradicen (una muestra no lleva el ejemplo de un lote), que es estable
// (A → B → A da lo mismo) y que cabe a 375 px. NO PROMETE que el texto sea el mejor: eso lo decide quien conoce el Taller.

describe("sugerirNotaDeOrden", () => {
  it("todos los tipos tienen un ejemplo, no vacío y que cabe", () => {
    for (const tipo of TIPOS_DE_ORDEN) {
      const t = sugerirNotaDeOrden(tipo);
      expect(t.trim().length, String(tipo)).toBeGreaterThan(0);
      expect(t.length, String(tipo)).toBeLessThanOrEqual(MAX_NOTA_ORDEN);
    }
  });
  it("sin tipo elegido (un modelo nuevo) el ejemplo es neutro: no promete ni un lote ni una muestra", () => {
    const neutro = sugerirNotaDeOrden(null);
    expect(neutro).not.toBe(sugerirNotaDeOrden("produccion"));
    expect(neutro).not.toBe(sugerirNotaDeOrden("muestra"));
    expect(neutro).not.toMatch(/cliente|urgencia|prueba|aprueba/i);
  });
  it("sin tipo → elige → vuelve a sin tipo da lo mismo", () => {
    const a = sugerirNotaDeOrden(null);
    sugerirNotaDeOrden("muestra");
    expect(sugerirNotaDeOrden(null)).toBe(a);
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
