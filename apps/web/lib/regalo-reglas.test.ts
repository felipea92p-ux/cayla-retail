import { describe, expect, it } from "vitest";
import { detallePrendaComprada } from "./regalo-reglas";

describe("«es para regalo» en la ficha (ADR-0288 D-7)", () => {
  it("lista la prenda y dice si fue regalo", () => {
    expect(detallePrendaComprada({ cantidad: 1, categoria: "Blusas", talla: "S", esRegalo: true })).toBe("1× Blusas (S) · regalo");
    expect(detallePrendaComprada({ cantidad: 2, categoria: "Blusas", talla: "M", esRegalo: false })).toBe("2× Blusas (M)");
  });

  it("sin categoría ni talla, como antes: «1× prenda»", () => {
    expect(detallePrendaComprada({ cantidad: 1, categoria: null, talla: null, esRegalo: false })).toBe("1× prenda");
    expect(detallePrendaComprada({ cantidad: 1, categoria: null, talla: null, esRegalo: true })).toBe("1× prenda · regalo");
  });
});
