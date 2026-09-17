import { describe, it, expect } from "vitest";
import { parsearComprobante } from "./comprobantes-reglas";

// Buscar una venta por su boleta (2026-09-15): Devoluciones y Cambios solo mostraban las
// últimas 30 ventas de la sede — una devuelta de hace una semana no aparecía. Esto lee
// lo que la Encargada escribe a mano desde el papel impreso, en cualquier formato en que
// venga: con serie y ceros a la izquierda, con serie sin ceros, o solo el número.
describe("parsearComprobante — lo que se escribe a mano desde el papel impreso", () => {
  it("serie y número completos, con ceros a la izquierda", () => {
    expect(parsearComprobante("B001-000010")).toEqual({ serie: "B001", numero: 10 });
  });
  it("serie y número sin ceros a la izquierda", () => {
    expect(parsearComprobante("B001-10")).toEqual({ serie: "B001", numero: 10 });
  });
  it("minúsculas y espacio en vez de guion — igual de válido", () => {
    expect(parsearComprobante("b001 10")).toEqual({ serie: "B001", numero: 10 });
  });
  it("solo el número, sin serie — busca en cualquier tipo de comprobante", () => {
    expect(parsearComprobante("10")).toEqual({ serie: null, numero: 10 });
    expect(parsearComprobante("000010")).toEqual({ serie: null, numero: 10 });
  });
  it("espacios de sobra no rompen la lectura", () => {
    expect(parsearComprobante("  B001-000010  ")).toEqual({ serie: "B001", numero: 10 });
  });
  it("vacío o sin ningún número legible: nada que buscar", () => {
    expect(parsearComprobante("")).toEqual({ serie: null, numero: null });
    expect(parsearComprobante("   ")).toEqual({ serie: null, numero: null });
    expect(parsearComprobante("B001")).toEqual({ serie: null, numero: null });
    expect(parsearComprobante("boleta de ayer")).toEqual({ serie: null, numero: null });
  });
});
