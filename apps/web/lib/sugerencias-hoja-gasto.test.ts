import { describe, expect, it } from "vitest";
import { SUGERENCIA_NEUTRA_QUE_FUE, sugerirQueFue } from "./sugerencias-hoja-gasto";

// Las once categorías de gasto de la base (retail.categorias_gasto, 2026-10-23), con sus ejemplos tal cual.
const CATEGORIAS = [
  ["alquileres", "Alquiler del local, del almacén"],
  ["asesoria", "Contador, abogado, un diseñador"],
  ["atencion_personal", "Refrigerio, café o agua de mesa del equipo en el turno"],
  ["gastos_bancarios", "Mantenimiento de cuenta, comisiones, ITF"],
  ["mantenimiento", "Reparar un mueble, pintar, un técnico"],
  ["publicidad", "Anuncios en redes, volantes, fotos de campaña"],
  ["seguros", "Seguro del local, de la mercadería"],
  ["servicios_basicos", "Luz, agua, teléfono, internet"],
  ["suministros", "Bolsas, papel, útiles de oficina, limpieza"],
  ["transporte", "Mototaxi, taxi, envíos de encomiendas"],
  ["tributos", "Arbitrios, licencia de funcionamiento, Defensa Civil"],
] as const;

describe("«Qué fue» sigue la categoría elegida", () => {
  it("cada categoría sugiere su primer ejemplo, y cabe a 375 px", () => {
    for (const [, ejemplos] of CATEGORIAS) {
      const s = sugerirQueFue({ ejemplos });
      expect(s.startsWith("Ej. "), s).toBe(true);
      expect(s.length).toBeLessThanOrEqual(34);
      expect(ejemplos.toLowerCase()).toContain(s.slice(4).toLowerCase());
    }
    expect(sugerirQueFue({ ejemplos: "Luz, agua, teléfono, internet" })).toBe("Ej. Luz");
  });

  it("dos categorías distintas no se sugieren lo mismo, y sigue al control (A → B → A)", () => {
    const todas = CATEGORIAS.map(([, e]) => sugerirQueFue({ ejemplos: e }));
    expect(new Set(todas).size).toBe(todas.length);
    const a = { ejemplos: "Luz, agua" };
    const b = { ejemplos: "Mototaxi, taxi" };
    expect([sugerirQueFue(a), sugerirQueFue(b), sugerirQueFue(a)]).toEqual(["Ej. Luz", "Ej. Mototaxi", "Ej. Luz"]);
  });

  it("sin categoría o sin ejemplos, el texto neutro", () => {
    expect(sugerirQueFue(null)).toBe(SUGERENCIA_NEUTRA_QUE_FUE);
    expect(sugerirQueFue({ ejemplos: "  " })).toBe(SUGERENCIA_NEUTRA_QUE_FUE);
  });
});

describe("la serie de ejemplo sigue el comprobante", () => {
  it("cada comprobante, su letra; y la sugerida se lee como serie y número", async () => {
    const { serieNumeroLegible } = await import("./hoja-gasto-reglas");
    const { sugerirSerie } = await import("./sugerencias-hoja-gasto");
    expect(["factura", "boleta", "recibo_por_honorarios"].map(sugerirSerie)).toEqual(["F001-2231", "B001-123", "E001-45"]);
    for (const c of ["factura", "boleta", "recibo_por_honorarios"]) expect(serieNumeroLegible(sugerirSerie(c))).toBe(sugerirSerie(c));
  });
});
