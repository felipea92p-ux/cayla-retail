import { describe, expect, it } from "vitest";
import { CLAVES_MEDIDA, cookieMedidas, hayMedidaApagada, leerEleccionMedidas, MEDIDAS, medidaVisible } from "./rendimiento-medidas";

describe("medidaVisible", () => {
  it("sin elección expresa, todo se ve", () => {
    for (const c of CLAVES_MEDIDA) expect(medidaVisible(c, {})).toBe(true);
  });
  it("solo se oculta lo que se apagó a propósito", () => {
    expect(medidaVisible("prendas", { prendas: false })).toBe(false);
    expect(medidaVisible("horas", { prendas: false })).toBe(true);
    expect(medidaVisible("prendas", { prendas: true })).toBe(true);
  });
});

describe("hayMedidaApagada", () => {
  it("es verdadero solo si alguna está en false", () => {
    expect(hayMedidaApagada({})).toBe(false);
    expect(hayMedidaApagada({ horas: true })).toBe(false);
    expect(hayMedidaApagada({ horas: false })).toBe(true);
  });
});

describe("leerEleccionMedidas", () => {
  it("lee las claves conocidas con valor booleano", () => {
    expect(leerEleccionMedidas('{"horas":false,"prendas":true}')).toEqual({ horas: false, prendas: true });
  });
  it("descarta claves de más y valores que no son booleanos", () => {
    expect(leerEleccionMedidas('{"horas":false,"otra":false,"prendas":"no","proyeccion":0}')).toEqual({ horas: false });
  });
  it("una cookie vacía, rota o de otra forma vuelve a lo de siempre (todo visible)", () => {
    for (const v of [undefined, "", "no es json", "[]", "null", "42", '"texto"']) expect(leerEleccionMedidas(v)).toEqual({});
  });
});

describe("MEDIDAS y cookie", () => {
  it("hay una entrada por clave, sin repetir, con título y explicación", () => {
    expect(MEDIDAS.map((m) => m.clave)).toEqual([...CLAVES_MEDIDA]);
    for (const m of MEDIDAS) {
      expect(m.titulo.length).toBeGreaterThan(3);
      expect(m.explica.length).toBeGreaterThan(10);
    }
  });
  it("una cookie por cuenta, y una para la terminal", () => {
    expect(cookieMedidas("p1")).not.toBe(cookieMedidas("p2"));
    expect(cookieMedidas(null)).toBe("cayla_rendimiento_terminal");
  });
});
