import { describe, expect, it } from "vitest";
import { conRebajaCts, cuentaDelPrecio, IGV, motivoDeCosto, pisoDelPrecio, type BandaDeCosto } from "./cuenta-de-precio";
import { readFileSync } from "node:fs";
// La tabla vive junto a la prueba de la base (`scripts/pruebas/`): las dos la leen, y la de la base no queda «leyendo la web».
const CASOS = JSON.parse(readFileSync(new URL("../../../scripts/pruebas/costo-dudoso-casos.json", import.meta.url), "utf8")) as {
  casos: { nombre: string; costo: number; anterior: number | null; deLaOrden: number | null; banda: unknown; motivo: string | null }[];
};

/** ¿Este precio, rebajado 35 %, deja de verdad 20 % de lo tuyo? (la definición, sin redondear) */
const aguanta = (precioCts: number, costoCts: number) => {
  const pd = conRebajaCts(precioCts, 35);
  return pd > 0 && (pd / IGV - costoCts) / (pd / IGV) >= 0.2 - 1e-12;
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

describe("pisoDelPrecio: «No bajes de», el precio que aguanta una rebaja de 35 %", () => {
  it("los casos de la maqueta: S/ 36 → S/ 81.90 y S/ 44 → S/ 99.90", () => {
    expect(pisoDelPrecio(36)).toBe(81.9);
    expect(pisoDelPrecio(44)).toBe(99.9);
    expect(pisoDelPrecio(18.5)).toBe(42.9);
  });
  it("20 % es 20 %: un precio que deja 19.95 % no pasa (se compara sin redondear)", () => {
    expect(pisoDelPrecio(5.63)).toBe(13.9);
    expect(pisoDelPrecio(96.06)).toBe(218.9);
  });
  it("es un margen de 20 % sobre el precio rebajado sin IGV (≈ ×2.27), no un recargo de 20 % sobre el costo (≈ ×2.18)", () => {
    // Que nadie lo «arregle»: con un recargo, S/ 100 de costo daría un piso cerca de S/ 218.
    expect(pisoDelPrecio(100)).toBe(227.9);
  });
  it("para todo costo de S/ 1 a S/ 500: termina en .90, aguanta la rebaja y el .90 de abajo no", () => {
    for (let c = 100; c <= 50_000; c += 37) {
      const costo = c / 100;
      const piso = pisoDelPrecio(costo);
      expect(piso).not.toBeNull();
      const pisoCts = Math.round((piso as number) * 100);
      expect(pisoCts % 100).toBe(90);
      expect(aguanta(pisoCts, c)).toBe(true);
      expect(aguanta(pisoCts - 100, c)).toBe(false);
    }
  });
  it("la rebaja se redondea hacia abajo al S/ 0.10, como en caja", () => {
    expect(conRebajaCts(8190, 35)).toBe(5320);
  });
  it("sin costo, o si ningún precio hasta el tope de S/ 5 000 lo logra, no hay piso", () => {
    expect(pisoDelPrecio(0)).toBeNull();
    expect(pisoDelPrecio(2300)).toBeNull();
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
