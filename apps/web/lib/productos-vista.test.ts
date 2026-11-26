import { describe, it, expect } from "vitest";
import type { VarianteCatalogo } from "./catalogo-v2";
import { margenALaVista } from "./margen-a-la-vista";
import { colorPrincipal, coloresDe, tallasDe, ordenarVariantes, rangoSoles, margenDe, textoMargen, variantesQueSeVenden } from "./productos-vista";

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

  it("una talla sin foto no le quita la foto al color: vale la primera que la tenga", () => {
    const [c] = coloresDe([v({ color: "Negro", talla: "S", fotoUrl: null }), v({ color: "Negro", talla: "M", fotoUrl: "negro.jpg" })]);
    expect(c.fotoUrl).toBe("negro.jpg");
  });
});

describe("colorPrincipal", () => {
  it("abre en el primer color con foto, aunque no sea el primero de la lista", () => {
    const cs = coloresDe([v({ color: "Camel" }), v({ color: "Negro", fotoUrl: "negro.jpg" }), v({ color: "Vino", fotoUrl: "vino.jpg" })]);
    expect(colorPrincipal(cs)?.nombre).toBe("Negro");
  });
  it("si ningún color tiene foto, el primero", () => {
    expect(colorPrincipal(coloresDe([v({ color: "Camel" }), v({ color: "Negro" })]))?.nombre).toBe("Camel");
    expect(colorPrincipal([])).toBeUndefined();
  });
});

describe("tallasDe", () => {
  it("sin repetir, sin las variantes sin talla y en orden de curva", () => {
    expect(tallasDe([v({ talla: "L" }), v({ talla: "M" }), v({ talla: "S" }), v({ talla: "XS" }), v({ talla: "M" }), v({ talla: null })])).toEqual(["XS", "S", "M", "L"]);
  });
});

describe("ordenarVariantes", () => {
  it("por color (el orden en que aparecen) y dentro de cada color por curva de talla", () => {
    const orden = ordenarVariantes([
      { color: "Negro", talla: "L" },
      { color: "Camel", talla: "M" },
      { color: "Negro", talla: "S" },
      { color: "Camel", talla: "XS" },
    ]).map((x) => `${x.color}-${x.talla}`);
    expect(orden).toEqual(["Negro-S", "Negro-L", "Camel-XS", "Camel-M"]);
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

describe("margenDe: la cuenta única, contra el objetivo de la prenda (ADR-0668, ADR-0700)", () => {
  it("la lista dice el MISMO % que la ficha de la prenda, talla por talla", () => {
    const variantes = [
      { precio: 69.9, costo: 28 },
      { precio: 10, costo: 5 },
      { precio: 129.9, costo: 50 },
    ];
    const m = margenDe(variantes, 40);
    const deLaFicha = variantes.map((v) => margenALaVista(v.costo, v.precio, 40)!.pct);
    expect(m?.min).toBe(Math.min(...deLaFicha));
    expect(m?.max).toBe(Math.max(...deLaFicha));
  });

  it("ya no es la resta con IGV adentro: de S/ 100 con S/ 60 de costo quedan 29 %, no 40 %", () => {
    expect(textoMargen(margenDe([{ precio: 100, costo: 60 }], 37)!)).toBe("29 %");
  });

  it("avisa por la talla que MENOS deja, contra el objetivo de ESA prenda", () => {
    // S/ 10 con S/ 5 de costo deja 41 %: bien con un objetivo de 40, bajo con uno de 46 (dos casillas más).
    const blusa = [{ precio: 69.9, costo: 28 }, { precio: 10, costo: 5 }];
    expect(margenDe(blusa, 40)).toMatchObject({ bajo: false, pierde: false, objetivo: 40 });
    expect(margenDe(blusa, 46)).toMatchObject({ bajo: true, pierde: false, objetivo: 46 });
  });

  it("una talla que no cubre lo pagado más la parte de SUNAT pierde (y también queda bajo)", () => {
    expect(margenDe([{ precio: 40, costo: 36 }, { precio: 99.9, costo: 36 }], 37)).toMatchObject({ bajo: true, pierde: true });
  });

  it("sin costo no hay margen: un costo vacío o en cero no cuenta (daría 100 %)", () => {
    expect(margenDe([{ precio: 100, costo: null }], 37)).toBeNull();
    expect(margenDe([{ precio: 80, costo: 0 }], 37)).toBeNull();
    expect(margenDe([{ precio: 80, costo: 0 }, { precio: 80, costo: 32 }], 37)?.min).toBe(margenALaVista(32, 80, 37)!.pct);
  });

  it("un precio en cero no rompe la cuenta", () => {
    expect(margenDe([{ precio: 0, costo: 10 }], 37)).toBeNull();
  });
});

describe("variantes desactivadas (un color o una talla quitados de la ficha)", () => {
  const vs = [
    v({ varianteId: "a", color: "Negro", colorHex: "#111111", talla: "S", precio: 60 }),
    v({ varianteId: "b", color: "Verde oliva", colorHex: "#556b2f", talla: "L", precio: 90, activo: false }),
  ];
  it("no cuentan: ni su color, ni su talla, ni su lugar en la lista", () => {
    expect(variantesQueSeVenden(vs).map((x) => x.varianteId)).toEqual(["a"]);
    expect(coloresDe(vs).map((c) => c.nombre)).toEqual(["Negro"]);
    expect(tallasDe(vs)).toEqual(["S"]);
  });
  it("un modelo con TODAS desactivadas las conserva (descontinuado no queda sin colores ni precio)", () => {
    const todas = vs.map((x) => ({ ...x, activo: false }));
    expect(variantesQueSeVenden(todas)).toHaveLength(2);
    expect(coloresDe(todas)).toHaveLength(2);
  });
});
