import { describe, expect, it } from "vitest";
import {
  alternarMedio,
  calcular,
  cambioEnEfectivo,
  camposDeCorregir,
  fraseDelCuadre,
  leerMonto,
  MEDIOS_CORREGIBLES,
  puedeCorregirPago,
  repartoInicial,
  ventaACorregir,
  type Reparto,
} from "./corregir-pago-reglas";
import type { PagoRecibo } from "./recibo-reglas";

const pago = (metodo: PagoRecibo["metodo"], monto: number): PagoRecibo => ({
  metodo,
  monto,
  recibido: null,
  vuelto: 0,
});

// Una venta de S/ 79.88 cobrada en efectivo: 79.80 en monedas + 0.08 de redondeo (ADR-0311).
const conRedondeo = ventaACorregir({
  pagos: [pago("efectivo", 79.8)],
  redondeo: 0.08,
});
// Una de S/ 100 mitad efectivo, mitad Yape.
const mixta = ventaACorregir({
  pagos: [pago("efectivo", 50), pago("yape", 50)],
  redondeo: 0,
});

describe("lo que se reparte", () => {
  it("es lo cobrado con el redondeo de antes, sin el adelanto de un apartado", () => {
    expect(conRedondeo.cobrado).toBe(79.88);
    const conAnticipo = ventaACorregir({
      pagos: [
        pago("anticipo" as PagoRecibo["metodo"], 30),
        pago("efectivo", 70),
      ],
      redondeo: 0,
    });
    expect(conAnticipo.cobrado).toBe(70);
    expect(conAnticipo.pagosAntes.map((p) => p.metodo)).toEqual(["efectivo"]);
  });

  it("la hoja abre con lo de antes y el efectivo con su redondeo devuelto", () => {
    expect(repartoInicial(conRedondeo)).toEqual({
      medios: ["efectivo"],
      montos: { efectivo: "79.88" },
    });
    expect(repartoInicial(mixta).medios).toEqual(["efectivo", "yape"]);
  });
});

describe("leerMonto", () => {
  it("entiende cómo lo escribe una persona", () => {
    expect(leerMonto("40")).toBe(4000);
    expect(leerMonto("40,5")).toBe(4050);
    expect(leerMonto("S/ 40.50")).toBe(4050);
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("4o")).toBeNull();
    expect(leerMonto("40.555")).toBeNull();
    expect(leerMonto("-3")).toBeNull();
  });
});

describe("calcular", () => {
  it("con un solo medio se lleva todo, sin escribir nada", () => {
    const c = calcular(conRedondeo, { medios: ["yape"], montos: {} }, true);
    expect(c.pagos).toEqual([{ metodo: "yape", monto: 79.88 }]);
    expect(c.efectivo).toBeNull();
    expect(c.problema).toBeNull();
  });

  it("el último marcado se lleva lo que falta, y la suma es siempre lo cobrado", () => {
    const r: Reparto = {
      medios: ["efectivo", "yape"],
      montos: { efectivo: "40.15" },
    };
    const c = calcular(conRedondeo, r, true);
    expect(c.resto).toBe("yape");
    expect(c.pagos).toEqual([
      { metodo: "efectivo", monto: 40.15 },
      { metodo: "yape", monto: 39.73 },
    ]);
    expect(c.efectivo).toEqual({ aCobrar: 40.1, redondeo: 0.05 });
    const suma = c.pagos.reduce((a, p) => a + Math.round(p.monto * 100), 0);
    expect(suma).toBe(7988);
  });

  it("sin redondeo en la caja, el efectivo va exacto", () => {
    const c = calcular(
      conRedondeo,
      { medios: ["efectivo"], montos: {} },
      false,
    );
    expect(c.efectivo).toEqual({ aCobrar: 79.88, redondeo: 0 });
  });

  it("dice qué falta: sin medios, sin monto, o un monto que ya pasa el total", () => {
    expect(calcular(mixta, { medios: [], montos: {} }, true).problema).toBe(
      "Marca con qué pagó.",
    );
    expect(
      calcular(mixta, { medios: ["tarjeta", "yape"], montos: {} }, true)
        .problema,
    ).toBe("Escribe cuánto fue con Tarjeta.");
    const pasado = calcular(
      mixta,
      { medios: ["tarjeta", "yape"], montos: { tarjeta: "100" } },
      true,
    );
    expect(pasado.problema).toMatch(/no le queda nada a Yape/);
    expect(pasado.pagos).toEqual([]);
  });

  it("menos de S/ 0.10 en efectivo no se puede entregar", () => {
    const c = calcular(
      conRedondeo,
      { medios: ["yape", "efectivo"], montos: { yape: "79.80" } },
      true,
    );
    expect(c.problema).toMatch(/Menos de S\/ 0.10/);
  });

  it("reconoce que es lo mismo que ya estaba (también con el redondeo)", () => {
    expect(
      calcular(conRedondeo, repartoInicial(conRedondeo), true).sinCambios,
    ).toBe(true);
    expect(calcular(mixta, repartoInicial(mixta), true).sinCambios).toBe(true);
    expect(
      calcular(
        mixta,
        { medios: ["yape", "efectivo"], montos: { yape: "50" } },
        true,
      ).sinCambios,
    ).toBe(true);
    expect(
      calcular(
        mixta,
        { medios: ["efectivo", "yape"], montos: { efectivo: "40" } },
        true,
      ).sinCambios,
    ).toBe(false);
  });

  it("recorre todos los medios: cualquiera solo se lleva el total exacto", () => {
    for (const m of MEDIOS_CORREGIBLES) {
      const c = calcular(mixta, { medios: [m], montos: {} }, true);
      expect(c.problema).toBeNull();
      expect(c.pagos).toEqual([{ metodo: m, monto: 100 }]);
    }
  });
});

