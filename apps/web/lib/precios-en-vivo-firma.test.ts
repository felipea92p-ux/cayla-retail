import { describe, expect, it } from "vitest";
import { cambioLaFirma, escribiendoEn, firmaDePrecios } from "./precios-en-vivo-firma";
import { hayPreciosPropios, registrarPreciosPropios } from "./precios-en-vivo-registro";

const verano = { variante_id: "a", etiqueta_id: "e1", descuento_pct: "20.00" };

describe("firmaDePrecios (Felipe 2026-10-08: todo lo que muestra precios se pone al día)", () => {
  it("cambiar un precio sube la versión: la firma cambia", () => {
    expect(cambioLaFirma(firmaDePrecios(10, [])!, firmaDePrecios(11, [])!)).toBe(true);
  });
  it("quitar una etiqueta de descuento no sube la versión, pero la firma cambia igual", () => {
    expect(cambioLaFirma(firmaDePrecios(10, [verano])!, firmaDePrecios(10, [])!)).toBe(true);
  });
  it("el orden en que llegan las campañas y cómo viene el % no cuentan como cambio", () => {
    const b = { variante_id: "b", etiqueta_id: "e1", descuento_pct: 20 };
    expect(cambioLaFirma(firmaDePrecios(10, [verano, b])!, firmaDePrecios(10, [b, { ...verano, descuento_pct: 20 }])!)).toBe(false);
  });
  it("una lectura que falló no se toma por un cambio", () => {
    expect(cambioLaFirma(firmaDePrecios(10, [verano])!, firmaDePrecios(10, null)!)).toBe(false);
    expect(cambioLaFirma(firmaDePrecios(10, [verano])!, firmaDePrecios(null, [verano])!)).toBe(false);
    expect(firmaDePrecios(null, null)).toBeNull();
  });
  it("con una parte desconocida, la otra sigue avisando", () => {
    expect(cambioLaFirma(firmaDePrecios(10, null)!, firmaDePrecios(11, [verano])!)).toBe(true);
  });
});

describe("escribiendoEn: el refresco espera a quien escribe", () => {
  const el = (tagName: string, attrs: Record<string, string> = {}) => ({ tagName, getAttribute: (n: string) => attrs[n] ?? null }) as unknown as Element;
  it("campos de texto, sí", () => {
    expect(escribiendoEn(el("INPUT"))).toBe(true);
    expect(escribiendoEn(el("INPUT", { type: "number" }))).toBe(true);
    expect(escribiendoEn(el("TEXTAREA"))).toBe(true);
    expect(escribiendoEn(el("DIV", { contenteditable: "true" }))).toBe(true);
  });
  it("botones, casillas o nada, no", () => {
    expect(escribiendoEn(el("BUTTON"))).toBe(false);
    expect(escribiendoEn(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(escribiendoEn(null)).toBe(false);
  });
});

describe("registrarPreciosPropios", () => {
  it("mientras una pantalla relee por su cuenta, el refresco general se aparta; borrar dos veces no descuenta de más", () => {
    expect(hayPreciosPropios()).toBe(false);
    const borrar = registrarPreciosPropios();
    expect(hayPreciosPropios()).toBe(true);
    borrar();
    borrar();
    expect(hayPreciosPropios()).toBe(false);
  });
});
