import { describe, expect, it } from "vitest";
import { chipLlegada, diasDeAtraso, efectoCierre, estadoLinea, fechaEsperada, igvDeMonto, montoNotaSugerido, ordenarPorUrgencia, resumenConteo, tasaIgv, textoEsperada, valorPorLlegar } from "./recepciones-reglas";

// Hoy en Lima = 2026-09-18 (a las 19:30 de Lima en UTC ya es 09-19).
const AHORA = new Date("2026-09-19T00:30:00Z");

describe("estadoLinea (D1: arrancan en 0)", () => {
  it("nada tocado es «sin contar», no «completa»", () => {
    expect(estadoLinea(0, 24)).toBe("sin_contar");
  });
  it("completa, faltan y excede", () => {
    expect(estadoLinea(24, 24)).toBe("completa");
    expect(estadoLinea(20, 24)).toBe("faltan");
    expect(estadoLinea(25, 24)).toBe("excede");
  });
});

describe("resumenConteo", () => {
  it("cuenta líneas contadas, unidades y excedidas", () => {
    const r = resumenConteo([
      { llego: 24, pendiente: 24 },
      { llego: 36, pendiente: 36 },
      { llego: 0, pendiente: 30 },
      { llego: 20, pendiente: 24 },
      { llego: 0, pendiente: 60 },
      { llego: 0, pendiente: 66 },
    ]);
    expect(r).toEqual({ total: 6, contadas: 3, sinContar: 3, unidades: 80, excedidas: 0 });
  });
});

describe("atraso de llegada", () => {
  it("sin fecha estimada, cuenta desde emisión + 7 días", () => {
    expect(fechaEsperada({ fechaEstimadaLlegada: null, fechaEmision: "2026-09-02" })).toBe("2026-09-09");
    expect(diasDeAtraso({ fechaEstimadaLlegada: null, fechaEmision: "2026-09-02" }, AHORA)).toBe(9);
  });
  it("esperada hoy (Lima) no está atrasada aunque el servidor ya esté en mañana", () => {
    expect(diasDeAtraso({ fechaEstimadaLlegada: "2026-09-18", fechaEmision: "2026-09-01" }, AHORA)).toBe(0);
    expect(chipLlegada({ fechaEstimadaLlegada: "2026-09-18", fechaEmision: "2026-09-01" }, AHORA)).toEqual({ texto: "Llega hoy", tono: "neutro" });
  });
  it("chips y textos", () => {
    expect(chipLlegada({ fechaEstimadaLlegada: "2026-09-09", fechaEmision: "2026-09-01" }, AHORA)).toEqual({ texto: "Atrasada 9 d", tono: "ambar" });
    expect(chipLlegada({ fechaEstimadaLlegada: "2026-09-22", fechaEmision: "2026-09-10" }, AHORA)).toEqual({ texto: "En 4 días", tono: "neutro" });
    expect(textoEsperada({ fechaEstimadaLlegada: "2026-09-09", fechaEmision: "2026-09-01" }, AHORA)).toBe("Esperada el 09/09");
    expect(textoEsperada({ fechaEstimadaLlegada: "2026-09-22", fechaEmision: "2026-09-10" }, AHORA)).toBe("Llega el 22/09");
  });
  it("ordena lo atrasado primero, el más atrasado arriba", () => {
    const lista = [
      { id: "a", fechaEstimadaLlegada: "2026-09-22", fechaEmision: "2026-09-10" },
      { id: "b", fechaEstimadaLlegada: "2026-09-10", fechaEmision: "2026-08-20" },
      { id: "c", fechaEstimadaLlegada: "2026-09-09", fechaEmision: "2026-09-02" },
      { id: "d", fechaEstimadaLlegada: "2026-09-20", fechaEmision: "2026-09-12" },
    ];
    expect(ordenarPorUrgencia(lista, AHORA).map((x) => x.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("valorPorLlegar", () => {
  it("es proporcional a lo pendiente y descuenta lo cerrado", () => {
    expect(valorPorLlegar({ total: 3186, facturadoCantidad: 120, recibidoCantidad: 72 })).toBe(1274.4);
    expect(valorPorLlegar({ total: 3186, facturadoCantidad: 120, recibidoCantidad: 72, cerradoCantidad: 48 })).toBe(0);
    expect(valorPorLlegar({ total: 100, facturadoCantidad: 0, recibidoCantidad: 0 })).toBe(0);
  });
});

describe("nota de crédito (D2)", () => {
  it("deduce la tasa de IGV de los montos del comprobante", () => {
    expect(tasaIgv({ subtotal: 2000, igv: 360 })).toBeCloseTo(0.18);
    expect(tasaIgv({ subtotal: 0, igv: 0 })).toBe(0);
  });
  it("sugiere cantidad × costo (sin IGV) + IGV", () => {
    expect(montoNotaSugerido(4, 50, 0.18)).toBe(236);
    expect(montoNotaSugerido(4, 50, 0)).toBe(200);
  });
  it("separa el IGV de un monto que ya lo trae", () => {
    expect(igvDeMonto(236, 0.18)).toBe(36);
    expect(igvDeMonto(100, 0)).toBe(0);
  });
});

describe("efectoCierre", () => {
  const f = (n: number) => `S/ ${n.toFixed(2)}`;
  it("con nota y cubriendo todo lista las cuatro filas", () => {
    const filas = efectoCierre({ documento: "F001-000482", saldo: 3923.6, montoNota: 236, igvNota: 36, igvMes: 1466.18, recepcionAntes: "Parcial", cubreTodo: true, estabaAtrasada: true, atrasadasAntes: 2, formato: f });
    expect(filas.map((x) => [x.etiqueta, x.antes, x.despues])).toEqual([
      ["Lo que se debe de F001-000482", "S/ 3923.60", "S/ 3687.60"],
      ["Crédito fiscal (IGV) del mes", "S/ 1466.18", "S/ 1430.18"],
      ["Recepción del comprobante", "Parcial", "Recibida"],
      ["Entregas atrasadas", "2", "1"],
    ]);
  });
  it("sin nota y sin cubrir todo no hay nada que mostrar", () => {
    expect(efectoCierre({ documento: "X", saldo: 100, montoNota: 0, igvNota: 0, igvMes: null, recepcionAntes: "Parcial", cubreTodo: false, estabaAtrasada: false, atrasadasAntes: null, formato: f })).toEqual([]);
  });
  it("nunca deja el saldo en negativo", () => {
    const [fila] = efectoCierre({ documento: "X", saldo: 100, montoNota: 500, igvNota: 0, igvMes: null, recepcionAntes: "", cubreTodo: false, estabaAtrasada: false, atrasadasAntes: null, formato: f });
    expect(fila.despues).toBe("S/ 0.00");
  });
});
