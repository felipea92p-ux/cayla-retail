import { describe, expect, it } from "vitest";
import type { EgresoPorClasificar } from "./gastos-reglas";
import { avisoDeEgreso, decisionInicial, guardadoDeEgreso, vaAlBanco, type DecisionEgreso } from "./clasificar-egreso";

const E: EgresoPorClasificar = {
  id: "eg1", cajaId: "k", ubicacionId: "lim", ubicacionNombre: "Tienda Lima", monto: 20, motivo: "Compra de insumos", nota: "bolsas para empaque",
  registradoPor: "Rosa", creadoEn: "2026-10-28T15:00:00Z", cajaAbierta: true,
};
const BANCOS = [{ id: "bcp", nombre: "BCP soles" }];
const d = (p: Partial<DecisionEgreso>): DecisionEgreso => ({ que: "gasto", categoria: "", descripcion: "", motivo: "", destino: "", ...p });

describe("decisionInicial", () => {
  it("propone lo que sugiere el motivo, la nota como «qué se pagó» y el primer banco", () => {
    expect(decisionInicial(E, BANCOS, "gasto")).toEqual({ que: "gasto", categoria: "", descripcion: "bolsas para empaque", motivo: "", destino: "bcp" });
    expect(decisionInicial({ ...E, nota: null }, [], "deposito")).toMatchObject({ que: "deposito", descripcion: "", destino: "" });
  });
});

describe("guardadoDeEgreso", () => {
  it("un gasto sin categoría o sin «qué se pagó» no se guarda, con la misma frase de siempre", () => {
    expect(guardadoDeEgreso(E, d({ descripcion: "bolsas" }), [], "2026-10-31")).toEqual({ ok: false, error: "Elige la categoría." });
    expect(guardadoDeEgreso(E, d({ categoria: "empaque" }), [], "2026-10-31")).toEqual({ ok: false, error: "Escribe qué se pagó." });
  });
  it("un gasto completo va a registrar_gasto, con marca y sin token puesto (lo pone useIntento)", () => {
    const g = guardadoDeEgreso(E, d({ categoria: "empaque", descripcion: "bolsas" }), [], "2026-10-31");
    expect(g.ok && g.rpc).toBe("registrar_gasto");
    expect(g.ok && g.conMarca).toBe(true);
    expect(g.ok && "p_token" in g.args).toBe(false);
  });
  it("un depósito con bancos va a Cuentas y dinero, desde el egreso", () => {
    expect(guardadoDeEgreso(E, d({ que: "deposito", destino: "bcp", motivo: "op 123" }), BANCOS, "2026-10-31")).toEqual({
      ok: true,
      rpc: "registrar_movimiento_dinero",
      args: { p_tipo: "deposito", p_monto: 20, p_cuenta_destino_id: "bcp", p_referencia: "op 123", p_caja_movimiento_id: "eg1" },
      conMarca: true,
    });
    expect(guardadoDeEgreso(E, d({ que: "deposito", destino: "" }), BANCOS, "2026-10-31")).toEqual({ ok: false, error: "Elige a qué cuenta llegó." });
  });
  it("sin bancos, un depósito se marca «no es gasto», como antes", () => {
    expect(guardadoDeEgreso(E, d({ que: "deposito" }), [], "2026-10-31")).toEqual({
      ok: true,
      rpc: "marcar_egreso_no_gasto",
      args: { p_caja_movimiento_id: "eg1", p_tipo: "deposito", p_motivo: null },
      conMarca: false,
    });
  });
  it("«otra cosa» pide qué fue; un activo nunca se guarda aquí", () => {
    expect(guardadoDeEgreso(E, d({ que: "otro" }), [], "2026-10-31")).toEqual({ ok: false, error: "Escribe qué fue." });
    expect(guardadoDeEgreso(E, d({ que: "activo" }), [], "2026-10-31").ok).toBe(false);
  });
});

describe("avisoDeEgreso y vaAlBanco", () => {
  it("un depósito al banco dice qué cuenta sube; un retiro, dónde se revierte; un gasto, nada más", () => {
    expect(vaAlBanco({ que: "deposito" }, BANCOS)).toBe(true);
    expect(vaAlBanco({ que: "deposito" }, [])).toBe(false);
    expect(avisoDeEgreso(d({ que: "deposito", destino: "bcp" }), BANCOS).detalle).toContain("BCP soles sube en Cuentas y dinero");
    expect(avisoDeEgreso(d({ que: "retiro" }), []).texto).toBe("Registrado como retiro del dueño");
    expect(avisoDeEgreso(d({}), []).detalle).toBeUndefined();
  });
});
