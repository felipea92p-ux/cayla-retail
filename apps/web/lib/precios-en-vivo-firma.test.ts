import { describe, expect, it } from "vitest";
import { cambioLaFirma, escribiendoEn, firmaConCampanasDeLaBase, firmaDePrecios } from "./precios-en-vivo-firma";
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

describe("firmaConCampanasDeLaBase (2026-10-30: la base firma las campañas y el sondeo ya no baja la lista)", () => {
  const md5A = "0cc175b9c0f1b6a831c399e269772661";
  const md5B = "92eb5ffee6ae2fec3ad71c777531578f";
  it("otra firma de campañas de la base es un cambio; la misma, no", () => {
    expect(cambioLaFirma(firmaConCampanasDeLaBase(10, md5A)!, firmaConCampanasDeLaBase(10, md5B)!)).toBe(true);
    expect(cambioLaFirma(firmaConCampanasDeLaBase(10, md5A)!, firmaConCampanasDeLaBase(10, md5A)!)).toBe(false);
  });
  it("subir la versión del catálogo sigue avisando", () => {
    expect(cambioLaFirma(firmaConCampanasDeLaBase(10, md5A)!, firmaConCampanasDeLaBase(11, md5A)!)).toBe(true);
  });
  it("pasar de la firma armada con la lista a la de la base (o al revés) no se toma por un cambio", () => {
    expect(cambioLaFirma(firmaDePrecios(10, [verano])!, firmaConCampanasDeLaBase(10, md5A)!)).toBe(false);
    expect(cambioLaFirma(firmaConCampanasDeLaBase(10, md5A)!, firmaDePrecios(10, [])!)).toBe(false);
    // …pero la versión del catálogo se sigue comparando entre las dos formas.
    expect(cambioLaFirma(firmaDePrecios(10, [verano])!, firmaConCampanasDeLaBase(11, md5A)!)).toBe(true);
  });
  it("una lectura que falló no se toma por un cambio", () => {
    expect(cambioLaFirma(firmaConCampanasDeLaBase(10, md5A)!, firmaConCampanasDeLaBase(10, null)!)).toBe(false);
    expect(firmaConCampanasDeLaBase(null, null)).toBeNull();
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
