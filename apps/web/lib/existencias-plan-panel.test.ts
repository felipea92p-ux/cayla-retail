import { describe, expect, it } from "vitest";
import { aplicarPlan, listaQueOrdena, planDelPanel, type FilaConPlan, type PlanDelPanel } from "./existencias-plan-panel";
import type { PisoDeTalla, PlanDelPiso } from "./piso-plan";

const decision = (accion: PisoDeTalla["accion"]): PisoDeTalla => ({
  accion,
  requisito: 1,
  central: true,
  vendidasRecientes: 0,
  anotadasRecientes: 0,
  ritmoAtributo: 0,
  entraUnaSaleUna: false,
});

const fila = (varianteId: string, piso: number, almacen: number): FilaConPlan & { referencia: string } => ({
  varianteId,
  pisoDisponible: piso,
  almacenDisponible: almacen,
  referencia: `Prenda ${varianteId}`,
});

const plan: PlanDelPanel = {
  porTalla: { a: decision("por_colgar"), b: decision("mantener") },
  listaDelDia: ["a"],
  enPausa: false,
};

describe("planDelPanel", () => {
  it("recorta el plan a las tallas que la pantalla muestra y lo deja en un objeto que viaja", () => {
    const completo = {
      porTalla: new Map([
        ["a", decision("por_colgar")],
        ["z", decision("mantener")],
      ]),
      listaDelDia: ["a"],
      enPausa: true,
    } as unknown as PlanDelPiso;
    expect(planDelPanel(completo, [{ varianteId: "a" }, { varianteId: "b" }])).toEqual({ porTalla: { a: decision("por_colgar") }, listaDelDia: ["a"], enPausa: true });
  });

  it("sin plan (no respondió) da null: el panel dirá N/D", () => {
    expect(planDelPanel(null, [{ varianteId: "a" }])).toBeNull();
  });
});

describe("aplicarPlan", () => {
  const stock = [fila("a", 0, 3), fila("b", 1, 0)];

  it("una sede que no pide el plan (Taller) no calcula nada ni dice N/D", () => {
    const r = aplicarPlan(stock, { pedido: false, recibido: null, vigente: false });
    expect(r.estado).toBe("no_aplica");
    expect(r.calculando.size).toBe(0);
    expect(r.filas.every((f) => f.planPiso === null)).toBe(true);
  });

  it("mientras llega, todas las tallas dicen «calculando» y ninguna trae decisión", () => {
    const r = aplicarPlan(stock, { pedido: true, recibido: null, vigente: false });
    expect(r.estado).toBe("calculando");
    expect([...r.calculando]).toEqual(["a", "b"]);
    expect(r.filas.map((f) => f.planPiso)).toEqual([null, null]);
    expect(r.listaDelDia).toEqual([]);
    expect(r.enPausa).toBeNull();
  });

  it("cuando llega, cada talla trae su decisión y nada queda calculando", () => {
    const r = aplicarPlan(stock, { pedido: true, recibido: { plan, stock }, vigente: true });
    expect(r.estado).toBe("listo");
    expect(r.filas.map((f) => f.planPiso?.accion)).toEqual(["por_colgar", "mantener"]);
    expect(r.calculando.size).toBe(0);
    expect(r.listaDelDia).toEqual(["a"]);
    expect(r.enPausa).toBe(false);
    // Lo demás de la fila no se toca.
    expect(r.filas[0].referencia).toBe("Prenda a");
  });

  it("si no respondió, es «fallo» (N/D), no «calculando»", () => {
    const r = aplicarPlan(stock, { pedido: true, recibido: { plan: null, stock }, vigente: true });
    expect(r.estado).toBe("fallo");
    expect(r.calculando.size).toBe(0);
    expect(r.filas.every((f) => f.planPiso === null)).toBe(true);
  });

  it("un refresco: las tallas que no cambiaron conservan su decisión; la que cambió (y la nueva) calculan", () => {
    const nuevo = [fila("a", 1, 2), fila("b", 1, 0), fila("c", 0, 4)];
    const r = aplicarPlan(nuevo, { pedido: true, recibido: { plan, stock }, vigente: false });
    expect(r.estado).toBe("listo");
    expect(r.filas.map((f) => f.planPiso?.accion ?? null)).toEqual([null, "mantener", null]);
    expect([...r.calculando].sort()).toEqual(["a", "c"]);
    expect(r.listaDelDia).toEqual(["a"]);
  });

  it("si el plan anterior había fallado, el nuevo todavía puede llegar: calculando, no N/D", () => {
    const r = aplicarPlan(stock, { pedido: true, recibido: { plan: null, stock }, vigente: false });
    expect(r.estado).toBe("calculando");
    expect(r.calculando.size).toBe(2);
  });

  it("una talla que el plan no trae queda sin decisión (N/D), no calculando", () => {
    const r = aplicarPlan([fila("x", 0, 0)], { pedido: true, recibido: { plan, stock: [fila("x", 0, 0)] }, vigente: true });
    expect(r.filas[0].planPiso).toBeNull();
    expect(r.calculando.size).toBe(0);
  });
});

describe("listaQueOrdena", () => {
  const delPlan = ["a", "b"];

  it("sin plan todavía, nada ordena", () => {
    expect(listaQueOrdena({ aplicada: null, delPlan: null, tocada: false, cambiaLaVista: false })).toBeNull();
  });

  it("la primera lista se aplica sola si nadie tocó la pantalla", () => {
    expect(listaQueOrdena({ aplicada: null, delPlan, tocada: false, cambiaLaVista: false })).toBe(delPlan);
  });

  it("si la persona ya tocó la lista, la primera espera a que cambie la vista (no se mueve nada bajo el dedo)", () => {
    expect(listaQueOrdena({ aplicada: null, delPlan, tocada: true, cambiaLaVista: false })).toBeNull();
    expect(listaQueOrdena({ aplicada: null, delPlan, tocada: true, cambiaLaVista: true })).toBe(delPlan);
  });

  it("las siguientes (un refresco) se aplican como siempre, aunque se haya tocado", () => {
    const vieja = ["b"];
    expect(listaQueOrdena({ aplicada: vieja, delPlan, tocada: true, cambiaLaVista: false })).toBe(delPlan);
  });

  it("sin plan nuevo, se queda la que ordena", () => {
    const vieja = ["b"];
    expect(listaQueOrdena({ aplicada: vieja, delPlan: null, tocada: true, cambiaLaVista: true })).toBe(vieja);
  });
});
