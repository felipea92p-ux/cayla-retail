import { describe, expect, it } from "vitest";
import { alcanceConEmpresa, claveDeEmpresaEnUrl, empresaDeUrl, empresasParaElegir } from "./reportes-empresa-reglas";

const CAYLA = { id: "ca71a000-0000-4000-8000-000000000001", clave: "cayla", nombre: "CAYLA" };
const CLAURE = { id: "c1a07e00-0000-4000-8000-000000000002", clave: "claure", nombre: "CLAURE" };

describe("empresasParaElegir: solo donde conviven dos", () => {
  it("con dos empresas (Lima) se ofrecen las dos", () => {
    expect(empresasParaElegir([CAYLA, CLAURE])).toEqual([CAYLA, CLAURE]);
  });
  it("con una (Trujillo, Arequipa) o ninguna no hay nada que elegir", () => {
    expect(empresasParaElegir([CAYLA])).toBeNull();
    expect(empresasParaElegir([])).toBeNull();
  });
  it("si la base no respondió (null), el filtro no se dibuja y el reporte sale como siempre", () => {
    expect(empresasParaElegir(null)).toBeNull();
  });
});

describe("empresaDeUrl: la URL no elige lo que no se ofrece", () => {
  const ofrecidas = [CAYLA, CLAURE];
  it("la clave de una empresa que se ofrece vale, sin importar mayúsculas ni espacios", () => {
    expect(empresaDeUrl("claure", ofrecidas)).toEqual(CLAURE);
    expect(empresaDeUrl(" CAYLA ", ofrecidas)).toEqual(CAYLA);
  });
  it("una clave que no existe, vacía o rara se ignora (se lee todo)", () => {
    for (const mala of ["otra", "", "  ", "claure; drop table", "c1a07e00-0000-4000-8000-000000000002", "x".repeat(40)]) {
      expect(empresaDeUrl(mala, ofrecidas)).toBeNull();
    }
    expect(empresaDeUrl(undefined, ofrecidas)).toBeNull();
    expect(empresaDeUrl(null, ofrecidas)).toBeNull();
  });
  it("si no se ofrece nada (otra tienda, «todas las tiendas»), ?emp=claure se ignora: no estrecha lo que se ve ni hace fallar la base", () => {
    expect(empresaDeUrl("claure", null)).toBeNull();
  });
  it("una lista de valores toma el primero", () => {
    expect(empresaDeUrl(["claure", "cayla"], ofrecidas)).toEqual(CLAURE);
  });
});

describe("claveDeEmpresaEnUrl: solo la forma", () => {
  it("una clave corta en minúsculas vale; todo lo demás es ninguna", () => {
    expect(claveDeEmpresaEnUrl("Claure")).toBe("claure");
    expect(claveDeEmpresaEnUrl("")).toBeNull();
    expect(claveDeEmpresaEnUrl("a b")).toBeNull();
    expect(claveDeEmpresaEnUrl(undefined)).toBeNull();
  });
});

describe("alcanceConEmpresa", () => {
  it("el alcance de un archivo dice la tienda y, si hay, la empresa", () => {
    expect(alcanceConEmpresa("Tienda Lima", CLAURE)).toBe("Tienda Lima · CLAURE");
    expect(alcanceConEmpresa("Tienda Lima", null)).toBe("Tienda Lima");
  });
});
