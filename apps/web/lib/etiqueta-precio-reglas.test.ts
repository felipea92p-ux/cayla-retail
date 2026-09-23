import { describe, it, expect } from "vitest";
import {
  armarEtiquetas,
  cantidadDeTexto,
  expandir,
  fechaEtiqueta,
  idsDeParam,
  precioEtiqueta,
  sumarEntradas,
  tallasDelModelo,
  urlEtiquetasDePrecio,
  type HermanaEtiqueta,
  type VarianteEtiqueta,
} from "./etiqueta-precio-reglas";

const blusa = (id: string, talla: string | null, extra: Partial<VarianteEtiqueta> = {}): VarianteEtiqueta => ({
  id,
  productoId: "blusa",
  prenda: "Blusa Lino Manga Globo",
  codigo: `BLU-0042-AZM-${talla ?? "X"}`,
  sku: null,
  precio: 89.9,
  colorCodigo: "AZM",
  color: "Azul marino",
  talla,
  ...extra,
});
const hermana = (talla: string | null, colorCodigo: string | null = "AZM", activo = true): HermanaEtiqueta => ({ productoId: "blusa", colorCodigo, talla, activo });

describe("sumarEntradas", () => {
  it("junta las entradas de la misma prenda (un envío puede traerla de dos proveedores)", () => {
    const s = sumarEntradas([
      { variante_id: "a", cantidad: 3 },
      { variante_id: "b", cantidad: 1 },
      { variante_id: "a", cantidad: 2 },
    ]);
    expect(Object.fromEntries(s)).toEqual({ a: 5, b: 1 });
  });
});

describe("tallasDelModelo", () => {
  it("las del mismo modelo y color, ordenadas como en tienda (XS antes que S)", () => {
    const run = tallasDelModelo(blusa("m", "M"), [hermana("XL"), hermana("S"), hermana("M"), hermana("XS"), hermana("L")]);
    expect(run).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("no mezcla las tallas de otro color ni las apagadas, pero siempre incluye la propia", () => {
    const run = tallasDelModelo(blusa("m", "M"), [hermana("S", "NEG"), hermana("L", "AZM", false), hermana("XL")]);
    expect(run).toEqual(["M", "XL"]);
  });

  it("las numéricas van por valor", () => {
    const run = tallasDelModelo(blusa("p", "30"), [hermana("34"), hermana("26"), hermana("30"), hermana("28")]);
    expect(run).toEqual(["26", "28", "30", "34"]);
  });

  it("sin talla no hay fila", () => {
    expect(tallasDelModelo(blusa("x", null), [hermana(null)])).toEqual([]);
  });
});

describe("armarEtiquetas", () => {
  it("una fila por prenda con lo que entró, ordenada por modelo, color y talla", () => {
    const entradas = new Map([
      ["l", 2],
      ["s", 4],
    ]);
    const { etiquetas, sinCodigo } = armarEtiquetas(entradas, [blusa("l", "L"), blusa("s", "S")], [hermana("S"), hermana("M"), hermana("L")]);
    expect(sinCodigo).toEqual([]);
    expect(etiquetas.map((e) => [e.talla, e.cantidad])).toEqual([
      ["S", 4],
      ["L", 2],
    ]);
    expect(etiquetas[0]).toMatchObject({ codigo: "BLU-0042-AZM-S", prenda: "Blusa Lino Manga Globo", color: "Azul marino", precio: 89.9, tallasDelModelo: ["S", "M", "L"] });
  });

  it("sin código corto usa el SKU viejo (la caja también lo resuelve); sin ninguno, avisa y no la imprime", () => {
    const entradas = new Map([
      ["viejo", 1],
      ["nada", 1],
    ]);
    const { etiquetas, sinCodigo } = armarEtiquetas(
      entradas,
      [blusa("viejo", "M", { codigo: null, sku: "BLUSA-LINO-M-AZUL" }), blusa("nada", "L", { codigo: "  ", sku: null })],
      [],
    );
    expect(etiquetas.map((e) => e.codigo)).toEqual(["BLUSA-LINO-M-AZUL"]);
    expect(sinCodigo).toEqual(["Blusa Lino Manga Globo · Azul marino · L"]);
  });

  it("una entrada cuya prenda no llegó en la lectura no se inventa", () => {
    const { etiquetas } = armarEtiquetas(new Map([["fantasma", 3]]), [], []);
    expect(etiquetas).toEqual([]);
  });
});

describe("expandir", () => {
  it("repite cada etiqueta tantas veces como se pidió, en orden", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 2], ["m", 1]]), [blusa("s", "S"), blusa("m", "M")], []);
    const hoja = expandir(etiquetas, { s: 2, m: 0 });
    expect(hoja.map((e) => e.talla)).toEqual(["S", "S"]);
  });

  it("si no se tocó la cantidad, imprime lo que entró", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 3]]), [blusa("s", "S")], []);
    expect(expandir(etiquetas, {}).length).toBe(3);
  });
});

describe("cantidadDeTexto", () => {
  it.each([
    ["3", 3],
    ["", 0],
    ["-2", 0],
    ["2.7", 2],
    ["abc", 0],
    ["5000", 999],
  ])("%j → %d", (texto, esperado) => {
    expect(cantidadDeTexto(texto)).toBe(esperado);
  });
});

describe("precioEtiqueta y fechaEtiqueta", () => {
  it("dos decimales con punto, y separador de miles", () => {
    expect(precioEtiqueta(89.9)).toBe("89.90");
    expect(precioEtiqueta(1299.9)).toBe("1,299.90");
    expect(precioEtiqueta(40)).toBe("40.00");
  });

  it("la fecha de impresión va corta: dd.mm.aa", () => {
    expect(fechaEtiqueta("2026-09-23")).toBe("23.09.26");
  });
});

describe("idsDeParam", () => {
  const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
  const B = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
  it("acepta uno o varios separados por coma, sin repetir", () => {
    expect(idsDeParam(`${A},${B},${A}`)).toEqual([A, B]);
    expect(idsDeParam([A, B])).toEqual([A, B]);
  });

  it("descarta lo que no es un id (la URL la puede escribir cualquiera)", () => {
    expect(idsDeParam("1; drop table,abc")).toEqual([]);
    expect(idsDeParam(undefined)).toEqual([]);
  });
});

describe("urlEtiquetasDePrecio", () => {
  it("lleva los lotes del ingreso, o la producción del Taller, y la pantalla los lee de vuelta", () => {
    const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
    const B = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
    const url = urlEtiquetasDePrecio({ lotes: [A, B] });
    expect(url).toBe(`/etiquetas-de-precio?lotes=${A},${B}`);
    expect(idsDeParam(new URL(url, "http://x").searchParams.get("lotes") ?? "")).toEqual([A, B]);
    expect(urlEtiquetasDePrecio({ produccion: A })).toBe(`/etiquetas-de-precio?produccion=${A}`);
  });
});
