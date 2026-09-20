import { describe, expect, it } from "vitest";
import { ayudaRotacionComparada, formatoDeltaDias, formatoDeltaPp, formatoRotacion, formatoSellThrough, formatoSolesCompacto, textoCobertura, textoUniversoRotacion, textoUniversoSellThrough } from "./resumen-formato";
import { rotacionComparada, type BaseRotacion } from "./rotacion";

describe("formatoSolesCompacto", () => {
  it("bajo mil va entero; en miles con un decimal; en millones con dos", () => {
    expect(formatoSolesCompacto(0)).toBe("S/ 0");
    expect(formatoSolesCompacto(950.4)).toBe("S/ 950");
    expect(formatoSolesCompacto(18_412)).toBe("S/ 18.4k");
    expect(formatoSolesCompacto(21_700)).toBe("S/ 21.7k");
    expect(formatoSolesCompacto(20_000)).toBe("S/ 20k");
    expect(formatoSolesCompacto(125_000)).toBe("S/ 125k");
    expect(formatoSolesCompacto(1_250_000)).toBe("S/ 1.25M");
  });

  it("un negativo lleva el signo delante", () => {
    expect(formatoSolesCompacto(-1_500)).toBe("−S/ 1.5k");
  });
});

describe("formatoRotacion y formatoDeltaDias", () => {
  it("rotación con dos decimales y una «x»", () => {
    expect(formatoRotacion(0.7391)).toBe("0.74x");
    expect(formatoRotacion(0)).toBe("0.00x");
  });

  it("diferencia de días con signo, en singular cuando toca", () => {
    expect(formatoDeltaDias(-4)).toBe("−4 días");
    expect(formatoDeltaDias(1)).toBe("+1 día");
    expect(formatoDeltaDias(0.2)).toBe("sin cambio");
    expect(formatoDeltaDias(-3.6)).toBe("−4 días");
  });

  it("sell-through: porcentaje entero; diferencia en puntos porcentuales con signo", () => {
    expect(formatoSellThrough(61.4)).toBe("61%");
    expect(formatoSellThrough(0)).toBe("0%");
    expect(formatoDeltaPp(19.4)).toBe("+19 pp");
    expect(formatoDeltaPp(-4)).toBe("−4 pp");
    expect(formatoDeltaPp(0.2)).toBe("0 pp");
  });
});

describe("textoCobertura", () => {
  it("escribe cada tipo sin NaN ni undefined", () => {
    expect(textoCobertura({ tipo: "agotado", dias: 0 })).toBe("0 d");
    expect(textoCobertura({ tipo: "medida", dias: 3.3 })).toBe("3.3 d");
    expect(textoCobertura({ tipo: "medida", dias: 90 })).toBe("> 60 d");
    expect(textoCobertura({ tipo: "sin_ventas", dias: null })).toBe("Sin ventas");
    expect(textoCobertura({ tipo: "sin_historial", dias: null })).toBe("N/D");
  });
});

describe("universo de la rotación: cómo se dice con qué variantes se calculó", () => {
  const ok = (cogs: number, inventario: number): BaseRotacion => ({ cogs, inventarioInicio: inventario, inventarioCierre: inventario });
  const sinCosto: BaseRotacion = { cogs: null, inventarioInicio: 400, inventarioCierre: 400 };
  const sinInventario: BaseRotacion = { cogs: 100, inventarioInicio: 0, inventarioCierre: 0 };

  it("si entraron todas no hay nada que avisar; si no, «N de M variantes comparables» (sin alarma)", () => {
    expect(textoUniversoRotacion(rotacionComparada([{ a: ok(100, 400), b: ok(200, 400) }]))).toBeNull();
    expect(textoUniversoRotacion(rotacionComparada([]))).toBeNull();
    const parcial = rotacionComparada([{ a: ok(100, 400), b: ok(200, 400) }, { a: sinCosto, b: ok(200, 400) }, { a: ok(100, 400), b: ok(200, 400) }]);
    expect(textoUniversoRotacion(parcial)).toBe("2 de 3 variantes comparables");
    expect(textoUniversoRotacion(rotacionComparada([{ a: sinCosto, b: sinCosto }]))).toBe("0 de 1 variante comparable");
  });

  it("«textoUniversoSellThrough» dice lo mismo con el vocabulario del KPI de sell-through", () => {
    expect(textoUniversoSellThrough({ totalVariantes: 3, variantesComparables: 2, variantesExcluidas: 1 })).toBe("2 de 3 variantes comparables");
    expect(textoUniversoSellThrough({ totalVariantes: 3, variantesComparables: 3, variantesExcluidas: 0 })).toBeNull();
    expect(textoUniversoSellThrough({ totalVariantes: 0, variantesComparables: 0, variantesExcluidas: 0 })).toBeNull();
  });

  it("el tooltip es solo la fórmula cuando todo entró; con exclusiones agrega el cruce A/B y los motivos", () => {
    const todo = rotacionComparada([{ a: ok(100, 400), b: ok(200, 400) }]);
    expect(ayudaRotacionComparada(todo)).toBe("Veces que rotó el inventario en el período. COGS del período ÷ inventario promedio a costo. El inventario promedio se estima con los valores de inicio y cierre del período.");

    const parcial = rotacionComparada([
      { a: ok(100, 400), b: ok(200, 400) },
      { a: sinCosto, b: ok(200, 400) },
      { a: ok(100, 400), b: sinInventario },
    ]);
    const ayuda = ayudaRotacionComparada(parcial);
    expect(ayuda).toContain("Se calcula solo con las 1 variantes con datos válidos en A y en B a la vez (2 en A, 2 en B)");
    expect(ayuda).toContain("Fuera del cálculo: Hay ventas sin costo registrado (1) · No hubo inventario promedio en el período (1).");
  });

  it("sin ninguna variante en común lo dice: no hay cifra, y por qué", () => {
    const ninguna = rotacionComparada([{ a: sinCosto, b: ok(200, 400) }, { a: ok(100, 400), b: sinInventario }]);
    const ayuda = ayudaRotacionComparada(ninguna);
    expect(ayuda).toContain("Ninguna variante tiene datos válidos en A y en B a la vez (1 en A, 1 en B), así que no hay cifra.");
    expect(ayuda).not.toContain("NaN");
    expect(ayuda).not.toContain("undefined");
  });
});
