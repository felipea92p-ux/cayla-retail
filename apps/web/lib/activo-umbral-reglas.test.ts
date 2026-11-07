import { describe, expect, it } from "vitest";
import { FRACCION_UIT_ACTIVO, sePuedeLlevarAGasto, umbralDeActivo } from "./activo-umbral-reglas";
import type { ParametroFila } from "./impuestos-reglas";

const uit = (vigenteDesde: string, valor: number | null): ParametroFila => ({
  nombre: "uit",
  vigenteDesde,
  valor,
  texto: null,
  nota: null,
  provisional: false,
  registradoPor: null,
} as ParametroFila);

describe("umbral para ser activo fijo: ¼ de la UIT vigente (ADR-0594)", () => {
  it("con la UIT de 2026 (S/ 5,500) el umbral es S/ 1,375", () => {
    expect(FRACCION_UIT_ACTIVO).toBe(0.25);
    expect(umbralDeActivo([uit("2026-01-01", 5500)], 2026)).toEqual({ soles: 1375, uit: 5500 });
  });

  it("se actualiza solo con la UIT: cada año usa la suya, y un año sin UIT propia usa la última de antes", () => {
    const todas = [uit("2025-01-01", 5350), uit("2026-01-01", 5500)];
    expect(umbralDeActivo(todas, 2025)?.soles).toBe(1337.5);
    expect(umbralDeActivo(todas, 2026)?.soles).toBe(1375);
    expect(umbralDeActivo(todas, 2027)?.soles).toBe(1375);
  });

  it("sin UIT cargada, o con una ilegible, no hay umbral (y no se inventa uno)", () => {
    expect(umbralDeActivo([], 2026)).toBeNull();
    expect(umbralDeActivo([uit("2026-01-01", null)], 2026)).toBeNull();
    expect(umbralDeActivo([uit("2026-01-01", 0)], 2026)).toBeNull();
    expect(umbralDeActivo([uit("2026-01-01", Number.NaN)], 2026)).toBeNull();
    // una UIT de un año posterior no rige hacia atrás
    expect(umbralDeActivo([uit("2027-01-01", 5600)], 2026)).toBeNull();
  });

  it("redondea al céntimo", () => {
    expect(umbralDeActivo([uit("2026-01-01", 5351)], 2026)?.soles).toBe(1337.75);
    expect(umbralDeActivo([uit("2026-01-01", 5333)], 2026)?.soles).toBe(1333.25);
  });
});

describe("¿se puede llevar a gasto?", () => {
  it("«hasta ¼ UIT» incluye el tope: S/ 1,375 ya avisa, S/ 1,375.01 no", () => {
    expect(sePuedeLlevarAGasto(1375, 1375)).toBe(true);
    expect(sePuedeLlevarAGasto(1375.01, 1375)).toBe(false);
  });

  it("la remalladora de S/ 1,337.70 y el parlante de S/ 959 avisan; una máquina de S/ 2,800 no", () => {
    expect(sePuedeLlevarAGasto(1337.7, 1375)).toBe(true);
    expect(sePuedeLlevarAGasto(959, 1375)).toBe(true);
    expect(sePuedeLlevarAGasto(2800, 1375)).toBe(false);
  });

  it("sin umbral, o con un costo vacío, cero, negativo o ilegible, no avisa nada", () => {
    expect(sePuedeLlevarAGasto(300, null)).toBe(false);
    expect(sePuedeLlevarAGasto(0, 1375)).toBe(false);
    expect(sePuedeLlevarAGasto(-5, 1375)).toBe(false);
    expect(sePuedeLlevarAGasto(Number.NaN, 1375)).toBe(false);
  });

  it("no se cuela un céntimo por coma flotante", () => {
    expect(sePuedeLlevarAGasto(0.1 + 0.2 + 1374.7, 1375)).toBe(true);
  });
});
