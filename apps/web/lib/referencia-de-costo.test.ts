import { describe, expect, it } from "vitest";
import { avisoDeCostoDudoso, fraseCostoAtipico, leerCostosAtipicos } from "./costo-atipico-reglas";
import { dudaDeCosto, leerReferencias, montosConfirmados } from "./referencia-de-costo";

// ADR-0668 (A4): la hoja de Recibir avisa de un costo dudoso con los números de la base (`fn_precio_referencia`).
const RESPUESTA = {
  anterior: { v1: 44, v2: "36.00", rota: "no" },
  bandas: { cat: { lo: 10.92, hi: 80, de: "categoria", modelos: 90 }, mala: { lo: 50, hi: 10, de: "categoria" } },
  lineas: { linea: "21.83" },
  tasa_igv: 0.18,
};

describe("leerReferencias: lo que contesta la base, sin confiar en su forma", () => {
  it("lee montos como número o como texto, y descarta lo que no se entiende", () => {
    const r = leerReferencias(RESPUESTA);
    expect(r).toEqual({ anterior: { v1: 44, v2: 36 }, bandas: { cat: { lo: 10.92, hi: 80, de: "categoria" } }, lineas: { linea: 21.83 }, tasaIgv: 0.18 });
  });
  it("sin la tasa del IGV no hay lectura (no se adivina con cuál comparar)", () => {
    expect(leerReferencias({ ...RESPUESTA, tasa_igv: null })).toBeNull();
    expect(leerReferencias(null)).toBeNull();
    expect(leerReferencias("x")).toBeNull();
  });
});

describe("dudaDeCosto: como la base, prenda por prenda", () => {
  const refs = leerReferencias(RESPUESTA);
  it("440 por una blusa de 44: «sube», contra SU anterior", () => {
    expect(dudaDeCosto(440, refs, { varianteIds: ["v1"], categoriaId: "cat", lineaId: null })?.motivo).toBe("sube");
  });
  it("basta una talla para pedirlo: con dos anteriores, salta la que se aleja", () => {
    expect(dudaDeCosto(80, refs, { varianteIds: ["v1", "v2"], categoriaId: null, lineaId: null })?.motivo).toBe("sube");
  });
  it("lo de la orden sin IGV pide confirmar y propone lo de la orden", () => {
    const d = dudaDeCosto(18.5, refs, { varianteIds: [], categoriaId: null, lineaId: "linea" });
    expect(d?.motivo).toBe("sin_igv");
    expect(d && avisoDeCostoDudoso(d.motivo, d.ref)).toEqual({ titulo: "¿Escribiste el monto sin impuesto?", linea: "La orden dice S/ 21.83 con todo.", usar: 21.83 });
  });
  it("una prenda nueva fuera de lo que suele costar dice el rango, sin adivinar el nombre de la categoría", () => {
    const d = dudaDeCosto(400, refs, { varianteIds: [], categoriaId: "cat", lineaId: null });
    expect(d && avisoDeCostoDudoso(d.motivo, d.ref)).toEqual({ titulo: "Fuera de lo que suele costar", linea: "Suele ir de S/ 10.92 a S/ 80.00.", usar: null });
  });
  it("«Antes pagabas» dice el anterior en papel, y la línea cabe en 8 palabras", () => {
    const d = dudaDeCosto(440, refs, { varianteIds: ["v1"], categoriaId: null, lineaId: null });
    const a = d && avisoDeCostoDudoso(d.motivo, d.ref);
    expect(a?.titulo).toBe("Antes pagabas S/ 44.00");
    expect(a?.linea.split(/\s+/).length).toBeLessThanOrEqual(8);
  });
  it("sin lectura (la base no respondió) no hay duda: la base sigue revisando al cerrar", () => {
    expect(dudaDeCosto(440, null, { varianteIds: ["v1"], categoriaId: "cat", lineaId: null })).toBeNull();
  });
});

describe("el rechazo de la base dice lo mismo que el aviso de antes", () => {
  it("lee los dos motivos nuevos y comparte su título", () => {
    const leidos = leerCostosAtipicos({
      message: "costo_atipico",
      details: JSON.stringify({ items: [{ motivo: "sin_igv", costo_unitario: 18.5 }, { motivo: "fuera_de_banda", costo_unitario: 400 }] }),
    });
    expect(leidos?.map((c) => c.motivo)).toEqual(["sin_igv", "fuera_de_banda"]);
    expect(fraseCostoAtipico(leidos![0]!).titulo).toBe("¿Escribiste el monto sin impuesto?");
    expect(fraseCostoAtipico(leidos![1]!).titulo).toBe("Fuera de lo que suele costar");
  });
});

describe("montosConfirmados: lo que viaja a la base", () => {
  it("al céntimo, sin repetir y sin ceros ni montos rotos", () => {
    expect(montosConfirmados([440, 440.001, 0, Number.NaN, 18.5, -3])).toEqual([440, 18.5]);
  });
});
