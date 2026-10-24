import { describe, expect, it } from "vitest";
import type { MesIgv } from "./impuestos-reglas";
import { TOPE_INCLINACION, alturasPesas, balanzaIgv, type IgvDeLugar } from "./impuestos-balanza-reglas";

// Septiembre de la historia de las maquetas: cobraste 16,020, descuentas 7,620, pagas 8,400 de IGV + 890 de renta.
const mes = (p: Partial<MesIgv> = {}): MesIgv => ({
  mes: "2026-09", comprobantes: 629, baseVentas: 89000, igvVentas: 16020, igvNotasCredito: 0, debito: 16020,
  creditoMercaderia: 4630, creditoGastos: 2010, creditoActivos: 0, creditoTaller: 980, creditoNotas: 0, credito: 7620,
  saldoAnterior: 0, aPagar: 8400, saldoAFavor: 0, ...p,
});

const LUGARES: IgvDeLugar[] = [
  { clave: "tru", nombre: "Trujillo", cobrado: 10080, compras: 2900 },
  { clave: "aqp", nombre: "Arequipa", cobrado: 5940, compras: 1700 },
  { clave: "lim", nombre: "Lima", cobrado: 0, compras: 1250 },
  { clave: "taller", nombre: "Taller", cobrado: 0, compras: 980 },
  { clave: "empresa", nombre: "Toda la empresa", cobrado: 0, compras: 790 },
];

