import { describe, expect, it } from "vitest";
import { guardadoDeEgreso, type DecisionEgreso } from "./clasificar-egreso";
import type { EgresoPorClasificar } from "./gastos-reglas";
import { avanceDeLaPila, camposDeLaDecision, idas } from "./gastos-pila-reglas";

const LISTO = { listo: true, motivo: null };
const d = (p: Partial<DecisionEgreso>): DecisionEgreso => ({ que: "gasto", categoria: "", descripcion: "", motivo: "", destino: "", ...p });

describe("avanceDeLaPila", () => {
  it("con una sola cosa no hay barra; con más, dice cuántas van de cuántas", () => {
    expect(avanceDeLaPila(0, 1)).toBeNull();
    expect(avanceDeLaPila(0, 4)).toEqual({ pct: 0, texto: "0 de 4" });
    expect(avanceDeLaPila(1, 3)).toEqual({ pct: 25, texto: "1 de 4" });
    expect(avanceDeLaPila(4, 0)).toEqual({ pct: 100, texto: "4 de 4" });
  });
});

describe("idas", () => {
  it("lo que estaba y ya no está, en su orden", () => {
    expect(idas([{ clave: "a" }, { clave: "b" }, { clave: "c" }], [{ clave: "c" }, { clave: "d" }]).map((c) => c.clave)).toEqual(["a", "b"]);
  });
});

describe("camposDeLaDecision", () => {
  it("un gasto pide categoría y qué se pagó; siempre quién lo hace", () => {
    expect(camposDeLaDecision(d({}), [], LISTO).map((c) => [c.id, c.requerido, c.hecho])).toEqual([
      ["categoria", true, false],
      ["descripcion", true, false],
      ["responsable", true, true],
    ]);
  });
  it("un depósito con bancos pide la cuenta y deja la nota opcional; sin bancos, solo la nota", () => {
    expect(camposDeLaDecision(d({ que: "deposito", destino: "bcp" }), [{ id: "bcp", nombre: "BCP" }], LISTO).map((c) => c.id)).toEqual(["destino", "motivo", "responsable"]);
    expect(camposDeLaDecision(d({ que: "deposito" }), [], LISTO).find((c) => c.id === "motivo")?.requerido).toBe(false);
  });
  it("sin responsable no se puede, y dice por qué", () => {
    const r = camposDeLaDecision(d({ que: "retiro" }), [], { listo: false, motivo: "Elige quién está en la tienda." }).find((c) => c.id === "responsable")!;
    expect(r).toMatchObject({ hecho: false, pendiente: "Elige quién está en la tienda." });
  });

  // La guía no inventa reglas (ADR-0284): lo que marca como requerido y hecho es exactamente lo que deja guardar `guardadoDeEgreso`.
  it("la guía deja confirmar justo cuando la regla que guarda deja guardar", () => {
    const E: EgresoPorClasificar = { id: "e", cajaId: "k", ubicacionId: "lim", ubicacionNombre: "Lima", monto: 15, motivo: "Taxi", nota: null, registradoPor: null, creadoEn: "2026-10-29T15:00:00Z", cajaAbierta: true };
    const BANCOS = [{ id: "bcp", nombre: "BCP" }];
    const casos: DecisionEgreso[] = [];
    for (const que of ["gasto", "deposito", "retiro", "ajuste", "otro"] as const)
      for (const categoria of ["", "movilidad"])
        for (const descripcion of ["", "taxi"])
          for (const motivo of ["", "op 1"]) for (const destino of ["", "bcp"]) casos.push({ que, categoria, descripcion, motivo, destino });
    for (const bancos of [[], BANCOS])
      for (const c of casos) {
        const guia = camposDeLaDecision(c, bancos, LISTO).every((x) => !x.requerido || x.hecho);
        expect([c, bancos.length, guia]).toEqual([c, bancos.length, guardadoDeEgreso(E, c, bancos, "2026-10-31").ok]);
      }
  });
});
