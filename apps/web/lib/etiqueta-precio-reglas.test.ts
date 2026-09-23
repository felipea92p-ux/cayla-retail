import { describe, it, expect } from "vitest";
import {
  armarEtiquetas,
  cantidadDeTexto,
  encabezadoDeEtiquetas,
  expandir,
  fechaDeAlcance,
  fechaEtiqueta,
  fechaVigencia,
  mejorCampanaPorVariante,
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

describe("mejorCampanaPorVariante — la misma que elige la caja", () => {
  const fila = (variante_id: string, etiqueta_id: string, etiqueta_nombre: string, descuento_pct: number) => ({ variante_id, etiqueta_id, etiqueta_nombre, descuento_pct });
  it("de varias campañas sobre una prenda, la de mayor % (un solo descuento, el mayor)", () => {
    const m = mejorCampanaPorVariante(
      [fila("a", "e1", "Aniversario CAYLA", 20), fila("a", "e2", "Liquidación", 40), fila("b", "e1", "Aniversario CAYLA", 20)],
      new Map([["e1", "2026-09-30"], ["e2", null]]),
    );
    expect(m.get("a")).toEqual({ etiquetaId: "e2", nombre: "Liquidación", pct: 40, hasta: null });
    expect(m.get("b")).toEqual({ etiquetaId: "e1", nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-09-30" });
  });
  it("el % llega como texto desde la base (numeric) y se lee como número", () => {
    const m = mejorCampanaPorVariante([{ variante_id: "a", etiqueta_id: "e1", etiqueta_nombre: "X", descuento_pct: "15.00" as unknown as number }], new Map());
    expect(m.get("a")?.pct).toBe(15);
  });
});

describe("armarEtiquetas con campaña (ADR-0180 paso 2)", () => {
  const campana = { etiquetaId: "e1", nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-09-30" };
  it("la etiqueta lleva el descuento de la caja: 79.90 con 20 % se cobra 63.90 (bajado al .90)", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S", { precio: 79.9 })], [], new Map([["s", campana]]));
    expect(etiquetas[0].campana).toEqual({ nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-09-30", descuento: 16 });
  });
  it("sin campaña vigente la etiqueta sale con el precio de lista", () => {
    const { etiquetas } = armarEtiquetas(new Map([["s", 1]]), [blusa("s", "S")], [], new Map());
    expect(etiquetas[0].campana).toBeNull();
  });
});

describe("fechaDeAlcance — qué día mirar para saber qué prendas alcanza una campaña", () => {
  const HOY = "2026-09-23";
  it("vigente o sin fechas: hoy", () => {
    expect(fechaDeAlcance("2026-09-01", "2026-09-30", HOY)).toBe(HOY);
    expect(fechaDeAlcance(null, null, HOY)).toBe(HOY);
  });
  it("terminada: su último día (para volver al precio normal lo que alcanzó)", () => {
    expect(fechaDeAlcance("2026-08-12", "2026-08-26", HOY)).toBe("2026-08-26");
  });
  it("próxima: su primer día", () => {
    expect(fechaDeAlcance("2026-10-01", "2026-10-10", HOY)).toBe("2026-10-01");
  });
});

describe("fechaVigencia", () => {
  it("«válido hasta el 30.09»", () => {
    expect(fechaVigencia("2026-09-30")).toBe("30.09");
  });
});

describe("urlEtiquetasDePrecio — desde una campaña o un producto", () => {
  const A = "7f1c1e2a-3b4c-4d5e-8f60-718293a4b5c6";
  it("arma el enlace de cada origen", () => {
    expect(urlEtiquetasDePrecio({ campana: A })).toBe(`/etiquetas-de-precio?campana=${A}`);
    expect(urlEtiquetasDePrecio({ producto: A })).toBe(`/etiquetas-de-precio?producto=${A}`);
  });
});

describe("encabezadoDeEtiquetas — lo que dice la pantalla según el origen", () => {
  const n = { unidades: 24, modelos: 3 };
  it("un ingreso cuenta lo que entró", () => {
    const e = encabezadoDeEtiquetas({ tipo: "lotes" }, n, "Tienda Lima");
    expect(e.bajada).toContain("Entraron 24 prendas de 3 modelos");
    expect(e.columnaCantidad).toBe("Entraron");
  });
  it("una campaña vigente dice su % y que sale con el precio rebajado", () => {
    const e = encabezadoDeEtiquetas({ tipo: "campana", campana: { nombre: "Aniversario CAYLA", pct: 20, vigencia: { estado: "vigente", hasta: "2026-09-30" } } }, n, "Tienda Lima");
    expect(e.sobretitulo).toBe("Campaña · Aniversario CAYLA");
    expect(e.bajada).toContain("En Tienda Lima hay 24 prendas de 3 modelos con la campaña (−20 %)");
  });
  it("una campaña terminada no es un error: es volver al precio normal", () => {
    const e = encabezadoDeEtiquetas({ tipo: "campana", campana: { nombre: "Día del Perro", pct: 15, vigencia: { estado: "terminada", hasta: "2026-08-26" } } }, n, "Tienda Lima");
    expect(e.titulo).toBe("Volver al precio normal");
    expect(e.bajada).toContain("terminó el 26 ago");
  });
  it("una campaña que no empieza no imprime: la etiqueta diría el precio de hoy", () => {
    const e = encabezadoDeEtiquetas({ tipo: "campana", campana: { nombre: "Navidad", pct: 30, vigencia: { estado: "proxima", desde: "2026-12-01", enDias: 69 } } }, n, "Tienda Lima");
    expect(e.vacio).toContain("Empieza el 1 dic");
  });
  it("una etiqueta sin descuento no es una campaña", () => {
    expect(encabezadoDeEtiquetas({ tipo: "campana", campana: null }, n, "Tienda Lima").vacio).toContain("no tiene descuento");
  });
  it("un producto habla de lo que hay en la tienda", () => {
    const e = encabezadoDeEtiquetas({ tipo: "producto", nombre: "Blusa Emma" }, { unidades: 1, modelos: 1 }, "Tienda Trujillo");
    expect(e.sobretitulo).toBe("Productos · Blusa Emma");
    expect(e.bajada).toContain("En Tienda Trujillo hay 1 prenda de este modelo");
  });
});
