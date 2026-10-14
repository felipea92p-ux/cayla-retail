import { describe, expect, it } from "vitest";
import {
  UMBRAL_BANCARIZACION,
  avisoBancarizacion,
  avisoBancarizacionLote,
  clavesQueSePreguntan,
  leerNoDeducibles,
  pagoNoBancarizado,
  textoNoDeducible,
} from "./no-deducible-reglas";

// Lo «no deducible» (ADR-0362, fase 6 · actividad 6). La regla es la de la base (20261014002000): estos casos son los mismos de
// `scripts/pruebas/no_deducible.mjs`, del lado de la pantalla.

const UUID = "11111111-1111-4111-8111-111111111111";

describe("la regla de la bancarización (la misma que fn_pago_no_bancarizado)", () => {
  it("efectivo o desde un fondo, en un comprobante de S/ 2 000 o más", () => {
    expect(UMBRAL_BANCARIZACION).toBe(2000);
    expect(pagoNoBancarizado(2360, "efectivo", "caja_fuerte")).toBe(true);
    expect(pagoNoBancarizado(2360, "yape", "fondo")).toBe(true);
    expect(pagoNoBancarizado(2360, "transferencia", "fondo")).toBe(true);
    expect(pagoNoBancarizado(2360, "transferencia", "banco")).toBe(false);
    expect(pagoNoBancarizado(2360, "tarjeta", "tarjeta_credito")).toBe(false);
    expect(pagoNoBancarizado(2000, "efectivo", null)).toBe(true);
    expect(pagoNoBancarizado(1999.99, "efectivo", null)).toBe(false);
    expect(pagoNoBancarizado(null, "efectivo", "fondo")).toBe(false);
  });
});

describe("el aviso al pagar", () => {
  it("suma solo lo que queda no deducible; lo del banco no", () => {
    const a = avisoBancarizacion(2360, [
      { monto: "1000", medio: "transferencia", tipoCuenta: "banco" },
      { monto: "500", medio: "efectivo", tipoCuenta: "caja_fuerte" },
      { monto: "860", medio: "yape", tipoCuenta: "fondo" },
    ]);
    expect(a?.monto).toBe(1360);
    expect(a?.titulo).toBe("S/ 1,360.00 quedan «no deducibles»");
    expect(a?.texto).toMatch(/^SUNAT pide que un comprobante de S\/ 2,000 o más se pague por el banco\./);
  });
  it("debajo del umbral, todo por el banco o sin montos escritos: nada que avisar", () => {
    expect(avisoBancarizacion(1999.99, [{ monto: "1999.99", medio: "efectivo" }])).toBeNull();
    expect(avisoBancarizacion(5000, [{ monto: "5000", medio: "transferencia", tipoCuenta: "banco" }])).toBeNull();
    expect(avisoBancarizacion(5000, [{ monto: "", medio: "efectivo" }])).toBeNull();
    expect(avisoBancarizacion(null, [{ monto: "3000", medio: "efectivo" }])).toBeNull();
  });
  it("lee los montos como se escriben (con coma de miles o decimal, con «S/»)", () => {
    expect(avisoBancarizacion(3000, [{ monto: "S/ 2,500.50", medio: "efectivo" }])?.monto).toBe(2500.5);
    expect(avisoBancarizacion(3000, [{ monto: "2500,5", medio: "efectivo" }])?.monto).toBe(2500.5);
    expect(avisoBancarizacion(3000, [{ monto: 3000, medio: "plin", tipoCuenta: "fondo" }])?.monto).toBe(3000);
  });
});

describe("el aviso de «Pagar juntos» (un pago repartido entre varios comprobantes)", () => {
  it("todos de S/ 2 000 o más: es todo lo que va en efectivo o desde un fondo", () => {
    const a = avisoBancarizacionLote(
      [
        { total: 2500, monto: 2500 },
        { total: 3000, monto: 1000 },
      ],
      [
        { monto: "3000", medio: "transferencia", tipoCuenta: "banco" },
        { monto: "500", medio: "efectivo" },
      ],
    );
    expect(a?.monto).toBe(500);
    expect(a?.titulo).toBe("S/ 500.00 quedan «no deducibles»");
  });
  it("solo algunos: «hasta» lo menor entre el efectivo y lo que reciben los grandes", () => {
    const a = avisoBancarizacionLote(
      [
        { total: 2500, monto: 300 },
        { total: 800, monto: 800 },
      ],
      [{ monto: "1100", medio: "yape", tipoCuenta: "fondo" }],
    );
    expect(a?.monto).toBe(300);
    expect(a?.titulo).toBe("Hasta S/ 300.00 quedan «no deducibles»");
  });
  it("ningún comprobante grande que reciba plata, o todo por el banco: nada", () => {
    expect(avisoBancarizacionLote([{ total: 2500, monto: 0 }, { total: 900, monto: 900 }], [{ monto: "900", medio: "efectivo" }])).toBeNull();
    expect(avisoBancarizacionLote([{ total: 2500, monto: 2500 }], [{ monto: "2500", medio: "transferencia", tipoCuenta: "banco" }])).toBeNull();
  });
});

describe("lo que responde la base", () => {
  it("solo se preguntan las claves de pagos, pagos del Taller y gastos", () => {
    expect(clavesQueSePreguntan([`pago:${UUID}`, `mov:${UUID}`, `gasto:${UUID}`, `pagoprod:${UUID}`, "pago:basura", `pago:${UUID}`])).toEqual([
      `pago:${UUID}`,
      `gasto:${UUID}`,
      `pagoprod:${UUID}`,
    ]);
  });
  it("las filas, por clave; un motivo desconocido se descarta", () => {
    const m = leerNoDeducibles([
      { clave: `pago:${UUID}`, motivo: "bancarizacion", monto: "500.00", total: "2360.00", tope: "2000" },
      { clave: `gasto:${UUID}`, motivo: "otro", monto: 1 },
      { motivo: "planilla_tope" },
    ]);
    expect([...m.values()]).toEqual([{ clave: `pago:${UUID}`, motivo: "bancarizacion", monto: 500, total: 2360, tope: 2000 }]);
    expect(leerNoDeducibles(null).size).toBe(0);
  });
  it("cómo se dice en una fila: entera o en parte, y por qué", () => {
    const banco = { clave: "pago:x", motivo: "bancarizacion" as const, monto: 500, total: 2360, tope: 2000 };
    expect(textoNoDeducible(banco, -500)).toEqual({
      etiqueta: "No deducible",
      porque: "Comprobante de S/ 2,360.00 pagado en efectivo o desde un fondo: SUNAT lo pide por el banco.",
    });
    const planilla = { clave: "gasto:x", motivo: "planilla_tope" as const, monto: 34.8, total: 100, tope: 45.2 };
    expect(textoNoDeducible(planilla, -50)).toEqual({
      etiqueta: "No deducible: S/ 34.80",
      porque: "Pasa el tope diario de la planilla de movilidad (S/ 45.20 por persona): ese día suman S/ 100.00.",
    });
    expect(textoNoDeducible({ ...planilla, monto: 20 }, -20).etiqueta).toBe("No deducible");
  });
});
