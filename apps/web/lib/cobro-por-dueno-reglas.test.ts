import { describe, expect, it } from "vitest";
import type { MetodoPagoVenta } from "@cayla-retail/shared";
import { METODOS_PAGO_VENTA } from "@cayla-retail/shared";
import type { UnidadesDeDueno } from "./dueno-reglas";
import { esDeClaure, numeroQueDar, repartoDelTicket } from "./cobro-por-dueno-reglas";

const CAYLA = "id-cayla";
const CLAURE = "id-claure";
const unidades = (empresaId: string, cantidad: number, cantidadApartada = 0): UnidadesDeDueno => ({
  empresaId,
  clave: empresaId === CLAURE ? "claure" : "cayla",
  nombre: empresaId === CLAURE ? "CLAURE" : "CAYLA",
  cantidad,
  cantidadApartada,
});

describe("esDeClaure", () => {
  it("manda lo que eligió la colaboradora", () => {
    const duenos = { v: [unidades(CAYLA, 2), unidades(CLAURE, 3)] };
    expect(esDeClaure("v", null, duenos, { v: CLAURE })).toBe(true);
    expect(esDeClaure("v", "CLAURE", duenos, { v: CAYLA })).toBe(false);
  });
  it("sin elección, toma a la única empresa con unidades disponibles", () => {
    expect(esDeClaure("v", null, { v: [unidades(CLAURE, 1), unidades(CAYLA, 2, 2)] }, {})).toBe(true);
    expect(esDeClaure("v", "CLAURE", { v: [unidades(CAYLA, 1), unidades(CLAURE, 1, 1)] }, {})).toBe(false);
  });
  it("si el reparto no sabe, usa la insignia de la prenda", () => {
    expect(esDeClaure("v", "CLAURE", {}, {})).toBe(true);
    expect(esDeClaure("v", null, {}, {})).toBe(false);
    expect(esDeClaure("v", undefined, { v: [unidades(CAYLA, 0), unidades(CLAURE, 0)] }, {})).toBe(false);
  });
  it("una elección de una empresa que ya no tiene esa prenda no cuenta", () => {
    expect(esDeClaure("v", null, { v: [unidades(CLAURE, 1)] }, { v: CAYLA })).toBe(true);
  });
});

describe("repartoDelTicket", () => {
  const deClaure = (l: { marca: string }) => l.marca === "claure";
  it("multiplica por la cantidad y suma en céntimos, sin errores de coma flotante", () => {
    const lineas = [
      { marca: "claure", cantidad: 3, precioFinalUnitario: 19.9 },
      { marca: "cayla", cantidad: 3, precioFinalUnitario: 0.1 },
      { marca: "cayla", cantidad: 1, precioFinalUnitario: 0.2 },
    ];
    expect(repartoDelTicket(lineas, deClaure)).toEqual({ claure: 59.7, cayla: 0.5 });
  });
  it("una línea a 0 no le suma valor a su marca", () => {
    expect(repartoDelTicket([{ marca: "claure", cantidad: 1, precioFinalUnitario: 59 }, { marca: "cayla", cantidad: 1, precioFinalUnitario: 0 }], deClaure)).toEqual({ claure: 59, cayla: 0 });
  });
  it("un ticket vacío vale cero", () => {
    expect(repartoDelTicket([], deClaure)).toEqual({ claure: 0, cayla: 0 });
  });
});

describe("numeroQueDar", () => {
  const SIN_CELULAR = METODOS_PAGO_VENTA.filter((m) => m !== "yape" && m !== "plin");
  const CELULAR: MetodoPagoVenta[] = ["yape", "plin"];

  it("en una sede con una sola empresa no dice nada, con ningún medio", () => {
    expect(numeroQueDar(null, [])).toBeNull();
    for (const m of METODOS_PAGO_VENTA) expect(numeroQueDar(null, [m])).toBeNull();
  });
  it("un ticket todo de CLAURE con Yape o Plin manda al número de Claudia", () => {
    for (const m of CELULAR) expect(numeroQueDar({ claure: 59, cayla: 0 }, [m])?.titulo).toBe("Dale el número de Claudia");
  });
  it("un ticket todo de CAYLA con Yape o Plin manda al número de CAYLA o al QR", () => {
    for (const m of CELULAR) {
      const dicho = numeroQueDar({ claure: 0, cayla: 59 }, [m]);
      expect(dicho?.titulo).toBe("Dale el número de CAYLA o el QR");
      expect(dicho?.detalle).toContain("QR");
    }
  });
  it("un ticket de una marca no dice nada antes de elegir ni con otro medio", () => {
    for (const reparto of [{ claure: 59, cayla: 0 }, { claure: 0, cayla: 59 }]) {
      expect(numeroQueDar(reparto, [])).toBeNull();
      for (const m of SIN_CELULAR) expect(numeroQueDar(reparto, [m])).toBeNull();
    }
  });
  it("un ticket de dos marcas dice cuánto va a cada número antes de elegir y con Yape", () => {
    for (const medios of [[], ["yape"], ["plin"], ["efectivo", "yape"]] as MetodoPagoVenta[][]) {
      const dicho = numeroQueDar({ claure: 70, cayla: 28 }, medios);
      expect(dicho?.titulo).toBe("Este ticket es de dos marcas");
      expect(dicho?.detalle).toContain("70.00");
      expect(dicho?.detalle).toContain("28.00");
    }
  });
  it("un ticket de dos marcas se calla si ya se cobra todo por otro medio", () => {
    for (const m of SIN_CELULAR) expect(numeroQueDar({ claure: 70, cayla: 28 }, [m])).toBeNull();
  });
  it("un ticket que no vale nada no dice nada", () => {
    expect(numeroQueDar({ claure: 0, cayla: 0 }, ["yape"])).toBeNull();
  });
});
