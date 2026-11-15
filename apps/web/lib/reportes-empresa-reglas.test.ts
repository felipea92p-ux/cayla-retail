import { describe, expect, it } from "vitest";
import { AYUDA_DEL_REPARTO, alcanceConEmpresa, claveDeEmpresaEnUrl, empresaDeUrl, empresasParaElegir, leerPagosDeEmpresa, lineaDelReparto } from "./reportes-empresa-reglas";

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

describe("leerPagosDeEmpresa: lo que devuelve fn_reporte_ventas_pagos (ADR-0665, act. 2026-11-15)", () => {
  it("lee los medios y lo repartido, con los números que llegan como texto", () => {
    expect(
      leerPagosDeEmpresa({ mes: "2026-11-01", pagos: [{ metodo: "efectivo", monto: "43.33" }, { metodo: "yape", monto: 71.67 }], repartido: { ventas: 1, monto: "25" } }),
    ).toEqual({ pagos: [{ metodo: "efectivo", monto: 43.33 }, { metodo: "yape", monto: 71.67 }], repartido: { ventas: 1, monto: 25 } });
  });
  it("un medio roto no entra y un monto que no es número vale 0; sin «repartido», nada repartido", () => {
    expect(leerPagosDeEmpresa({ pagos: [{ metodo: "", monto: 5 }, null, { metodo: "tarjeta", monto: "abc" }] })).toEqual({
      pagos: [{ metodo: "tarjeta", monto: 0 }],
      repartido: { ventas: 0, monto: 0 },
    });
  });
  it("sin la lista de pagos, la forma no se entiende", () => {
    expect(leerPagosDeEmpresa(null)).toBeNull();
    expect(leerPagosDeEmpresa({ pagos: "x" })).toBeNull();
    expect(leerPagosDeEmpresa([])).toBeNull();
  });
});

describe("lineaDelReparto: la línea bajo «Cómo se pagó» solo cuando algo se repartió", () => {
  // `soles()` escribe «S/» con un espacio que no se parte (ADR-0413): se compara con espacios comunes.
  const plano = (t: string | null) => t?.replace(/\u00a0/g, " ") ?? null;
  it("una o varias ventas mixtas, con su monto", () => {
    expect(plano(lineaDelReparto({ ventas: 1, monto: 40 }))).toBe("Incluye S/ 40 repartidos de 1 venta mixta");
    expect(plano(lineaDelReparto({ ventas: 3, monto: 1250.4 }))).toBe("Incluye S/ 1,250 repartidos de 3 ventas mixtas");
  });
  it("sin ventas repartidas, o con lo de la empresa en cero, no hay línea", () => {
    expect(lineaDelReparto({ ventas: 0, monto: 0 })).toBeNull();
    expect(lineaDelReparto({ ventas: 2, monto: 0 })).toBeNull();
  });
  it("la línea cabe en ocho palabras y lo que explica va detrás del «?» (regla «Poco texto a la vista»)", () => {
    expect(plano(lineaDelReparto({ ventas: 1, monto: 40 }))!.split(" ").length).toBeLessThanOrEqual(8);
    expect(AYUDA_DEL_REPARTO).toMatch(/CAYLA y de CLAURE/);
  });
});
