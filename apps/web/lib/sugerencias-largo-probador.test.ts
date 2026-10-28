import { describe, expect, it } from "vitest";
import { REFERENCIA_SIN_TIPICO, sugerirLargo } from "./sugerencias-largo-probador";

// Las categorías de la tienda online que van al probador (`apps/tienda/lib/grupos.ts`) y una que un Líder podría crear sin deploy.
const PREFIJOS = ["CMS", "BLU", "TOP", "POL", "BOD", "COR", "SUD", "VES", "CON", "ENT", "PAN", "JEA", "FAL", "SHO", "CAS", "BLZ", "CHA", "CAP", "ABR", "CAR", "ZZZ"];

describe("sugerirLargo: el ejemplo dice lo que va a pasar con esa prenda", () => {
  it("con típico, el ejemplo ES el típico (lo que usa el probador si la caja queda vacía), para toda categoría", () => {
    for (const prefijo of PREFIJOS) expect(sugerirLargo({ prefijo, tipico: 47 })).toEqual({ texto: "47 (el típico)", origen: "tipico" });
  });

  it("sin típico, la referencia de su categoría; nunca la de otra", () => {
    expect(sugerirLargo({ prefijo: "VES", tipico: null })).toEqual({ texto: "Ej. 110", origen: "referencia" });
    expect(sugerirLargo({ prefijo: "FAL", tipico: null })).toEqual({ texto: "Ej. 55", origen: "referencia" });
    expect(sugerirLargo({ prefijo: "ENT", tipico: null }).texto).toBe("Ej. 140");
    for (const prefijo of PREFIJOS.filter((p) => !(p in REFERENCIA_SIN_TIPICO))) {
      expect(sugerirLargo({ prefijo, tipico: null })).toEqual({ texto: "En cm", origen: "neutro" });
    }
  });

  it("sin categoría, un texto que no promete nada", () => {
    expect(sugerirLargo({ prefijo: null, tipico: null })).toEqual({ texto: "En cm", origen: "neutro" });
  });

  it("sigue a la prenda (A → B → A) y es estable", () => {
    const a = sugerirLargo({ prefijo: "VES", tipico: null });
    const b = sugerirLargo({ prefijo: "TOP", tipico: 45 });
    expect(a).not.toEqual(b);
    expect(sugerirLargo({ prefijo: "VES", tipico: null })).toEqual(a);
  });

  it("cabe a 375 px (cajas de 5 a 250 cm: el texto más largo es corto)", () => {
    for (const prefijo of PREFIJOS) for (const tipico of [null, 250]) expect(sugerirLargo({ prefijo, tipico }).texto.length).toBeLessThanOrEqual(16);
  });
});

