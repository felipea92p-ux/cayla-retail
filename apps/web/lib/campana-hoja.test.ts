import { describe, expect, it } from "vitest";
import { pasoDeDescuento, textoDuracion } from "./campana-hoja";
import { parsearDescuento } from "./etiqueta-campana";

describe("pasoDeDescuento (− y + de la hoja de campaña)", () => {
  it("sube y baja de 5 en 5", () => {
    expect(pasoDeDescuento("10", 5)).toBe("15");
    expect(pasoDeDescuento("15", -5)).toBe("10");
  });

  it("un decimal va al múltiplo de 5 más cercano en la dirección del toque", () => {
    expect(pasoDeDescuento("12.5", 5)).toBe("20");
    expect(pasoDeDescuento("12,5", -5)).toBe("10");
    expect(pasoDeDescuento("3", 5)).toBe("10");
  });

  it("vacío (sin descuento) sube a 5 y bajar de 5 vuelve a vacío", () => {
    expect(pasoDeDescuento("", 5)).toBe("5");
    expect(pasoDeDescuento("5", -5)).toBe("");
    expect(pasoDeDescuento("", -5)).toBe("");
  });

  it("no pasa de 100", () => {
    expect(pasoDeDescuento("100", 5)).toBe("100");
    expect(pasoDeDescuento("98", 5)).toBe("100");
  });

  it("lo mal escrito cuenta como cero", () => {
    expect(pasoDeDescuento("abc", 5)).toBe("5");
    expect(pasoDeDescuento("150", -5)).toBe("");
  });

  it("todo lo que devuelve se puede guardar (la misma regla que apaga «Guardar»)", () => {
    for (const texto of ["", "5", "12.5", "33", "97.5", "100", "abc", "-4"]) {
      for (const delta of [5, -5]) expect(parsearDescuento(pasoDeDescuento(texto, delta)).ok).toBe(true);
    }
  });
});

describe("textoDuracion (la temporada en una frase)", () => {
  it("cuenta las dos puntas y dice los días de la semana", () => {
    // El 1 de octubre de 2026 es jueves y el 25, domingo.
    expect(textoDuracion("2026-10-01", "2026-10-25")).toBe("25 días, de jueves a domingo");
  });

  it("un solo día", () => {
    expect(textoDuracion("2026-10-24", "2026-10-24")).toBe("1 día, el sábado");
  });

  it("cruza meses y años", () => {
    expect(textoDuracion("2026-12-26", "2027-01-02")).toBe("8 días, de sábado a sábado");
  });

  it("sin una fecha o con las fechas al revés no dice nada", () => {
    expect(textoDuracion(null, "2026-10-25")).toBeNull();
    expect(textoDuracion("2026-10-01", null)).toBeNull();
    expect(textoDuracion("2026-10-25", "2026-10-01")).toBeNull();
  });
});
