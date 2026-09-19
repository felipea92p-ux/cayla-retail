import { describe, it, expect } from "vitest";
import { objecionVigencia, parsearDescuento, parsearFecha, prendasBajoCosto, type PrendaConCosto } from "./etiqueta-campana";

describe("parsearDescuento", () => {
  it.each([
    ["20", 20],
    ["12,5", 12.5],
    ["12.5", 12.5],
    ["20 %", 20],
    [" 100 ", 100],
    ["0,5", 0.5],
  ])("%j → %d", (entrada, esperado) => {
    expect(parsearDescuento(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it("vacío = sin descuento (etiqueta informativa)", () => {
    expect(parsearDescuento("")).toEqual({ ok: true, valor: null });
    expect(parsearDescuento("  %  ")).toEqual({ ok: true, valor: null });
  });

  it.each(["0", "0,00", "101", "100,01", "-5", "veinte", "12,555", "1e2"])("rechaza %j", (entrada) => {
    expect(parsearDescuento(entrada).ok).toBe(false);
  });
});

describe("parsearFecha", () => {
  it("acepta una fecha real y el vacío", () => {
    expect(parsearFecha("2026-11-09")).toEqual({ ok: true, valor: "2026-11-09" });
    expect(parsearFecha("")).toEqual({ ok: true, valor: null });
  });
  it.each(["2026-02-31", "09/11/2026", "2026-13-01", "mañana"])("rechaza %j", (entrada) => {
    expect(parsearFecha(entrada).ok).toBe(false);
  });
});

describe("objecionVigencia", () => {
  it("solo objeta cuando el inicio es posterior al fin", () => {
    expect(objecionVigencia("2026-12-01", "2026-11-01")).not.toBeNull();
    expect(objecionVigencia("2026-11-01", "2026-11-01")).toBeNull();
    expect(objecionVigencia(null, "2026-11-01")).toBeNull();
    expect(objecionVigencia("2026-11-01", null)).toBeNull();
  });
});

describe("prendasBajoCosto — el aviso al configurar una campaña", () => {
  const prenda = (id: string, categoriaId: string | null, precio: number, costo: number): PrendaConCosto => ({ id, categoriaId, precio, costo, nombre: id });
  const prendas = [prenda("jean", "c-jeans", 100, 40), prenda("polo", "c-polos", 50, 45), prenda("collar", "c-collares", 30, 10)];

  it("sin descuento no hay nada que avisar", () => {
    expect(prendasBajoCosto(null, prendas, new Set(["c-jeans", "c-polos"]), new Set())).toEqual([]);
  });
  it("un 20 % en jeans y polos deja el polo (50 → 40) por debajo de su costo (45)", () => {
    expect(prendasBajoCosto(20, prendas, new Set(["c-jeans", "c-polos"]), new Set()).map((p) => p.id)).toEqual(["polo"]);
  });
  it("solo cuenta lo que la campaña alcanza: el collar no está en las categorías", () => {
    expect(prendasBajoCosto(90, prendas, new Set(["c-polos"]), new Set()).map((p) => p.id)).toEqual(["polo"]);
  });
  it("las prendas etiquetadas a mano cuentan aunque su categoría no esté elegida", () => {
    expect(prendasBajoCosto(90, prendas, new Set(), new Set(["collar"])).map((p) => p.id)).toEqual(["collar"]);
  });
  it("quedar EXACTO en el costo no es estar por debajo", () => {
    expect(prendasBajoCosto(10, [prenda("x", "c", 100, 90)], new Set(["c"]), new Set())).toEqual([]);
  });
  it("sin categorías ni prendas a mano, el alcance es vacío", () => {
    expect(prendasBajoCosto(99, prendas, new Set(), new Set())).toEqual([]);
  });
});
