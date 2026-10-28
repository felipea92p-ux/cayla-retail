import { describe, expect, it } from "vitest";
import { FICHAS_POR_CATEGORIA } from "./sugerencias-alta-producto";
import { MAX_EJEMPLO_LIQUIDACION, sugerirDescripcionLiquidacion } from "./sugerencias-liquidacion";

describe("el ejemplo de «Para reconocerla» sigue a la categoría (ADR-0290)", () => {
  it("toda categoría con ficha da un ejemplo de SU prenda, que cabe a 375 px", () => {
    for (const [prefijo, ficha] of Object.entries(FICHAS_POR_CATEGORIA)) {
      const s = sugerirDescripcionLiquidacion({ prefijo });
      expect(s.origen).toBe("categoria");
      expect(s.texto.startsWith(ficha.prenda)).toBe(true);
      expect(s.texto.length).toBeLessThanOrEqual(MAX_EJEMPLO_LIQUIDACION);
    }
  });
  it("sin categoría, o una sin ficha, un texto neutro que no nombra ninguna prenda", () => {
    for (const ctx of [null, undefined, {}, { prefijo: "ZZZ", familia: "indumentaria" }]) {
      const s = sugerirDescripcionLiquidacion(ctx);
      expect(s.origen).toBe("neutro");
      for (const f of Object.values(FICHAS_POR_CATEGORIA)) expect(s.texto).not.toContain(f.prenda);
    }
  });
  it("sigue al control: A → B → A da lo mismo que A, sin azar", () => {
    const a = sugerirDescripcionLiquidacion({ prefijo: "CMS" });
    sugerirDescripcionLiquidacion({ prefijo: "PAN" });
    expect(sugerirDescripcionLiquidacion({ prefijo: "CMS" })).toEqual(a);
    expect(a.texto).toBe("Blusa beige, manga globo");
  });
});
