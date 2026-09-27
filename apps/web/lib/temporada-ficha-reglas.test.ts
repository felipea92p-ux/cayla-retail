import { describe, expect, it } from "vitest";
import {
  cambiosTemporadaPorColor,
  coloresConVariantesActivas,
  coloresSinTemporadaConocida,
  MIN_COLORES_PARA_TEMPORADA_POR_COLOR,
  ofrecerTemporadaPorColor,
  temporadaHeredadaPorColor,
  temporadaParaAlta,
  temporadasPropiasPorColor,
} from "./temporada-ficha-reglas";
import type { TemporadaEfectiva } from "./temporada-reglas";

const fila = (color_codigo: string | null, temporada: string | null, origen: TemporadaEfectiva["origen"]): TemporadaEfectiva => ({
  producto_id: "p1",
  color_codigo,
  estado: "activo",
  temporada,
  origen,
});

describe("temporadasPropiasPorColor — solo las excepciones que la prenda ya tiene", () => {
  it("toma los colores con temporada propia y deja fuera los que heredan", () => {
    const filas = [fila("NEG", "invierno", "color"), fila("BLA", "verano", "producto"), fila("ROJ", "verano", "categoria"), fila("AZU", null, null)];
    expect(temporadasPropiasPorColor(filas)).toEqual({ NEG: "invierno" });
  });
  it("una prenda sin color no tiene excepción posible", () => {
    expect(temporadasPropiasPorColor([fila(null, "verano", "producto")])).toEqual({});
  });
});

describe("coloresConVariantesActivas — a qué colores se les ofrece temporada propia", () => {
  it("sin repetir, en el orden de la tabla, y sin las variantes apagadas ni las filas sin color", () => {
    const variantes = [
      { colorCodigo: "NEG", activo: true },
      { colorCodigo: "BLA", activo: true },
      { colorCodigo: "NEG", activo: true },
      { colorCodigo: "ROJ", activo: false },
      { colorCodigo: "", activo: true },
    ];
    expect(coloresConVariantesActivas(variantes)).toEqual(["NEG", "BLA"]);
  });
  it("un color con una talla apagada y otra activa sigue contando", () => {
    expect(coloresConVariantesActivas([{ colorCodigo: "NEG", activo: false }, { colorCodigo: "NEG", activo: true }])).toEqual(["NEG"]);
  });
  it("la sección aparece desde dos colores: con uno, la del producto ya es la del color", () => {
    expect(MIN_COLORES_PARA_TEMPORADA_POR_COLOR).toBe(2);
  });
});

describe("cambiosTemporadaPorColor — una sola llamada, con solo lo que cambió", () => {
  it("nada tocado → no se llama a la base", () => {
    expect(cambiosTemporadaPorColor(["NEG", "BLA"], { NEG: "invierno" }, { NEG: "invierno" })).toBeNull();
  });
  it("poner una excepción manda la clave; quitarla manda null (vuelve a seguir a su prenda)", () => {
    expect(cambiosTemporadaPorColor(["NEG", "BLA"], { BLA: "verano", NEG: "" }, { NEG: "invierno" })).toEqual({ BLA: "verano", NEG: null });
  });
  it("cambiar de una excepción a otra manda la nueva", () => {
    expect(cambiosTemporadaPorColor(["NEG"], { NEG: "clasico_invierno" }, { NEG: "invierno" })).toEqual({ NEG: "clasico_invierno" });
  });
  it("un color que ya no está en la ficha no se toca, aunque tuviera excepción", () => {
    expect(cambiosTemporadaPorColor(["BLA"], {}, { NEG: "invierno" })).toBeNull();
  });
});

describe("ofrecerTemporadaPorColor — una excepción guardada nunca queda escondida", () => {
  it("desde dos colores, siempre", () => {
    expect(ofrecerTemporadaPorColor(["NEG", "BLA"], {})).toBe(true);
  });
  it("con un solo color y sin excepción, no (la temporada de la prenda ya es la del color)", () => {
    expect(ofrecerTemporadaPorColor(["MAR"], {})).toBe(false);
  });
  it("con un solo color que YA tiene la suya, sí: si no, mandaría sin que nadie la vea ni pueda quitarla", () => {
    // Marfil es Invierno en un modelo Verano; se apagó Negro y quedó solo Marfil.
    expect(ofrecerTemporadaPorColor(["MAR"], { MAR: "invierno", NEG: "verano" })).toBe(true);
  });
  it("con un solo color cuya temporada propia no se conoce (se reactivó), también", () => {
    expect(ofrecerTemporadaPorColor(["NEG"], {}, ["NEG"])).toBe(true);
  });
});

describe("coloresSinTemporadaConocida — lo que la ficha no puede saber de un color apagado", () => {
  const alAbrir = [
    { colorCodigo: "MAR", activo: true },
    { colorCodigo: "NEG", activo: false },
    { colorCodigo: "NEG", activo: false },
    { colorCodigo: "ROJ", activo: false },
    { colorCodigo: "ROJ", activo: true },
    { colorCodigo: null, activo: false },
  ];
  it("un color que estaba todo apagado y se reactiva: su excepción (si la tiene) no llegó a la ficha", () => {
    expect(coloresSinTemporadaConocida(alAbrir, ["MAR", "NEG", "ROJ"])).toEqual(["NEG"]);
  });
  it("un color con alguna talla activa al abrir sí se conoce; uno que la prenda nunca tuvo no puede tener excepción", () => {
    expect(coloresSinTemporadaConocida(alAbrir, ["ROJ", "AZU"])).toEqual([]);
  });
  it("si sigue apagado, no se ofrece: no hay nada que decir", () => {
    expect(coloresSinTemporadaConocida(alAbrir, ["MAR"])).toEqual([]);
  });
});

describe("temporadaHeredadaPorColor — el «(Verano)» de «Igual que su prenda (Verano)»", () => {
  it("la de la prenda manda sobre la de su categoría", () => {
    expect(temporadaHeredadaPorColor("invierno", "verano")).toBe("invierno");
  });
  it("sin la de la prenda, la de su categoría", () => {
    expect(temporadaHeredadaPorColor("", "verano")).toBe("verano");
  });
  it("sin ninguna de las dos, sin temporada", () => {
    expect(temporadaHeredadaPorColor("", null)).toBeNull();
    expect(temporadaHeredadaPorColor("", undefined)).toBeNull();
  });
});

describe("temporadaParaAlta — p_temporada viaja solo si se eligió una", () => {
  it("la opción de herencia no manda nada (la prenda sigue a su categoría)", () => {
    expect(temporadaParaAlta("")).toBeUndefined();
  });
  it("una temporada elegida viaja tal cual (su clave)", () => {
    expect(temporadaParaAlta("primavera_verano")).toBe("primavera_verano");
  });
  it("sin la clave en el cuerpo, la base vieja (sin el parámetro) acepta el alta igual", () => {
    expect(JSON.stringify({ p_referencia: "Blusa", p_temporada: temporadaParaAlta("") })).toBe('{"p_referencia":"Blusa"}');
  });
});
