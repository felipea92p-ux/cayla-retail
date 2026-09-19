import { describe, expect, it } from "vitest";
import type { Proforma } from "./proformas-reglas";
import { chipDeLaProforma, detalleDeLaProforma, estadoVisible, ordenarProformas } from "./facturacion-proformas-reglas";

const AHORA = new Date("2026-09-19T20:00:00Z");
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3600 * 1000).toISOString();

function proforma(extra: Partial<Proforma> = {}): Proforma {
  return {
    id: "p",
    ubicacion_id: "u",
    cliente_nombre: null,
    cliente_num_doc: null,
    total: 100,
    estado: "vigente",
    comprobante_id: null,
    created_at: enHoras(-24),
    vence_at: enHoras(100),
    porVencer: false,
    vencida: false,
    ...extra,
  };
}

describe("estadoVisible", () => {
  it("una vigente que sigue valiendo es vigente; si vence pronto, por vencer", () => {
    expect(estadoVisible(proforma())).toBe("vigente");
    expect(estadoVisible(proforma({ porVencer: true }))).toBe("porVencer");
  });

  it("una vigente en la base cuyo plazo ya pasó se ve como vencida (nadie escribe `vencida`)", () => {
    expect(estadoVisible(proforma({ vencida: true, vence_at: enHoras(-2) }))).toBe("vencida");
  });

  it("convertida, anulada y la vencida de la base se ven como lo que son", () => {
    expect(estadoVisible(proforma({ estado: "convertida" }))).toBe("convertida");
    expect(estadoVisible(proforma({ estado: "anulada" }))).toBe("anulada");
    expect(estadoVisible(proforma({ estado: "vencida" }))).toBe("vencida");
  });
});

describe("ordenarProformas (excepciones primero)", () => {
  it("las que valen (las que caducan antes primero), luego vencidas, convertidas y anuladas", () => {
    const orden = ordenarProformas([
      proforma({ id: "anulada", estado: "anulada" }),
      proforma({ id: "convertida", estado: "convertida" }),
      proforma({ id: "vencida-vieja", vencida: true, vence_at: enHoras(-120) }),
      proforma({ id: "vigente-lejos", vence_at: enHoras(200) }),
      proforma({ id: "vencida-reciente", vencida: true, vence_at: enHoras(-1) }),
      proforma({ id: "por-vencer", porVencer: true, vence_at: enHoras(5) }),
      proforma({ id: "vigente", vence_at: enHoras(100) }),
    ]).map((p) => p.id);
    expect(orden).toEqual(["por-vencer", "vigente", "vigente-lejos", "vencida-reciente", "vencida-vieja", "convertida", "anulada"]);
  });

  it("una vigente sin fecha de vencimiento va al final de las que valen, no al principio", () => {
    const orden = ordenarProformas([proforma({ id: "sin-fecha", vence_at: null }), proforma({ id: "con-fecha", vence_at: enHoras(300) })]).map((p) => p.id);
    expect(orden).toEqual(["con-fecha", "sin-fecha"]);
  });

  it("entre convertidas (o con el mismo vencimiento) va primero la más nueva", () => {
    const orden = ordenarProformas([
      proforma({ id: "vieja", estado: "convertida", created_at: enHoras(-72) }),
      proforma({ id: "nueva", estado: "convertida", created_at: enHoras(-2) }),
      proforma({ id: "misma-vieja", vence_at: enHoras(50), created_at: enHoras(-30) }),
      proforma({ id: "misma-nueva", vence_at: enHoras(50), created_at: enHoras(-3) }),
    ]).map((p) => p.id);
    expect(orden).toEqual(["misma-nueva", "misma-vieja", "nueva", "vieja"]);
  });

  it("no modifica el arreglo que recibe", () => {
    const original = [proforma({ id: "b", estado: "anulada" }), proforma({ id: "a" })];
    ordenarProformas(original);
    expect(original.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("chipDeLaProforma", () => {
  it("cada estado con su palabra y su tono; ninguno en rojo", () => {
    expect(chipDeLaProforma(proforma())).toEqual({ tono: "neutro", texto: "Vigente" });
    expect(chipDeLaProforma(proforma({ porVencer: true }))).toEqual({ tono: "ambar", texto: "Por vencer" });
    expect(chipDeLaProforma(proforma({ vencida: true }))).toEqual({ tono: "apagado", texto: "Vencida" });
    expect(chipDeLaProforma(proforma({ estado: "convertida" }))).toEqual({ tono: "verde", texto: "Convertida" });
    expect(chipDeLaProforma(proforma({ estado: "anulada" }))).toEqual({ tono: "apagado", texto: "Anulada" });
  });
});

describe("detalleDeLaProforma", () => {
  it("una por vencer dice cuánto falta y pide ir en ámbar", () => {
    expect(detalleDeLaProforma(proforma({ porVencer: true, vence_at: enHoras(5) }), AHORA)).toEqual({ texto: "Vence en 5 h", urgente: true });
  });

  it("una vigente dice cuánto falta, sin urgencia", () => {
    expect(detalleDeLaProforma(proforma({ vence_at: enHoras(100) }), AHORA)).toEqual({ texto: "Vence en 4 d", urgente: false });
  });

  it("una vencida dice hace cuánto venció", () => {
    expect(detalleDeLaProforma(proforma({ vencida: true, vence_at: enHoras(-50) }), AHORA)).toEqual({ texto: "Venció hace 2 d", urgente: false });
  });

  it("una que vence en menos de un minuto dice «instantes»", () => {
    expect(detalleDeLaProforma(proforma({ porVencer: true, vence_at: new Date(AHORA.getTime() + 20 * 1000).toISOString() }), AHORA)).toEqual({ texto: "Vence en instantes", urgente: true });
  });

  it("sin fecha de vencimiento, convertida o anulada: no dice nada", () => {
    expect(detalleDeLaProforma(proforma({ vence_at: null }), AHORA)).toBeNull();
    expect(detalleDeLaProforma(proforma({ estado: "convertida" }), AHORA)).toBeNull();
    expect(detalleDeLaProforma(proforma({ estado: "anulada" }), AHORA)).toBeNull();
  });
});
