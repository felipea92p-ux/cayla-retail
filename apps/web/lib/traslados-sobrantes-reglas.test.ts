import { describe, expect, it } from "vitest";
import {
  MAX_NOTA_SOBRANTE,
  avisoDeSobrante,
  camposSobrante,
  esEstadoSobrante,
  opcionesDeSobrante,
  puedeGuardarSobrante,
  textoDeLaDecision,
  unidadesPorRevisar,
  type DecisionSobrante,
} from "./traslados-sobrantes-reglas";

const DECISIONES: (DecisionSobrante | null)[] = ["salio_del_origen", "encontrada", "error_de_conteo", null];
const NOTAS = ["", "ok", "la contamos dos veces", "x".repeat(MAX_NOTA_SOBRANTE), "x".repeat(MAX_NOTA_SOBRANTE + 1)];

describe("la prenda de más de un traslado (ADR-0404)", () => {
  it("ofrece las tres salidas que decidió Felipe, en orden, con las sedes nombradas", () => {
    const o = opcionesDeSobrante("Tienda Lima", "Tienda Trujillo");
    expect(o.map((x) => x.valor)).toEqual(["salio_del_origen", "encontrada", "error_de_conteo"]);
    expect(o[0].titulo).toContain("Tienda Lima");
    expect(o[0].sub).toContain("Tienda Trujillo");
    expect(o[1].sub).toContain("Tienda Trujillo");
  });

  it("guardar pide lo mismo que la base: una decisión, una nota de 5 a 200 y quién lo decide", () => {
    expect(puedeGuardarSobrante("encontrada", "la contamos dos veces", true)).toBe(true);
    expect(puedeGuardarSobrante(null, "la contamos dos veces", true)).toBe(false);
    expect(puedeGuardarSobrante("encontrada", "ok", true)).toBe(false);
    expect(puedeGuardarSobrante("encontrada", "x".repeat(MAX_NOTA_SOBRANTE + 1), true)).toBe(false);
    expect(puedeGuardarSobrante("encontrada", "la contamos dos veces", false)).toBe(false);
  });

  it("la guía de foco coincide con lo que deja guardar, en todas las combinaciones", () => {
    for (const d of DECISIONES)
      for (const n of NOTAS)
        for (const r of [true, false]) {
          const todosHechos = camposSobrante(d, n, r).every((c) => c.hecho || !c.requerido);
          expect(todosHechos).toBe(puedeGuardarSobrante(d, n, r));
        }
  });

  it("un sobrante revisado dice qué pasó; uno por revisar dice que no se puede vender", () => {
    expect(textoDeLaDecision("salio_del_origen", "Tienda Lima")).toContain("Tienda Lima");
    expect(textoDeLaDecision("por_revisar", "Tienda Lima")).toContain("no se puede vender");
    expect(new Set(["salio_del_origen", "encontrada", "error_de_conteo", "por_revisar"].map((e) => textoDeLaDecision(e as never, "X"))).size).toBe(4);
  });

  it("cuenta solo las unidades que esperan revisión", () => {
    expect(unidadesPorRevisar([{ estado: "por_revisar", cantidad: 2 }, { estado: "encontrada", cantidad: 1 }, { estado: "por_revisar", cantidad: 1 }])).toBe(3);
    expect(unidadesPorRevisar([])).toBe(0);
  });

  it("reconoce solo los estados que acepta la base", () => {
    expect(esEstadoSobrante("por_revisar")).toBe(true);
    expect(esEstadoSobrante("me_la_quedo")).toBe(false);
    expect(esEstadoSobrante(null)).toBe(false);
  });

  it("el aviso dice qué pasó con el stock, en singular y en plural", () => {
    expect(avisoDeSobrante("salio_del_origen", 1, "Tienda Lima", "Tienda Trujillo").detalle).toBe("La prenda salió del stock de Tienda Lima y entró al de Tienda Trujillo.");
    expect(avisoDeSobrante("encontrada", 2, "Tienda Lima", "Tienda Trujillo").detalle).toBe("Las 2 prendas entraron al stock de Tienda Trujillo como encontradas.");
    expect(avisoDeSobrante("error_de_conteo", 1, "A", "B").detalle).toBe("No entró nada al stock.");
  });
});
