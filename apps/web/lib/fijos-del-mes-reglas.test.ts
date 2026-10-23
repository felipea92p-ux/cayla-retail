import { describe, expect, it } from "vitest";
import type { GastoFijoMes } from "./gastos-reglas";
import { bajadaDeLaCola, colaDeFijos, fijosQueSeParecen, textoFechaDeFijo, tituloDeLaCola } from "./fijos-del-mes-reglas";

const F = (p: Partial<GastoFijoMes> & Pick<GastoFijoMes, "id" | "estado" | "fechaEsperada">): GastoFijoMes => ({
  ubicacionId: null, ubicacionNombre: "De la empresa", categoria: "software", categoriaNombre: "Software", descripcion: p.id, proveedorId: null, proveedorNombre: null,
  comprobanteTipo: "sin_comprobante", monto: 100, montoVariable: false, diaDelMes: 15, momento: "dia", gastoId: null, gastoMonto: null, ...p,
});

describe("colaDeFijos: lo que se lee de arriba abajo", () => {
  const fijos = [
    F({ id: "luz", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 280, montoVariable: true }),
    F({ id: "alquiler", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 4200 }),
    F({ id: "celular", estado: "falta", fechaEsperada: "2026-10-15", monto: 30, montoVariable: true }),
    F({ id: "ia", estado: "falta", fechaEsperada: "2026-10-17", monto: 690 }),
    F({ id: "musica", estado: "falta", fechaEsperada: "2026-10-15", monto: 35 }),
    F({ id: "internet", estado: "registrado", fechaEsperada: "2026-10-15", monto: 106, gastoId: "g1", gastoMonto: 110 }),
  ];
  const c = colaDeFijos(fijos);

  it("primero los que ya pasaron su fecha, el más atrasado primero y a igual fecha el de más monto", () => {
    expect(c.faltan.map((f) => f.id)).toEqual(["musica", "celular", "ia"]);
  });
  it("después los que llegan este mes: el más próximo primero y a igual fecha el de más monto", () => {
    expect(c.vienen.map((f) => f.id)).toEqual(["alquiler", "luz"]);
  });
  it("los registrados van aparte y no cuentan como pendientes", () => {
    expect(c.registrados.map((f) => f.id)).toEqual(["internet"]);
    expect(c.pendientes).toBe(5);
    expect(c.total).toBe(6);
    expect(c.montoPendiente).toBe(5235);
  });
  it("la suma es una referencia si algún pendiente es de monto variable", () => {
    expect(c.aproximado).toBe(true);
    expect(colaDeFijos([F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15" })]).aproximado).toBe(false);
  });
  it("no cambia la lista que recibe", () => {
    const antes = fijos.map((f) => f.id);
    colaDeFijos(fijos);
    expect(fijos.map((f) => f.id)).toEqual(antes);
  });
});

describe("el título y la bajada", () => {
  it("el título dice el mes", () => {
    expect(tituloDeLaCola("2026-10")).toBe("Fijos de octubre 2026");
  });
  it("con pendientes: cuántos, cuánto suman y cuántos van", () => {
    const c = colaDeFijos([F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15", monto: 30, montoVariable: true }), F({ id: "b", estado: "falta", fechaEsperada: "2026-10-15", monto: 37 }), F({ id: "c", estado: "registrado", fechaEsperada: "2026-10-15" })]);
    expect(bajadaDeLaCola(c, "2026-10")).toBe("2 por confirmar (~S/ 67) · 1 de 3 ya registrados.");
  });
  it("sin monto variable no lleva «~»", () => {
    expect(bajadaDeLaCola(colaDeFijos([F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31", monto: 4200 })]), "2026-10")).toBe("1 por confirmar (S/ 4,200) · 0 de 1 ya registrados.");
  });
  it("con todos registrados, lo dice; sin fijos, nada", () => {
    expect(bajadaDeLaCola(colaDeFijos([F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-15" })]), "2026-10")).toBe("El fijo de octubre 2026 ya está registrado.");
    expect(bajadaDeLaCola(colaDeFijos([F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-15" }), F({ id: "b", estado: "registrado", fechaEsperada: "2026-10-15" })]), "2026-10")).toBe("Los 2 fijos de octubre 2026 ya están registrados.");
    expect(bajadaDeLaCola(colaDeFijos([]), "2026-10")).toBe("");
  });
});

describe("textoFechaDeFijo: cuándo se esperaba o cuándo llega", () => {
  const HOY = "2026-10-22";
  it("un fijo que ya pasó dice su fecha y los días de atraso, en singular si es uno", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-10-15" }), HOY)).toBe("se esperaba el 15 oct · hace 7 días");
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-10-21" }), HOY)).toBe("se esperaba el 21 oct · hace 1 día");
  });
  it("cuenta bien los días al cruzar de mes", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "2026-09-30" }), "2026-10-02")).toBe("se esperaba el 30 sep · hace 2 días");
  });
  it("uno que llega: hoy, mañana, o la fecha y los días que faltan", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-22" }), HOY)).toBe("se espera hoy");
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-23" }), HOY)).toBe("se espera mañana");
    expect(textoFechaDeFijo(F({ id: "a", estado: "por_llegar", fechaEsperada: "2026-10-31" }), HOY)).toBe("se espera el 31 oct · en 9 días");
  });
  it("uno ya registrado dice cuándo llega cada mes, como siempre", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "registrado", fechaEsperada: "2026-10-15", momento: "quincena" }), HOY)).toBe("la quincena");
  });
  it("una fecha que no se lee no rompe la fila: cae a «cuándo llega»", () => {
    expect(textoFechaDeFijo(F({ id: "a", estado: "falta", fechaEsperada: "undefined", momento: "fin_de_mes" }), HOY)).toBe("a fin de mes");
  });
});

describe("fijosQueSeParecen: un gasto suelto que parece un fijo pendiente", () => {
  const fijos = [
    F({ id: "alq-tru", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "tru", monto: 4200 }),
    F({ id: "alq-alm", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "tru", monto: 1300 }),
    F({ id: "alq-aqp", estado: "por_llegar", fechaEsperada: "2026-10-31", categoria: "alquileres", ubicacionId: "aqp", monto: 3300 }),
    F({ id: "sw", estado: "falta", fechaEsperada: "2026-10-15", categoria: "software", ubicacionId: null, monto: 37 }),
    F({ id: "luz-ya", estado: "registrado", fechaEsperada: "2026-10-15", categoria: "luz", ubicacionId: "tru", monto: 280 }),
  ];
  const g = (p: Partial<{ ubicacion: string; categoria: string; fecha: string; monto: number | null }> = {}) => ({ ubicacion: "tru", categoria: "alquileres", fecha: "2026-10-22", monto: null, ...p });

  it("misma tienda, misma categoría y mismo mes: los fijos que aún no están registrados", () => {
    expect(fijosQueSeParecen(fijos, g(), "2026-10").map((f) => f.id).sort()).toEqual(["alq-alm", "alq-tru"]);
  });
  it("con el monto, el más cercano primero; el monto no descarta a ninguno (un fijo variable es solo una referencia)", () => {
    expect(fijosQueSeParecen(fijos, g({ monto: 1250 }), "2026-10").map((f) => f.id)).toEqual(["alq-alm", "alq-tru"]);
    expect(fijosQueSeParecen(fijos, g({ monto: 4000 }), "2026-10").map((f) => f.id)).toEqual(["alq-tru", "alq-alm"]);
    expect(fijosQueSeParecen(fijos, g({ monto: 9 }), "2026-10")).toHaveLength(2);
  });
  it("otra tienda, otra categoría o un fijo ya registrado no se parecen", () => {
    expect(fijosQueSeParecen(fijos, g({ ubicacion: "lim" }), "2026-10")).toEqual([]);
    expect(fijosQueSeParecen(fijos, g({ categoria: "internet" }), "2026-10")).toEqual([]);
    expect(fijosQueSeParecen(fijos, g({ categoria: "luz" }), "2026-10")).toEqual([]);
  });
  it("un fijo de la empresa se parece a un gasto «de la empresa», no al de una tienda", () => {
    expect(fijosQueSeParecen(fijos, g({ ubicacion: "empresa", categoria: "software" }), "2026-10").map((f) => f.id)).toEqual(["sw"]);
    expect(fijosQueSeParecen(fijos, g({ ubicacion: "tru", categoria: "software" }), "2026-10")).toEqual([]);
  });
  it("un gasto de otro mes no cierra los fijos de este (la base cuenta un gasto por fijo y por mes de la fecha del gasto)", () => {
    expect(fijosQueSeParecen(fijos, g({ fecha: "2026-09-30" }), "2026-10")).toEqual([]);
    expect(fijosQueSeParecen(fijos, g({ fecha: "2026-11-02" }), "2026-10")).toEqual([]);
  });
  it("sin categoría todavía no hay nada que preguntar; y se muestran pocos", () => {
    expect(fijosQueSeParecen(fijos, g({ categoria: "" }), "2026-10")).toEqual([]);
    expect(fijosQueSeParecen(fijos, g(), "2026-10", 1)).toHaveLength(1);
  });
});
