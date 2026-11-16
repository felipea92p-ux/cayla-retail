import { describe, it, expect } from "vitest";
import { comprasDeLosCambios, parsearComprobante } from "./comprobantes-reglas";

describe("comprasDeLosCambios (ADR-0672)", () => {
  const numeros = new Map([["orig", "B001-000012"]]);

  it("la nota y la boleta nueva de un cambio dicen qué compra se cambió (la boleta la toma de su nota hermana)", () => {
    const r = comprasDeLosCambios(
      [
        { id: "nc", tipo: "nota_credito", cambio_id: "k1", comprobante_original_id: "orig" },
        { id: "bol", tipo: "boleta", cambio_id: "k1", comprobante_original_id: null },
      ],
      numeros,
    );
    expect(r.get("nc")).toEqual({ compra: "B001-000012" });
    expect(r.get("bol")).toEqual({ compra: "B001-000012" });
  });

  it("un comprobante sin cambio no entra; sin la nota o sin su número, el vínculo va sin número", () => {
    const r = comprasDeLosCambios(
      [
        { id: "venta", tipo: "boleta", cambio_id: null, comprobante_original_id: null },
        { id: "sola", tipo: "boleta", cambio_id: "k2", comprobante_original_id: null },
        { id: "nc3", tipo: "nota_credito", cambio_id: "k3", comprobante_original_id: "otro-mes" },
      ],
      numeros,
    );
    expect(r.has("venta")).toBe(false);
    expect(r.get("sola")).toEqual({ compra: null });
    expect(r.get("nc3")).toEqual({ compra: null });
  });
});

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

// /chaos 2026-10-13: «B001-12345678901» tumbaba la búsqueda (`comprobantes.numero` es integer y la consulta reventaba).
describe("parsearComprobante — un número de más de 9 dígitos no es un comprobante", () => {
  it("con serie o solo, más de 9 dígitos no dan número; 9 sí; los ceros de adelante no cuentan", () => {
    expect(parsearComprobante("B001-12345678901")).toEqual({ serie: "B001", numero: null });
    expect(parsearComprobante("12345678901")).toEqual({ serie: null, numero: null });
    expect(parsearComprobante("B001-123456789")).toEqual({ serie: "B001", numero: 123456789 });
    expect(parsearComprobante("B001-0000000010")).toEqual({ serie: "B001", numero: 10 });
  });
});
