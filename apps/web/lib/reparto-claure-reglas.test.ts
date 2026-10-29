import { describe, expect, it } from "vitest";
import { etiquetaReparto, leerReparto, textoPct, validarPct } from "./reparto-claure-reglas";

describe("leerReparto", () => {
  it("lee lo que devuelve la base (los números llegan como texto) y respeta lo que no se cambió nunca", () => {
    const filas = leerReparto([
      { categoria: "luz", nombre: "Luz", ejemplos: "Recibo de luz", pct_claure: "50.00", actualizado_en: "2026-10-29T10:00:00Z" },
      { categoria: "software", nombre: "Software y suscripciones", ejemplos: "", pct_claure: 0, actualizado_en: null },
    ]);
    expect(filas).toEqual([
      { categoria: "luz", nombre: "Luz", ejemplos: "Recibo de luz", pct: 50, actualizadoEn: "2026-10-29T10:00:00Z" },
      { categoria: "software", nombre: "Software y suscripciones", ejemplos: "", pct: 0, actualizadoEn: null },
    ]);
  });
  it("lo que no es una lista (una base más vieja o una falla) no inventa filas", () => {
    expect(leerReparto(null)).toEqual([]);
    expect(leerReparto({})).toEqual([]);
  });
});

describe("validarPct", () => {
  it("acepta de 0 a 100 con coma, punto o el signo %, y redondea a dos decimales", () => {
    expect(validarPct("50")).toEqual({ ok: true, valor: 50 });
    expect(validarPct(" 12,5 % ")).toEqual({ ok: true, valor: 12.5 });
    expect(validarPct("0")).toEqual({ ok: true, valor: 0 });
    expect(validarPct("100")).toEqual({ ok: true, valor: 100 });
    expect(validarPct("33.33")).toEqual({ ok: true, valor: 33.33 });
  });
  it("rechaza lo vacío, lo que no es número y lo fuera de rango, con las palabras de la base", () => {
    for (const mal of ["", "  ", "abc", "-5", "1e2", "12.345", "5,5,5"]) expect(validarPct(mal).ok, mal).toBe(false);
    expect(validarPct("101")).toEqual({ ok: false, error: "La parte de CLAURE va de 0 % a 100 %." });
  });
});

describe("etiquetaReparto y textoPct", () => {
  it("dice qué significa cada porcentaje", () => {
    expect(etiquetaReparto(0)).toBe("Todo de CAYLA");
    expect(etiquetaReparto(100)).toBe("Todo de CLAURE");
    expect(etiquetaReparto(50)).toBe("Mitad y mitad");
    expect(etiquetaReparto(30)).toBe("30 % de CLAURE y el resto de CAYLA");
  });
  it("la casilla no lleva ceros de más", () => {
    expect(textoPct(50)).toBe("50");
    expect(textoPct(12.5)).toBe("12.5");
    expect(textoPct(33.333)).toBe("33.33");
  });
});
