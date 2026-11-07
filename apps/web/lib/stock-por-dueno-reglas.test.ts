import { describe, expect, it } from "vitest";
import { agruparPorDueno, conDuenos, lineaDeDuenos, textoDeDueno, type RepartoDeStock } from "./stock-por-dueno-reglas";

const NOMBRES = new Map([
  ["e-cayla", "CAYLA"],
  ["e-claure", "CLAURE"],
]);
const fila = (varianteId: string, clave: "cayla" | "claure", cantidad: number, cantidadApartada = 0): RepartoDeStock => ({
  varianteId,
  empresaId: `e-${clave}`,
  clave,
  cantidad,
  cantidadApartada,
});

describe("agruparPorDueno (ADR-0542)", () => {
  it("agrupa por prenda, con el nombre de cada empresa y la casa primero aunque llegue después", () => {
    const m = agruparPorDueno([fila("v1", "claure", 2), fila("v1", "cayla", 3), fila("v2", "cayla", 1)], NOMBRES);
    expect(m.get("v1")?.map((d) => `${d.nombre} ${d.cantidad}`)).toEqual(["CAYLA 3", "CLAURE 2"]);
    expect(m.get("v2")?.map((d) => d.nombre)).toEqual(["CAYLA"]);
  });

  it("ignora las filas sin unidades ni apartadas", () => {
    const m = agruparPorDueno([fila("v1", "cayla", 0), fila("v1", "claure", 0, 0)], NOMBRES);
    expect(m.size).toBe(0);
  });

  it("una fila con solo apartadas sigue contando (la prenda existe, aunque no haya disponibles)", () => {
    const m = agruparPorDueno([fila("v1", "claure", 0, 1)], NOMBRES);
    expect(m.get("v1")).toHaveLength(1);
  });

  it("sin el nombre de la empresa, cae a su clave en mayúsculas: nunca un hueco", () => {
    const m = agruparPorDueno([fila("v1", "claure", 2)], new Map());
    expect(m.get("v1")?.[0].nombre).toBe("CLAURE");
  });
});

describe("conDuenos", () => {
  const filas = [{ varianteId: "v1", x: 1 }, { varianteId: "v2", x: 2 }];

  it("pone el reparto solo en las prendas que lo tienen y no toca el resto", () => {
    const m = agruparPorDueno([fila("v1", "claure", 2), fila("v1", "cayla", 3)], NOMBRES);
    const r = conDuenos(filas, m);
    expect(r[0].duenos).toHaveLength(2);
    expect("duenos" in r[1]).toBe(false);
  });

  it("sin reparto (la base no respondió, o la sede tiene una sola empresa) devuelve las filas tal cual", () => {
    expect(conDuenos(filas, null)).toEqual(filas);
    expect(conDuenos(filas, new Map())).toEqual(filas);
  });
});

describe("lineaDeDuenos: solo se habla de dueños cuando alguien que no es la casa tiene unidades", () => {
  it("una prenda toda de CAYLA no dice nada (marcar CAYLA en cada prenda sería ruido)", () => {
    const m = agruparPorDueno([fila("v1", "cayla", 5)], NOMBRES);
    expect(lineaDeDuenos(m.get("v1"))).toBeNull();
  });

  it("con unidades de las dos, dice las dos, la casa primero", () => {
    const m = agruparPorDueno([fila("v1", "cayla", 3), fila("v1", "claure", 2)], NOMBRES);
    expect(lineaDeDuenos(m.get("v1"))?.map(textoDeDueno)).toEqual(["CAYLA 3", "CLAURE 2"]);
  });

  it("una prenda toda de CLAURE lo dice, solo CLAURE", () => {
    const m = agruparPorDueno([fila("v1", "claure", 4)], NOMBRES);
    expect(lineaDeDuenos(m.get("v1"))?.map(textoDeDueno)).toEqual(["CLAURE 4"]);
  });

  it("sin reparto no hay línea", () => {
    expect(lineaDeDuenos(undefined)).toBeNull();
    expect(lineaDeDuenos([])).toBeNull();
  });

  it("un dueño con solo apartadas (cantidad 0) no cuenta como dueño con unidades", () => {
    const m = agruparPorDueno([fila("v1", "cayla", 3), fila("v1", "claure", 0, 1)], NOMBRES);
    expect(lineaDeDuenos(m.get("v1"))).toBeNull();
  });
});
