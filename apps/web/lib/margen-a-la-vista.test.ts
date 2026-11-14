import { describe, expect, it } from "vitest";
import { margenALaVista, montoEscrito } from "./margen-a-la-vista";

describe("margenALaVista: cuánto se gana por prenda", () => {
  it("en soles y en % sobre el precio", () => {
    expect(margenALaVista("36", "70")).toMatchObject({ ganancia: 34, tono: "normal", enSoles: "Ganas S/\u00a034", texto: "Ganas S/\u00a034 · 49\u00a0%" });
  });
  it("bajo 30 % pasa a «bajo» (ámbar)", () => {
    expect(margenALaVista(45, 59.9)).toMatchObject({ tono: "bajo", texto: "Ganas S/\u00a014.90 · 25\u00a0%" });
  });
  it("justo en 30 % es normal; en S/ 0 es bajo; bajo el costo, «pierdes» (rojo)", () => {
    expect(margenALaVista(70, 100)?.tono).toBe("normal");
    expect(margenALaVista(50, 50)).toMatchObject({ tono: "bajo", texto: "Ganas S/\u00a00 · 0\u00a0%" });
    expect(margenALaVista(56, 50)).toMatchObject({ ganancia: -6, tono: "pierdes", texto: "Pierdes S/\u00a06 · \u221212\u00a0%" });
  });
  it("sin costo, sin precio, o con un costo de regalo, no hay línea", () => {
    expect(margenALaVista("", "59.90")).toBeNull();
    expect(margenALaVista("30", "")).toBeNull();
    expect(margenALaVista(0, 59.9)).toBeNull();
    expect(margenALaVista("abc", "59.90")).toBeNull();
    expect(margenALaVista(null, undefined)).toBeNull();
  });
  it("cambia en vivo con cada precio que se escribe", () => {
    const tonos = ["5", "59", "59.9"].map((p) => margenALaVista("45", p)?.tono);
    expect(tonos).toEqual(["pierdes", "bajo", "bajo"]);
    expect(margenALaVista("45", "99")?.tono).toBe("normal");
  });
});

describe("montoEscrito", () => {
  it("lee lo que se escribe o se pega", () => {
    expect(montoEscrito("59,90")).toBe(59.9);
    expect(montoEscrito("S/ 59")).toBe(59);
    expect(montoEscrito(" 12.5 ")).toBe(12.5);
    expect(montoEscrito("12.")).toBeNull();
    expect(montoEscrito("")).toBeNull();
  });
});
