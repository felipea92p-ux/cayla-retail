import { describe, it, expect } from "vitest";
import { agruparPorDia, DIAS_PLAZO_CAMBIO, estadoPlazoCambio, etiquetaDia, opcionesDeCambio } from "./cambios-reglas";

// El caso que rompía (2026-09-16): dos prendas del censo, ambas sin sku. Buscar "la
// vendida" por sku calzaba con la primera sin sku del catálogo, no con la vendida.
const catalogo = [
  { varianteId: "v-blusa-s", sku: null, codigo: "BLU-0001-NEG-S", stockAqui: 3 },
  { varianteId: "v-blusa-m", sku: null, codigo: "BLU-0001-NEG-M", stockAqui: 2 },
  { varianteId: "v-vestido-m", sku: "VES-SOFI-NEG-M", codigo: "VES-0002-NEG-M", stockAqui: 0 },
];

describe("opcionesDeCambio", () => {
  it("excluye la variante vendida aunque otras prendas tampoco tengan sku", () => {
    const opciones = opcionesDeCambio(catalogo, "v-blusa-m").map((v) => v.varianteId);
    expect(opciones).not.toContain("v-blusa-m");
    expect(opciones).toContain("v-blusa-s");
  });

  it("no ofrece una variante sin stock en la sede", () => {
    expect(opcionesDeCambio(catalogo, "v-blusa-s").map((v) => v.varianteId)).toEqual(["v-blusa-m"]);
  });
});

function lima(anio: number, mes: number, dia: number, hora = 12): Date {
  return new Date(Date.UTC(anio, mes - 1, dia, hora + 5));
}

describe("estadoPlazoCambio — R-38, 15 días", () => {
  const ahora = lima(2026, 9, 18);

  it("recién vendida: vigente con los 15 días completos", () => {
    expect(estadoPlazoCambio(lima(2026, 9, 18).toISOString(), ahora)).toEqual({ estado: "vigente", diasRestantes: DIAS_PLAZO_CAMBIO });
  });

  it("a 3 días de vencer, pasa a 'por vencer'", () => {
    // vendida hace 12 días → quedan 3
    expect(estadoPlazoCambio(lima(2026, 9, 6).toISOString(), ahora)).toEqual({ estado: "por_vencer", diasRestantes: 3 });
  });

  it("a 4 días de vencer, todavía vigente", () => {
    // vendida hace 11 días → quedan 4
    expect(estadoPlazoCambio(lima(2026, 9, 7).toISOString(), ahora)).toEqual({ estado: "vigente", diasRestantes: 4 });
  });

  it("el día 16 ya está fuera de plazo", () => {
    expect(estadoPlazoCambio(lima(2026, 9, 2).toISOString(), ahora)).toEqual({ estado: "fuera_de_plazo", diasRestantes: -1 });
  });
});

describe("etiquetaDia / agruparPorDia", () => {
  const ahora = lima(2026, 9, 18, 20);

  it("hoy y ayer se leen como texto, el resto como fecha", () => {
    expect(etiquetaDia(lima(2026, 9, 18, 9).toISOString(), ahora)).toBe("Hoy");
    expect(etiquetaDia(lima(2026, 9, 17, 23).toISOString(), ahora)).toBe("Ayer");
    // Intl es-PE usa la forma peruana "setiembre", no "septiembre" — es el es-PE real,
    // no un error de tipeo.
    expect(etiquetaDia(lima(2026, 9, 15, 9).toISOString(), ahora)).toBe("15 de setiembre");
  });

  it("agrupa conservando el orden de llegada (hoy antes que ayer)", () => {
    const lineas = [
      { id: "a", creadoEn: lima(2026, 9, 18, 10).toISOString() },
      { id: "b", creadoEn: lima(2026, 9, 17, 10).toISOString() },
      { id: "c", creadoEn: lima(2026, 9, 18, 8).toISOString() },
    ];
    const grupos = agruparPorDia(lineas, ahora);
    expect(grupos.map((g) => g.etiqueta)).toEqual(["Hoy", "Ayer"]);
    expect(grupos[0]!.lineas.map((l) => l.id)).toEqual(["a", "c"]);
    expect(grupos[1]!.lineas.map((l) => l.id)).toEqual(["b"]);
  });
});