describe("balanzaIgv", () => {
  it("a pagar: un plato con las ventas, el otro por tipo de compra, y la cuenta de la base", () => {
    const b = balanzaIgv(mes(), 890);
    expect(b.cobrado).toEqual({ total: 16020, pesas: [{ clave: "ventas", nombre: "Tus ventas", monto: 16020 }], resta: 0 });
    expect(b.compras.pesas.map((p) => [p.nombre, p.monto])).toEqual([["Mercadería", 4630], ["Gastos", 2010], ["Insumos del Taller", 980]]);
    expect(b.compras.total).toBe(7620);
    expect(b.cuenta).toEqual({ cobraste: 16020, compras: 7620, saldoAnterior: 0, igv: 8400, renta: 890, pagas: 9290, estado: "pagas" });
    expect(b.inclinacion).toBeGreaterThan(0);
    expect(b.cuadra).toBe(true);
    expect(b.porLugar).toBe(false);
  });

  it("a favor: baja el plato de compras, el IGV no se paga y lo que sale es solo la renta", () => {
    const b = balanzaIgv(mes({ debito: 12, credito: 7242, creditoMercaderia: 7242, creditoGastos: 0, creditoTaller: 0, saldoAnterior: 814, aPagar: 0, saldoAFavor: 8044 }), 1);
    expect(b.inclinacion).toBeLessThan(-12);
    expect(b.cuenta).toMatchObject({ igv: -8044, pagas: 1, estado: "a_favor", saldoAnterior: 814, compras: 7242 });
    expect(b.compras.pesas.at(-1)).toEqual({ clave: "saldo_anterior", nombre: "Saldo a favor que traías", monto: 814 });
    expect(b.cuadra).toBe(true);
  });

  it("sin renta conocida, pagas es solo el IGV", () => {
    expect(balanzaIgv(mes(), null).cuenta).toMatchObject({ renta: null, pagas: 8400 });
  });

  it("un mes vacío: platos sin pesas, brazo derecho y nada que pagar", () => {
    const b = balanzaIgv(mes({ comprobantes: 0, baseVentas: 0, igvVentas: 0, debito: 0, creditoMercaderia: 0, creditoGastos: 0, creditoTaller: 0, credito: 0, aPagar: 0 }), 0);
    expect(b.cobrado.pesas).toEqual([]);
    expect(b.compras.pesas).toEqual([]);
    expect(b.inclinacion).toBe(0);
    expect(b.cuenta).toMatchObject({ igv: 0, pagas: 0, estado: "a_favor" });
  });

  it("las notas de crédito restan del plato sin ser una pesa: el total es el de la base", () => {
    const b = balanzaIgv(mes({ creditoNotas: 300, credito: 7320, aPagar: 8700 }), 890);
    expect(b.compras.total).toBe(7320);
    expect(b.compras.resta).toBe(300);
    expect(b.cuenta.pagas).toBe(9590);
    expect(b.cuadra).toBe(true);
  });

  it("si la resta propia no da lo de la base, la cuenta sigue a la base y lo avisa", () => {
    const b = balanzaIgv(mes({ aPagar: 8000 }), 890);
    expect(b.cuenta.igv).toBe(8000);
    expect(b.cuadra).toBe(false);
  });

  it("la inclinación tiene tope en los dos sentidos", () => {
    expect(balanzaIgv(mes({ credito: 0, creditoMercaderia: 0, creditoGastos: 0, creditoTaller: 0, aPagar: 16020 }), null).inclinacion).toBe(TOPE_INCLINACION);
    expect(Math.abs(balanzaIgv(mes(), null).inclinacion)).toBeLessThanOrEqual(TOPE_INCLINACION);
  });

  describe("por lugar (cuando la base traiga el reparto)", () => {
    it("todas las sedes: una pesa por lugar en cada plato, y la suma da la cuenta de CAYLA", () => {
      const b = balanzaIgv(mes(), 890, { porLugar: LUGARES });
      expect(b.porLugar).toBe(true);
      expect(b.cobrado.pesas.map((p) => p.clave)).toEqual(["tru", "aqp"]);
      expect(b.compras.pesas.map((p) => p.clave)).toEqual(["tru", "aqp", "lim", "taller", "empresa"]);
      expect(b.cuenta).toMatchObject({ cobraste: 16020, compras: 7620, igv: 8400, pagas: 9290 });
      expect(b.cuadra).toBe(true);
    });

    it("una sede: su cuenta; Lima, que solo compró, baja el pago", () => {
      const b = balanzaIgv(mes(), 0, { porLugar: LUGARES, sede: "lim" });
      expect(b.cuenta).toMatchObject({ cobraste: 0, compras: 1250, igv: -1250, pagas: 0, estado: "a_favor" });
      expect(b.inclinacion).toBe(-TOPE_INCLINACION);
    });

    it("el saldo que traías es de CAYLA entera: no pesa en la balanza de una sede", () => {
      const b = balanzaIgv(mes({ saldoAnterior: 500, aPagar: 7900 }), 560, { porLugar: LUGARES, sede: "tru" });
      expect(b.compras.pesas.map((p) => p.clave)).toEqual(["tru"]);
      expect(b.cuenta).toMatchObject({ igv: 7180, pagas: 7740, saldoAnterior: 0 });
    });
  });

  it("se pidió una sede y la base no trae el reparto: CAYLA entera, avisado", () => {
    const b = balanzaIgv(mes(), 890, { sede: "tru" });
    expect(b.sinReparto).toBe(true);
    expect(b.porLugar).toBe(false);
    expect(b.cuenta.pagas).toBe(9290);
  });
});

describe("alturasPesas", () => {
  it("el plato más pesado mide el alto entero; el otro, en proporción", () => {
    const a = alturasPesas(balanzaIgv(mes(), 890), 120);
    expect(a.cobrado).toEqual([120]);
    expect(a.compras.reduce((x, y) => x + y, 0)).toBeCloseTo((7620 / 16020) * 120, -1);
  });

  it("con notas de crédito, la pila mide el total neto, no la suma bruta", () => {
    const b = balanzaIgv(mes({ creditoNotas: 1620, credito: 6000, aPagar: 10020 }), null);
    const a = alturasPesas(b, 120);
    expect(a.compras.reduce((x, y) => x + y, 0)).toBeCloseTo((6000 / 16020) * 120, -1);
  });

  it("una pesa muy chica igual se ve", () => {
    const b = balanzaIgv(mes({ creditoTaller: 1, credito: 6641, aPagar: 9379 }), null);
    expect(Math.min(...alturasPesas(b, 120).compras)).toBeGreaterThanOrEqual(6);
  });
});
