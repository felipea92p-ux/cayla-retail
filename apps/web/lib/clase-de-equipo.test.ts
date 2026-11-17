import { describe, expect, it } from "vitest";
import { leerEquipo, leerEquipoRecibido, type Equipo } from "./clase-de-equipo";

describe("leerEquipo (ADR-0674): la clase del equipo, en los rangos gruesos del navegador", () => {
  it("un teléfono de gama baja en Chrome: 2 GB, 8 núcleos, 3G y ahorro de datos", () => {
    const nav = { deviceMemory: 2, hardwareConcurrency: 8, connection: { effectiveType: "3g", saveData: true } };
    expect(leerEquipo(nav, true)).toEqual({ ram: 2, nucleos: 8, red: "3g", ahorroDeDatos: true, tactil: true });
  });

  it("Safari y Firefox no dan memoria ni red: quedan en null, sin inventar", () => {
    expect(leerEquipo({ hardwareConcurrency: 4 })).toEqual({ ram: null, nucleos: 4, red: null, ahorroDeDatos: false, tactil: false });
  });

  it("sin navegador (el servidor) no lanza", () => {
    expect(leerEquipo(undefined)).toEqual({ ram: null, nucleos: null, red: null, ahorroDeDatos: false, tactil: false });
    expect(leerEquipo(null)).toEqual({ ram: null, nucleos: null, red: null, ahorroDeDatos: false, tactil: false });
  });

  it("la memoria es una potencia de dos: las de antes (hasta 8) y las nuevas (16, 32)", () => {
    for (const ram of [0.25, 0.5, 1, 2, 4, 8, 16, 32]) expect(leerEquipo({ deviceMemory: ram }).ram).toBe(ram);
  });

  it("una memoria que no es de las que da Chrome, o una red rara, no se anota", () => {
    expect(leerEquipo({ deviceMemory: 3, connection: { effectiveType: "5g" } })).toMatchObject({ ram: null, red: null });
    expect(leerEquipo({ deviceMemory: "2", hardwareConcurrency: 2.5 })).toMatchObject({ ram: null, nucleos: null });
  });

  it("los núcleos se anotan con tope 16: más no cambia la clase y sí distingue al equipo", () => {
    expect(leerEquipo({ hardwareConcurrency: 64 }).nucleos).toBe(16);
  });

  it("solo `saveData === true` es ahorro de datos", () => {
    expect(leerEquipo({ connection: { saveData: "true" } }).ahorroDeDatos).toBe(false);
  });

  it("si leer `connection` lanza, el resto se lee igual", () => {
    const nav = {
      deviceMemory: 4,
      get connection(): never {
        throw new Error("bloqueado");
      },
    };
    expect(leerEquipo(nav)).toEqual({ ram: 4, nucleos: null, red: null, ahorroDeDatos: false, tactil: false });
  });
});

describe("leerEquipoRecibido: lo que el servidor cree de la clase del equipo", () => {
  const BUENO: Equipo = { ram: 2, nucleos: 8, red: "4g", ahorroDeDatos: false, tactil: true };

  it("ida y vuelta de lo que arma el navegador", () => {
    expect(leerEquipoRecibido(JSON.parse(JSON.stringify(BUENO)))).toEqual(BUENO);
    expect(leerEquipoRecibido({ ram: null, nucleos: null, red: null, ahorroDeDatos: false, tactil: false })).toEqual({
      ram: null,
      nucleos: null,
      red: null,
      ahorroDeDatos: false,
      tactil: false,
    });
  });

  it("de una pestaña vieja llega sin equipo: null", () => {
    expect(leerEquipoRecibido(undefined)).toBeNull();
    expect(leerEquipoRecibido("2gb")).toBeNull();
  });

  it("algo fuera de forma no se cree a medias: null entero", () => {
    for (const malo of [
      { ...BUENO, ram: 3 },
      { ...BUENO, ram: 128 },
      { ...BUENO, tactil: "si" },
      { ...BUENO, ram: "2" },
      { ...BUENO, nucleos: 0 },
      { ...BUENO, nucleos: 17 },
      { ...BUENO, red: "wifi" },
      { ...BUENO, ahorroDeDatos: "no" },
      { ram: 2, nucleos: 8, red: "4g", tactil: true },
    ]) {
      expect(leerEquipoRecibido(malo)).toBeNull();
    }
  });
});
