import { describe, it, expect } from "vitest";
import { marcarPorVencer, type ProformaFila } from "./proformas-reglas";

const AHORA = Date.parse("2026-09-19T15:00:00Z");
const HORA = 3600 * 1000;
const en = (horas: number) => new Date(AHORA + horas * HORA).toISOString();

function proforma(sobre: Partial<ProformaFila>): ProformaFila {
  return {
    id: "p1",
    ubicacion_id: "u1",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: "2026-09-10T15:00:00Z",
    vence_at: null,
    ...sobre,
  };
}

describe("marcarPorVencer — «vencida» y «por vencer» son dos mitades distintas de las vigentes", () => {
  it("una vigente cuyo vence_at ya pasó es vencida, y no está por vencer", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(-1) })], AHORA);
    expect(p.vencida).toBe(true);
    expect(p.porVencer).toBe(false);
  });

  it("en el mismo instante en que vence ya cuenta como vencida", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(0) })], AHORA);
    expect(p.vencida).toBe(true);
    expect(p.porVencer).toBe(false);
  });

  it("una vigente que vence dentro de las 48 h está por vencer, no vencida", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(24) })], AHORA);
    expect(p.porVencer).toBe(true);
    expect(p.vencida).toBe(false);
  });

  it("una vigente que vence más allá de las 48 h no es ninguna de las dos", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: en(24 * 10) })], AHORA);
    expect(p.porVencer).toBe(false);
    expect(p.vencida).toBe(false);
  });

  it("sin fecha de vencimiento nunca vence", () => {
    const [p] = marcarPorVencer([proforma({ vence_at: null })], AHORA);
    expect(p.porVencer).toBe(false);
    expect(p.vencida).toBe(false);
  });

  it("una convertida o anulada con fecha pasada no es vencida: ya no espera a nadie", () => {
    const filas = [proforma({ id: "a", estado: "convertida", vence_at: en(-5) }), proforma({ id: "b", estado: "anulada", vence_at: en(-5) })];
    for (const p of marcarPorVencer(filas, AHORA)) {
      expect(p.vencida).toBe(false);
      expect(p.porVencer).toBe(false);
    }
  });

  it("conserva el resto de la fila tal como vino", () => {
    const [p] = marcarPorVencer([proforma({ id: "z", total: 250, vence_at: en(10) })], AHORA);
    expect(p).toMatchObject({ id: "z", total: 250 });
  });
});
