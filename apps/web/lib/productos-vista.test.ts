import { describe, it, expect } from "vitest";
import type { VarianteCatalogo } from "./catalogo-v2";
import { coloresDe, tallasDe, rangoSoles, margenDe, textoMargen, UMBRAL_MARGEN_BAJO } from "./productos-vista";

function v(parcial: Partial<VarianteCatalogo>): VarianteCatalogo {
  return {
    varianteId: "v",
    sku: "",
    codigo: null,
    talla: null,
    color: null,
    colorHex: null,
    fotoUrl: null,
    precio: 100,
    activo: true,
    productoId: "p",
    referencia: "Blazer Aurora",
    categoria: "Blazers",
    codigosBarras: [],
    ...parcial,
  };
}

describe("coloresDe", () => {
  it("un color por nombre, con la foto de su primera variante, en el orden en que llegan", () => {
    const cs = coloresDe([
      v({ color: "Negro", colorHex: "#111111", talla: "S", fotoUrl: "negro.jpg" }),
      v({ color: "Negro", colorHex: "#111111", talla: "M", fotoUrl: null }),
      v({ color: "Camel", colorHex: null, talla: "S" }),
      v({ color: null, talla: "L" }),
    ]);
    expect(cs).toEqual([
      { nombre: "Negro", hex: "#111111", fotoUrl: "negro.jpg" },
      { nombre: "Camel", hex: "#8A8A8A", fotoUrl: null },
    ]);
  });
});

describe("tallasDe", () => {
  it("sin repetir y sin las variantes sin talla", () => {
    expect(tallasDe([v({ talla: "S" }), v({ talla: "M" }), v({ talla: "S" }), v({ talla: null })])).toEqual(["S", "M"]);
  });
});

describe("rangoSoles", () => {
  it("un valor, un rango o nada", () => {
    expect(rangoSoles([289, 289])).toBe("S/289.00");
    expect(rangoSoles([249, 269])).toBe("S/249.00–269.00");
    expect(rangoSoles([null, null])).toBeNull();
    expect(rangoSoles([])).toBeNull();
  });
});

describe("margenDe", () => {
  it("rango sobre el precio y avisa por la variante que MENOS deja", () => {
    // 1 − 60/100 = 40 % (bajo el umbral) y 1 − 40/100 = 60 %
    const m = margenDe([
      { precio: 100, costo: 60 },
      { precio: 100, costo: 40 },
    ]);
    expect(m).toEqual({ min: 40, max: 60, bajo: true });
    expect(textoMargen(m!)).toBe("40–60 %");
  });

  it("sin costo no hay margen: un costo vacío no cuenta como cero (daría 100 %)", () => {
    expect(margenDe([{ precio: 100, costo: null }])).toBeNull();
    expect(margenDe([{ precio: 100, costo: null }, { precio: 100, costo: 50 }])).toEqual({ min: 50, max: 50, bajo: false });
  });

  it("un precio en cero no rompe la cuenta", () => {
    expect(margenDe([{ precio: 0, costo: 10 }])).toBeNull();
  });

  it("el umbral es de 45 % (provisional) y justo 45 no es bajo", () => {
    expect(UMBRAL_MARGEN_BAJO).toBe(45);
    expect(margenDe([{ precio: 100, costo: 55 }])?.bajo).toBe(false);
  });
});
