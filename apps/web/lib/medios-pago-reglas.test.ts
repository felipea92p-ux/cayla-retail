import { describe, expect, it } from "vitest";
import { medioNuevo, mediosParaRpc, montoSugerido, repartoDeMedios, type MedioForm } from "./medios-pago-reglas";

const medio = (monto: string, metodo: MedioForm["metodo"] = "transferencia", referencia = ""): MedioForm => ({ metodo, monto, referencia });

describe("repartoDeMedios", () => {
  it("dos medios que suman el total exacto cuadran", () => {
    const r = repartoDeMedios([medio("2000"), medio("478", "efectivo")], 2478, true);
    expect(r).toMatchObject({ suma: 2478, falta: 0, sobra: 0, cuadra: true, error: null });
  });
  it("dice cuánto FALTA y cuánto SOBRA", () => {
    expect(repartoDeMedios([medio("2000")], 2478, true)).toMatchObject({ falta: 478, sobra: 0, cuadra: false });
    expect(repartoDeMedios([medio("2500")], 2478, true)).toMatchObject({ falta: 0, sobra: 22, cuadra: false });
  });
  it("un pago a crédito puede ser parcial: basta con no pasarse del saldo", () => {
    expect(repartoDeMedios([medio("500")], 1180, false).cuadra).toBe(true);
    expect(repartoDeMedios([medio("1200")], 1180, false).cuadra).toBe(false);
    expect(repartoDeMedios([], 1180, false).cuadra).toBe(false);
  });
  it("suma sin errores de punto flotante y acepta coma decimal", () => {
    expect(repartoDeMedios([medio("0,1"), medio("0.2")], 0.3, true).cuadra).toBe(true);
  });
  it("avisa de un monto en cero o con más de dos decimales; los vacíos no cuentan", () => {
    expect(repartoDeMedios([medio("0")], 10, true).error).toContain("mayor a cero");
    expect(repartoDeMedios([medio("10.005")], 10, true).error).toContain("2 decimales");
    expect(repartoDeMedios([medio(""), medio("10")], 10, true)).toMatchObject({ suma: 10, error: null, cuadra: true });
  });
});

describe("armado", () => {
  it("manda a la base solo los medios con monto, redondeados, con su referencia", () => {
    expect(mediosParaRpc([medio("2000", "transferencia", " OP-1 "), medio(""), medio("478", "efectivo")], "2026-09-21")).toEqual([
      { metodo: "transferencia", monto: 2000, fecha: "2026-09-21", referencia: "OP-1" },
      { metodo: "efectivo", monto: 478, fecha: "2026-09-21", referencia: undefined },
    ]);
  });
  it("al agregar un medio propone lo que falta", () => {
    expect(montoSugerido([medio("2000")], 2478)).toBe("478.00");
    expect(montoSugerido([medio("2478")], 2478)).toBe("");
    expect(medioNuevo().metodo).toBe("transferencia");
  });
});
