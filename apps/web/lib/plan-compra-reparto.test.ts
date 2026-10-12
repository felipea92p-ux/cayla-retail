import { describe, expect, it } from "vitest";
import { fraseDeLosMinimos, porcentajes, problemasDeLosMinimos, repartir, type TiendaReparto } from "./plan-compra-reparto";

const t = (id: string, u90: number, dias90: number, stock: number, minimo: number | null = null): TiendaReparto => ({ id, nombre: id, u90, dias90, stock, minimo });

describe("los porcentajes de cada tienda", () => {
  it("según su ritmo de venta, no su total: la que abrió después no queda castigada", () => {
    // TRU vendió 70 en 90 días; AQP 30 en 30 días (el mismo ritmo por día que 90 en 90).
    const p = porcentajes([t("TRU", 70, 90, 0), t("AQP", 30, 30, 0)]);
    expect(Math.round(p.get("TRU")!.pct * 100)).toBe(44);
    expect(Math.round(p.get("AQP")!.pct * 100)).toBe(56);
  });
  it("una tienda sin ventas con mínimo recibe su mínimo; el resto se reparte entre las demás por ritmo", () => {
    const p = porcentajes([t("TRU", 70, 90, 0), t("AQP", 30, 90, 0), t("LIM", 0, 0, 0, 0.1)]);
    expect([p.get("TRU")!.pct, p.get("AQP")!.pct, p.get("LIM")!.pct].map((x) => Math.round(x * 100))).toEqual([63, 27, 10]);
    expect(p.get("LIM")!.porMinimo).toBe(true);
  });
  it("un mínimo que la tienda ya supera por sus ventas no cambia nada", () => {
    const p = porcentajes([t("TRU", 50, 90, 0, 0.1), t("AQP", 50, 90, 0)]);
    expect(p.get("TRU")).toEqual({ pct: 0.5, porMinimo: false });
  });
  it("sin una sola venta, partes iguales; el mínimo es un piso, no un techo", () => {
    const p = porcentajes([t("TRU", 0, 0, 0), t("AQP", 0, 0, 0), t("LIM", 0, 0, 0, 0.2)]);
    expect([p.get("TRU")!.pct, p.get("AQP")!.pct, p.get("LIM")!.pct].map((x) => Math.round(x * 100))).toEqual([33, 33, 33]);
    const alto = porcentajes([t("TRU", 0, 0, 0), t("AQP", 0, 0, 0), t("LIM", 0, 0, 0, 0.5)]);
    expect([alto.get("TRU")!.pct, alto.get("AQP")!.pct, alto.get("LIM")!.pct]).toEqual([0.25, 0.25, 0.5]);
  });
  it("siempre suman 100 %", () => {
    const p = porcentajes([t("A", 13, 77, 0, 0.3), t("B", 2, 90, 0, 0.25), t("C", 90, 90, 0)]);
    expect([...p.values()].reduce((a, x) => a + x.pct, 0)).toBeCloseTo(1);
  });
});

describe("los mínimos que fija un líder", () => {
  it("de 1 a 90, en blanco = sin mínimo, y la suma no pasa de 100", () => {
    expect(problemasDeLosMinimos({ lim: "10", aqp: "" })).toEqual({ porTienda: {}, suma: null });
    expect(problemasDeLosMinimos({ lim: "0", aqp: "95" }).porTienda).toEqual({ lim: "De 1 a 90 %, o en blanco para no fijar mínimo.", aqp: "De 1 a 90 %, o en blanco para no fijar mínimo." });
    expect(problemasDeLosMinimos({ lim: "60", aqp: "50" }).suma).toBe("Los mínimos suman 110 %: no pueden pasar de 100 %.");
  });
  it("se dicen en una línea", () => {
    expect(fraseDeLosMinimos([{ id: "lim", nombre: "Tienda LIM" }, { id: "aqp", nombre: "Tienda AQP" }], new Map([["lim", 0.1]]))).toBe("Tienda LIM 10 %");
    expect(fraseDeLosMinimos([{ id: "lim", nombre: "Tienda LIM" }], new Map())).toBeNull();
  });
});

describe("el reparto de una categoría", () => {
  it("lo que le toca suma exacto el objetivo; manda lo que falta y dice lo que sobra", () => {
    // El ejemplo de la conversación: objetivo 200, TRU 70 % / AQP 25 % / LIM 5 % por ventas; TRU ya tiene 232, AQP 39, LIM 0.
    const r = repartir(200, [t("TRU", 70, 90, 232), t("AQP", 25, 90, 39), t("LIM", 5, 90, 0)]);
    expect(r.filas.map((f) => [f.id, f.leToca, f.falta, f.sobra])).toEqual([
      ["TRU", 140, 0, 92],
      ["AQP", 50, 11, 0],
      ["LIM", 10, 10, 0],
    ]);
    expect([r.falta, r.sobra]).toEqual([21, 92]);
  });
  it("redondea sin perder ni sumar una prenda", () => {
    const r = repartir(10, [t("A", 1, 90, 0), t("B", 1, 90, 0), t("C", 1, 90, 0)]);
    expect(r.filas.reduce((a, f) => a + f.leToca, 0)).toBe(10);
  });
});
