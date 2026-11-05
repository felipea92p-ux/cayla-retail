import { describe, expect, it } from "vitest";
import { argsDelPago, camposDelPago, problemasDelPago, totalDelPago, type PagoDeServicio } from "./pagar-servicio-reglas";

const pago = (o: Partial<PagoDeServicio> = {}): PagoDeServicio => ({
  monto: 100,
  falta: 100,
  papel: "sin_comprobante",
  serie: "",
  numero: "",
  emision: "2026-11-05",
  hoy: "2026-11-05",
  yaPagado: true,
  vence: "",
  medios: [{ metodo: "transferencia", monto: 100 }],
  ...o,
});

describe("pagar a un servicio", () => {
  it("solo la factura suma IGV", () => {
    expect(totalDelPago(100, "factura")).toEqual({ igv: 18, total: 118 });
    expect(totalDelPago(100, "boleta")).toEqual({ igv: 0, total: 100 });
    expect(totalDelPago(100, "recibo_por_honorarios").total).toBe(100);
    expect(totalDelPago(100, "sin_comprobante").total).toBe(100);
  });
  it("sin papel, pagado y cuadrado no le falta nada", () => {
    expect(problemasDelPago(pago())).toEqual([]);
  });
  it("no deja pagar en cero ni de más", () => {
    expect(problemasDelPago(pago({ monto: 0 })).map((p) => p.campo)).toContain("monto");
    expect(problemasDelPago(pago({ monto: 100.01, medios: [{ metodo: "efectivo", monto: 100.01 }] })).map((p) => p.texto)).toContain("Es más de lo que se le debe.");
  });
  it("con papel pide serie y número; sin papel, no", () => {
    expect(problemasDelPago(pago({ papel: "boleta" })).map((p) => p.campo)).toEqual(["papel"]);
    expect(problemasDelPago(pago({ papel: "boleta", serie: "B1", numero: "9" }))).toEqual([]);
  });
  it("una factura pagada tiene que sumar con su IGV", () => {
    const f = { papel: "factura" as const, serie: "F1", numero: "9" };
    expect(problemasDelPago(pago(f)).map((p) => p.campo)).toEqual(["pago"]);
    expect(problemasDelPago(pago({ ...f, medios: [{ metodo: "transferencia", monto: 118 }] }))).toEqual([]);
  });
  it("por pagar pide un vencimiento que no sea anterior al papel", () => {
    expect(problemasDelPago(pago({ yaPagado: false })).map((p) => p.texto)).toEqual(["Escribe cuándo vence."]);
    expect(problemasDelPago(pago({ yaPagado: false, vence: "2026-11-01" })).map((p) => p.campo)).toEqual(["pago"]);
    expect(problemasDelPago(pago({ yaPagado: false, vence: "2026-11-20" }))).toEqual([]);
  });
  it("una fecha futura no pasa", () => {
    expect(problemasDelPago(pago({ emision: "2026-11-06" })).map((p) => p.campo)).toEqual(["papel"]);
  });
  it("los campos de la guía salen de lo que falta", () => {
    const c = camposDelPago(["papel"], true);
    expect(c.find((x) => x.id === "papel")?.hecho).toBe(false);
    expect(c.find((x) => x.id === "monto")?.hecho).toBe(true);
    expect(c.find((x) => x.id === "responsable")?.hecho).toBe(true);
  });
  it("sin papel no manda serie ni número, y a crédito no manda pago", () => {
    const a = argsDelPago(pago({ serie: "X", numero: "1" }), { faseId: "f", token: "t" });
    expect([a.p_serie, a.p_numero, a.p_condicion]).toEqual([undefined, undefined, "contado"]);
    const b = argsDelPago(pago({ papel: "boleta", serie: " B1 ", numero: " 9 ", yaPagado: false, vence: "2026-11-20" }), { faseId: "f", token: "t" });
    expect([b.p_serie, b.p_numero, b.p_condicion, b.p_fecha_vencimiento, b.p_pago]).toEqual(["B1", "9", "credito", "2026-11-20", undefined]);
  });
});
