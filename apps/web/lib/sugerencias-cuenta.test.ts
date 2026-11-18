import { describe, expect, it } from "vitest";
import { TEXTO_TIPO_CUENTA, TIPOS_QUE_SE_AGREGAN, type TipoCuenta } from "./cuentas-dinero-reglas";
import { sugerirNombreCuenta } from "./sugerencias-cuenta";

const TODOS = Object.keys(TEXTO_TIPO_CUENTA) as TipoCuenta[];

describe("el ejemplo del nombre de una cuenta", () => {
  it("todo tipo tiene su ejemplo, y es estable", () => {
    for (const t of TODOS) {
      expect(sugerirNombreCuenta(t).length).toBeGreaterThan(0);
      expect(sugerirNombreCuenta(t)).toBe(sugerirNombreCuenta(t));
    }
  });

  it("cada tipo que se puede agregar dice otra cosa, y sigue al combo", () => {
    const t = TIPOS_QUE_SE_AGREGAN.map((x) => sugerirNombreCuenta(x.tipo));
    expect(new Set(t).size).toBe(t.length);
    expect(sugerirNombreCuenta("tarjeta_credito")).not.toMatch(/Cta\. corriente/);
    expect(sugerirNombreCuenta("banco")).toMatch(/Cta\. corriente/);
  });

  it("cabe en la caja de una hoja a 375 px", () => {
    for (const t of TODOS) expect(sugerirNombreCuenta(t).length).toBeLessThanOrEqual(26);
  });
});
