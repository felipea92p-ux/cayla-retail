import { describe, expect, it } from "vitest";
import { aplicarRitmo, ritmoDelPanel, type FilaConRitmo, type RitmoDelPanel } from "./existencias-ritmo-panel";
import type { RitmoReciente } from "./existencias-ritmo";

const medida = (unidadesDia: number): RitmoReciente => ({ tipo: "medida", dias: [], unidadesDia });
const insuficiente: RitmoReciente = { tipo: "insuficiente", dias: [] };

const fila = (varianteId: string, piso: number | null): FilaConRitmo & { referencia: string } => ({ varianteId, piso, referencia: `Prenda ${varianteId}` });

const ritmo: RitmoDelPanel = { porTalla: { a: medida(2), b: insuficiente } };
const stock = [fila("a", 6), fila("b", 3)];

describe("ritmoDelPanel", () => {
  it("pasa el Map del servidor a un objeto que viaja, y la caída sigue siendo null", () => {
    expect(ritmoDelPanel(new Map([["a", medida(2)]]))).toEqual({ porTalla: { a: medida(2) } });
    expect(ritmoDelPanel(null)).toBeNull();
  });
});

describe("aplicarRitmo", () => {
  it("donde no se pide (el Taller) no aplica: sin ritmo ni cobertura y nada calculando", () => {
    const r = aplicarRitmo(stock, { pedido: false, recibido: null });
    expect(r.estado).toBe("no_aplica");
    expect(r.calculando.size).toBe(0);
    expect(r.filas.every((f) => f.ritmoReciente === null && f.coberturaPiso === null)).toBe(true);
  });

  it("mientras la promesa no responde, toda talla dice calculando (no N/D)", () => {
    const r = aplicarRitmo(stock, { pedido: true, recibido: null });
    expect(r.estado).toBe("calculando");
    expect([...r.calculando]).toEqual(["a", "b"]);
    expect(r.filas.every((f) => f.ritmoReciente === null)).toBe(true);
  });

  it("al llegar, pone el ritmo y calcula la cobertura con el piso de la fila", () => {
    const r = aplicarRitmo(stock, { pedido: true, recibido: { ritmo, vigente: true } });
    expect(r.estado).toBe("listo");
    expect(r.calculando.size).toBe(0);
    expect(r.filas[0]).toMatchObject({ referencia: "Prenda a", ritmoReciente: medida(2), coberturaPiso: { tipo: "medida", dias: 3 } });
    expect(r.filas[1]).toMatchObject({ ritmoReciente: insuficiente, coberturaPiso: { tipo: "no_estimable", razon: "insuficiente" } });
  });

  it("un piso null cuenta como cero: agotado", () => {
    const r = aplicarRitmo([fila("a", null)], { pedido: true, recibido: { ritmo, vigente: true } });
    expect(r.filas[0].coberturaPiso).toEqual({ tipo: "agotado", dias: 0 });
  });

  it("si el ritmo de ahora no respondió, es fallo: N/D, nada calculando", () => {
    const r = aplicarRitmo(stock, { pedido: true, recibido: { ritmo: null, vigente: true } });
    expect(r.estado).toBe("fallo");
    expect(r.calculando.size).toBe(0);
    expect(r.filas.every((f) => f.ritmoReciente === null && f.coberturaPiso === null)).toBe(true);
  });

  it("si el que falló es el de antes de un refresco, el nuevo todavía puede llegar: calculando", () => {
    const r = aplicarRitmo(stock, { pedido: true, recibido: { ritmo: null, vigente: false } });
    expect(r.estado).toBe("calculando");
  });

  it("tras un refresco, el ritmo anterior sigue valiendo y la cobertura sigue al piso nuevo", () => {
    // Se colgaron 4 de «a»: el piso pasa de 6 a 10. El ritmo de 7 días no cambia por eso; la cobertura sí.
    const r = aplicarRitmo([fila("a", 10), fila("b", 3)], { pedido: true, recibido: { ritmo, vigente: false } });
    expect(r.estado).toBe("listo");
    expect(r.calculando.size).toBe(0);
    expect(r.filas[0].coberturaPiso).toEqual({ tipo: "medida", dias: 5 });
  });

  it("tras un refresco, una talla que el ritmo anterior no traía dice calculando; con el ritmo de ahora, N/D", () => {
    const conNueva = [...stock, fila("c", 2)];
    const antes = aplicarRitmo(conNueva, { pedido: true, recibido: { ritmo, vigente: false } });
    expect([...antes.calculando]).toEqual(["c"]);
    const ahora = aplicarRitmo(conNueva, { pedido: true, recibido: { ritmo, vigente: true } });
    expect(ahora.calculando.size).toBe(0);
    expect(ahora.filas[2]).toMatchObject({ ritmoReciente: null, coberturaPiso: null });
  });
});
