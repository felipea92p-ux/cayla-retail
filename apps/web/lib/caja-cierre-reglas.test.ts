import { describe, it, expect } from "vitest";
import {
  diferenciaApertura,
  etiquetaDestino,
  fondoTrasCierre,
  leerMonto,
  motivoAperturaValido,
  motivoTrasladoInvalido,
} from "./caja-cierre-reglas";

describe("leerMonto", () => {
  it("lee montos con coma de miles y redondea a céntimos", () => {
    expect(leerMonto("1,950.50")).toBe(1950.5);
    expect(leerMonto(" 200 ")).toBe(200);
    expect(leerMonto("10.005")).toBe(10.01);
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

describe("motivoAperturaValido y etiquetaDestino", () => {
  it("el motivo pide al menos 3 letras, como el candado de la base", () => {
    expect(motivoAperturaValido("  ok ")).toBe(false);
    expect(motivoAperturaValido("vuelto")).toBe(true);
  });
  it("etiqueta legible de cada destino", () => {
    expect(etiquetaDestino("banco")).toBe("Depósito bancario");
    expect(etiquetaDestino("desconocido")).toBe("desconocido");
  });
});
