import { describe, expect, it } from "vitest";
import { empresaDelListado, insigniaDeEmpresa, opcionesDeEmpresa, seVeAqui, soloLasDeAqui, type EmpresaDeSede } from "./empresas-de-sede-reglas";

const CAYLA: EmpresaDeSede = { id: "e-cayla", clave: "cayla", nombre: "CAYLA" };
const CLAURE: EmpresaDeSede = { id: "e-claure", clave: "claure", nombre: "CLAURE" };
const LIMA = [CAYLA, CLAURE];
const TRUJILLO = [CAYLA];

const blusaCayla = { id: "becky", empresaId: CAYLA.id };
const blusaClaure = { id: "broana", empresaId: CLAURE.id };
const sinEmpresa = { id: "vieja", empresaId: undefined };

describe("seVeAqui y soloLasDeAqui: una prenda de CLAURE solo donde CLAURE opera", () => {
  it("en Trujillo (solo CAYLA) la de CLAURE no se ve; la de CAYLA, sí", () => {
    expect(seVeAqui(CLAURE.id, TRUJILLO)).toBe(false);
    expect(seVeAqui(CAYLA.id, TRUJILLO)).toBe(true);
    expect(soloLasDeAqui([blusaCayla, blusaClaure], TRUJILLO)).toEqual([blusaCayla]);
  });

  it("en Lima (CAYLA y CLAURE) se ven las dos", () => {
    expect(soloLasDeAqui([blusaCayla, blusaClaure], LIMA)).toEqual([blusaCayla, blusaClaure]);
  });

  it("sin saber las empresas de aquí (la base no respondió) no se esconde nada", () => {
    expect(soloLasDeAqui([blusaCayla, blusaClaure], null)).toEqual([blusaCayla, blusaClaure]);
    expect(seVeAqui(CLAURE.id, null)).toBe(true);
  });

  it("una prenda sin empresa conocida (catálogo de antes) se ve", () => {
    expect(soloLasDeAqui([sinEmpresa, blusaClaure], TRUJILLO)).toEqual([sinEmpresa]);
    expect(seVeAqui(null, TRUJILLO)).toBe(true);
  });
});

describe("insigniaDeEmpresa: CLAURE se marca donde conviven dos empresas", () => {
  it("en Lima la de CLAURE dice «CLAURE» y la de CAYLA no lleva insignia", () => {
    expect(insigniaDeEmpresa(CLAURE.id, LIMA)).toBe("CLAURE");
    expect(insigniaDeEmpresa(CAYLA.id, LIMA)).toBeNull();
  });

  it("en una sede con una sola empresa, nadie lleva insignia", () => {
    expect(insigniaDeEmpresa(CAYLA.id, TRUJILLO)).toBeNull();
  });

  it("sin la lista o sin la empresa de la prenda, no hay insignia", () => {
    expect(insigniaDeEmpresa(CLAURE.id, null)).toBeNull();
    expect(insigniaDeEmpresa(undefined, LIMA)).toBeNull();
  });

  it("dice el nombre tal como está en la base (si mañana es «Claurè», sale «Claurè»)", () => {
    expect(insigniaDeEmpresa(CLAURE.id, [CAYLA, { ...CLAURE, nombre: "Claurè" }])).toBe("Claurè");
  });
});

describe("empresaDelListado: con qué empresa se pide Catálogo ▸ Productos", () => {
  it("en Trujillo siempre CAYLA, aunque la URL diga CLAURE", () => {
    expect(empresaDelListado(undefined, TRUJILLO)).toBe(CAYLA.id);
    expect(empresaDelListado(CLAURE.id, TRUJILLO)).toBe(CAYLA.id);
  });

  it("en Lima, la elegida en la píldora; sin elegir, ninguna (salen las dos)", () => {
    expect(empresaDelListado(CLAURE.id, LIMA)).toBe(CLAURE.id);
    expect(empresaDelListado(undefined, LIMA)).toBeUndefined();
  });

  it("en Lima, una empresa que no opera allí se ignora", () => {
    expect(empresaDelListado("e-otra", LIMA)).toBeUndefined();
  });

  it("sin la lista, la de la URL como antes", () => {
    expect(empresaDelListado(CLAURE.id, null)).toBe(CLAURE.id);
    expect(empresaDelListado(undefined, null)).toBeUndefined();
  });
});

describe("opcionesDeEmpresa: la píldora «Tienda» solo donde hay que elegir", () => {
  it("en Lima ofrece las dos; en Trujillo no aparece", () => {
    expect(opcionesDeEmpresa(LIMA)).toEqual([
      { id: CAYLA.id, nombre: "CAYLA" },
      { id: CLAURE.id, nombre: "CLAURE" },
    ]);
    expect(opcionesDeEmpresa(TRUJILLO)).toBeNull();
    expect(opcionesDeEmpresa(null)).toBeNull();
  });
});
