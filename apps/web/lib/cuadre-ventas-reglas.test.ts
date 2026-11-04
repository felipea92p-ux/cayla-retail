import { describe, expect, it } from "vitest";
import { cuadroVentas, leerSedeCuadre, type SedeCuadre } from "./cuadre-ventas-reglas";
import { SEDE_EMPRESA, SEDE_TODAS } from "./finanzas-telar-reglas";

const sede = (p: Partial<SedeCuadre>): SedeCuadre => ({ ubicacionId: "u1", nombre: "Tienda A", vendido: 0, igv: 0, anulaciones: 0, devoluciones: 0, cambios: 0, claure: 0, otras: 0, ventasNetas: 0, ...p });
const A = sede({ vendido: 44203.03, igv: -6742.96, devoluciones: -25.34, cambios: 76.1, ventasNetas: 37510.83 });
const B = sede({ ubicacionId: "u2", nombre: "Tienda B", vendido: 1752, igv: -267.26, claure: -472.88, ventasNetas: 1011.86 });

describe("De Ventas a Finanzas (ADR-0609)", () => {
  it("lee los números de la base, también si vienen como texto", () => {
    expect(leerSedeCuadre({ ubicacion_id: "u", nombre: "X", vendido: "118.00", anulaciones_otro_mes: "-100.00", ventas_netas: "18" })).toMatchObject({ vendido: 118, anulaciones: -100, ventasNetas: 18 });
  });
  it("todas las sedes: una columna por sede y su total, en céntimos exactos", () => {
    const c = cuadroVentas([A, B], SEDE_TODAS)!;
    expect(c.columnas).toEqual(["Tienda A", "Tienda B"]);
    expect(c.conTotal).toBe(true);
    expect(c.filas.find((f) => f.clave === "vendido")!.total).toBe(45955.03);
    expect(c.filas.find((f) => f.clave === "ventasNetas")!.total).toBe(38522.69);
  });
  it("cada columna y el total suman lo que dicen", () => {
    const c = cuadroVentas([A, B], SEDE_TODAS)!;
    const final = c.filas.find((f) => f.clave === "ventasNetas")!;
    const partes = c.filas.filter((f) => f.clave !== "ventasNetas");
    final.montos.forEach((m, i) => expect(Math.round(partes.reduce((t, f) => t + f.montos[i]!, 0) * 100) / 100).toBe(m));
    expect(Math.round(partes.reduce((t, f) => t + f.total, 0) * 100) / 100).toBe(final.total);
  });
  it("una sede: solo esa, sin total", () => {
    const c = cuadroVentas([A, B], "u2")!;
    expect(c.columnas).toEqual(["Tienda B"]);
    expect(c.conTotal).toBe(false);
  });
  it("esconde lo que no aporta, nunca el principio ni el final", () => {
    const claves = cuadroVentas([A], SEDE_TODAS)!.filas.map((f) => f.clave);
    expect(claves).toEqual(["vendido", "igv", "devoluciones", "cambios", "ventasNetas"]);
  });
  it("«Sin explicar» solo sale si hay algo, y se reporta", () => {
    expect(cuadroVentas([A], SEDE_TODAS)!.sinExplicar).toBe(0);
    const c = cuadroVentas([sede({ vendido: 100, otras: 3.5, ventasNetas: 103.5 })], SEDE_TODAS)!;
    expect(c.sinExplicar).toBe(3.5);
    expect(c.filas.map((f) => f.clave)).toContain("otras");
  });
  it("sin nada que comparar no hay cuadro; «De la empresa» no vende", () => {
    expect(cuadroVentas([], SEDE_TODAS)).toBeNull();
    expect(cuadroVentas([A], "otra-sede")).toBeNull();
    expect(cuadroVentas([A], SEDE_EMPRESA)).toBeNull();
    expect(cuadroVentas([sede({})], SEDE_TODAS)).toBeNull();
  });
});
