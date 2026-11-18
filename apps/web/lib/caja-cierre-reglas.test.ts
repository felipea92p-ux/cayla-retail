import { describe, it, expect } from "vitest";
import {
  diferenciaApertura,
  destinosDelCierre,
  etiquetaDestino,
  fondoTrasCierre,
  leerMonto,
  motivoAperturaValido,
  motivoTrasladoInvalido,
} from "./caja-cierre-reglas";

describe("leerMonto", () => {
  it("lee montos con coma de miles", () => {
    expect(leerMonto("1,950.50")).toBe(1950.5);
    expect(leerMonto(" 200 ")).toBe(200);
  });
  it("la coma decimal se entiende (ADR-0419, Felipe 2026-10-15): «1299,50» es 1 299.50, no 129 950", () => {
    expect(leerMonto("1299,50")).toBe(1299.5);
    expect(leerMonto("150,5")).toBe(150.5);
    expect(leerMonto("1.299,50")).toBe(1299.5);
  });
  it("lo que no se entiende no se adivina: «10.005» (céntimos de más) y «12.500» son null, como en el resto del ERP", () => {
    expect(leerMonto("10.005")).toBeNull();
    expect(leerMonto("12.500")).toBeNull();
  });
  it("vacío o ilegible es null, no cero", () => {
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
  });
});

describe("fondoTrasCierre", () => {
  it("es lo contado menos lo trasladado, sin arrastrar decimales de coma flotante", () => {
    expect(fondoTrasCierre(1950, 1750)).toBe(200);
    expect(fondoTrasCierre(0.3, 0.1)).toBe(0.2);
  });
});

describe("motivoTrasladoInvalido", () => {
  const base = { contado: 1950, trasladado: 0, destino: null, referencia: "" } as const;
  it("sin traslado siempre se puede cerrar", () => {
    expect(motivoTrasladoInvalido(base)).toBeNull();
  });
  it("no se traslada más de lo contado", () => {
    expect(motivoTrasladoInvalido({ ...base, trasladado: 2000, destino: "caja_fuerte" })).toMatch(/más de lo que contaste/);
  });
  it("con monto hace falta destino", () => {
    expect(motivoTrasladoInvalido({ ...base, trasladado: 100 })).toMatch(/Elige a dónde/);
  });
  it("solo el líder exige referencia; el n.º de operación del depósito es opcional", () => {
    expect(motivoTrasladoInvalido({ ...base, trasladado: 100, destino: "caja_fuerte" })).toBeNull();
    expect(motivoTrasladoInvalido({ ...base, trasladado: 100, destino: "banco", referencia: " " })).toBeNull();
    expect(motivoTrasladoInvalido({ ...base, trasladado: 100, destino: "lider", referencia: "" })).toMatch(/A quién/);
    expect(motivoTrasladoInvalido({ ...base, trasladado: 100, destino: "banco", referencia: "OP-1" })).toBeNull();
  });
});

describe("diferenciaApertura", () => {
  it("sin cierre anterior comparable no hay diferencia que explicar", () => {
    expect(diferenciaApertura(150, null)).toBeNull();
  });
  it("coincide dentro de un céntimo", () => {
    expect(diferenciaApertura(200, 200)).toBe(0);
    expect(diferenciaApertura(200.004, 200)).toBe(0);
  });
  it("devuelve el signo: negativo es faltante", () => {
    expect(diferenciaApertura(180, 200)).toBe(-20);
    expect(diferenciaApertura(205.5, 200)).toBe(5.5);
  });
});

describe("destinosDelCierre (ADR-0560, actividad 11)", () => {
  it("«Se queda con Claudia» solo se ofrece donde opera CLAURE; los demás destinos van siempre", () => {
    expect(destinosDelCierre(true).map((d) => d.valor)).toEqual(["caja_fuerte", "banco", "lider", "claudia"]);
    expect(destinosDelCierre(false).map((d) => d.valor)).toEqual(["caja_fuerte", "banco", "lider"]);
  });
  it("no pide referencia ni bloquea el cierre", () => {
    expect(motivoTrasladoInvalido({ contado: 300, trasladado: 100, destino: "claudia", referencia: "" })).toBeNull();
  });
});

describe("motivoAperturaValido y etiquetaDestino", () => {
  it("el motivo pide al menos 3 letras, como el candado de la base", () => {
    expect(motivoAperturaValido("  ok ")).toBe(false);
    expect(motivoAperturaValido("vuelto")).toBe(true);
  });
  it("etiqueta legible de cada destino", () => {
    expect(etiquetaDestino("banco")).toBe("Depósito bancario");
    expect(etiquetaDestino("claudia")).toBe("Se queda con Claudia");
    expect(etiquetaDestino("desconocido")).toBe("desconocido");
  });
});