describe("alternarMedio", () => {
  it("el que se marca va al final (se lleva lo que falta) y desmarcar lo quita", () => {
    let r: Reparto = { medios: ["efectivo"], montos: {} };
    r = alternarMedio(r, "yape");
    expect(r.medios).toEqual(["efectivo", "yape"]);
    r = alternarMedio(r, "efectivo");
    expect(r.medios).toEqual(["yape"]);
  });
});

describe("el cuadre de la caja", () => {
  it("todo a Yape: la caja espera lo que estaba en efectivo menos", () => {
    const c = calcular(conRedondeo, { medios: ["yape"], montos: {} }, true);
    expect(cambioEnEfectivo(conRedondeo, c)).toBe(-79.8);
    expect(fraseDelCuadre(-79.8)).toBe(
      "La caja va a esperar S/ 79.80 menos en efectivo.",
    );
  });

  it("de Yape a efectivo: espera más; sin cambio de efectivo no hay frase", () => {
    const c = calcular(mixta, { medios: ["efectivo"], montos: {} }, true);
    expect(cambioEnEfectivo(mixta, c)).toBe(50);
    expect(fraseDelCuadre(50)).toBe(
      "La caja va a esperar S/ 50.00 más en efectivo.",
    );
    expect(fraseDelCuadre(0)).toBeNull();
  });
});

describe("guía de foco y cuándo se ofrece", () => {
  it("la guía sale de lo mismo que bloquea guardar", () => {
    const ok = calcular(mixta, { medios: ["yape"], montos: {} }, true);
    const campos = camposDeCorregir(ok, { listo: true, motivo: null });
    expect(campos.every((c) => c.hecho)).toBe(true);
    const igual = calcular(mixta, repartoInicial(mixta), true);
    expect(
      camposDeCorregir(igual, { listo: true, motivo: null })[0],
    ).toMatchObject({
      hecho: false,
      pendiente: "Cambia cómo pagó: así ya estaba.",
    });
  });

  it("solo con la caja abierta, en una venta viva con algo cobrado", () => {
    expect(
      puedeCorregirPago({ anulada: false, cajaAbierta: true, cobrado: 10 }),
    ).toEqual({ ok: true });
    expect(
      puedeCorregirPago({ anulada: false, cajaAbierta: false, cobrado: 10 }),
    ).toMatchObject({
      ok: false,
      motivo: expect.stringMatching(/ya se cerró/),
    });
    expect(
      puedeCorregirPago({ anulada: true, cajaAbierta: true, cobrado: 10 }),
    ).toEqual({ ok: false, motivo: null });
    expect(
      puedeCorregirPago({ anulada: false, cajaAbierta: true, cobrado: 0 }),
    ).toEqual({ ok: false, motivo: null });
    expect(
      puedeCorregirPago({ anulada: false, cajaAbierta: null, cobrado: 10 }),
    ).toEqual({ ok: false, motivo: null });
  });
});
