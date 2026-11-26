import { describe, expect, it } from "vitest";
import { conRebajaCts, cuentaDelPrecio, IGV, motivoDeCosto, pierdeConElPrecio, type BandaDeCosto } from "./cuenta-de-precio";
import { readFileSync } from "node:fs";
// La tabla vive junto a la prueba de la base (`scripts/pruebas/`): las dos la leen, y la de la base no queda «leyendo la web».
const CASOS = JSON.parse(readFileSync(new URL("../../../scripts/pruebas/costo-dudoso-casos.json", import.meta.url), "utf8")) as {
  casos: { nombre: string; costo: number; anterior: number | null; deLaOrden: number | null; banda: unknown; motivo: string | null }[];
};

// La cuenta única (ADR-0668, Felipe 2026-11-15). El ejemplo de siempre: pagaste S/ 36 (con IGV, el total del papel) y la etiqueta dice S/ 70.

describe("cuentaDelPrecio: todas las prendas igual, con o sin factura", () => {
  it("de S/ 70, S/ 10.68 son de SUNAT y te quedan S/ 23.32 (no los S/ 34 de la resta)", () => {
    expect(cuentaDelPrecio(36, 70)).toEqual({ sunat: 10.68, teQuedan: 23.32, margenPorMil: 393 });
  });
  it("con S/ 40 se pierde S/ 2.10: el precio no cubre lo pagado más la parte de SUNAT", () => {
    expect(cuentaDelPrecio(36, 40)).toEqual({ sunat: 6.1, teQuedan: -2.1, margenPorMil: -62 });
  });
  it("sin costo o sin precio no hay cuenta", () => {
    expect(cuentaDelPrecio(0, 70)).toBeNull();
    expect(cuentaDelPrecio(36, 0)).toBeNull();
    expect(cuentaDelPrecio(Number.NaN, 70)).toBeNull();
  });
});

// El piso de ×2.27 («No bajes de», la rebaja de 35 % que deja 20 %) se fue con ADR-0700: el piso de una prenda es su margen objetivo.
describe("conRebajaCts", () => {
  it("la rebaja se redondea hacia abajo al S/ 0.10, como en caja", () => {
    expect(conRebajaCts(8190, 35)).toBe(5320);
  });
});


describe("motivoDeCosto: el costo dudoso, el mismo de la base (ADR-0668, A4)", () => {
  // La misma tabla que corre `scripts/pruebas/costo_dudoso.mjs` contra `retail.fn_motivo_de_costo_con`.
  for (const c of CASOS.casos) {
    it(`${c.nombre}: ${c.motivo ?? "nada que confirmar"}`, () => {
      expect(motivoDeCosto(c.costo, { anterior: c.anterior, deLaOrden: c.deLaOrden, banda: c.banda as BandaDeCosto | null })).toBe(c.motivo);
    });
  }
  it("sin lectura de referencia (la base no respondió), no inventa una duda", () => {
    expect(motivoDeCosto(440, null)).toBeNull();
  });
  it("usa el IGV que trae la lectura: con otra tasa, lo «sin IGV» es otro monto", () => {
    expect(motivoDeCosto(19.85, { anterior: null, deLaOrden: 21.83, banda: null }, 0.1)).toBe("sin_igv");
    expect(motivoDeCosto(19.85, { anterior: null, deLaOrden: 21.83, banda: null })).toBeNull();
  });
});

describe("pierdeConElPrecio: «Pierdes», la misma regla de la base (ADR-0668, A5)", () => {
  // La misma tabla que corre `scripts/pruebas/pierde_confirma.mjs` contra `retail.fn_pierde_con`.
  const PIERDE = JSON.parse(readFileSync(new URL("../../../scripts/pruebas/pierde-casos.json", import.meta.url), "utf8")) as {
    casos: { nombre: string; precio: number; costo: number; pierde: boolean }[];
  };
  for (const c of PIERDE.casos) {
    it(`${c.nombre}: ${c.pierde ? "pierde" : "no pierde"}`, () => {
      expect(pierdeConElPrecio(c.precio, c.costo)).toBe(c.pierde);
    });
  }
  it("dice lo mismo que la línea «Te quedan»: pierde exactamente cuando la cuenta es negativa", () => {
    for (let costo = 1; costo <= 120; costo += 0.37) {
      for (let precio = costo; precio <= costo * 1.3; precio += 0.13) {
        const c = Math.round(costo * 100) / 100;
        const p = Math.round(precio * 100) / 100;
        expect(pierdeConElPrecio(p, c)).toBe((cuentaDelPrecio(c, p)?.teQuedan ?? 0) < 0);
      }
    }
  });
});
