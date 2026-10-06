import { describe, expect, it } from "vitest";
import { hrefComprar, hrefComprarTodas, hrefEnviar, hrefLiquidar, hrefReponerPiso, lineasParaPedir } from "./analisis-acciones";

// Datos inventados para la prueba.
const todo = { produccion: true, compras: true, traslados: true, etiquetas: true, existencias: true };

describe("a dónde lleva cada botón (ADR-0245: abre el flujo que ya existe)", () => {
  it("Comprar: del Taller, una orden con el modelo; de terceros, la compra con su proveedor", () => {
    expect(hrefComprar({ origen: "taller", productoId: "p 1", proveedorId: null }, todo)).toBe("/produccion/ordenes?nueva=p%201");
    expect(hrefComprar({ origen: "terceros", productoId: "p1", proveedorId: "prov" }, todo)).toBe("/compras/nueva?prov=prov");
    expect(hrefComprar({ origen: null, productoId: "p1", proveedorId: null }, todo)).toBe("/compras/nueva");
  });
  it("sin el módulo, no hay botón", () => {
    expect(hrefComprar({ origen: "taller", productoId: "p1", proveedorId: null }, { ...todo, produccion: false })).toBeNull();
    expect(hrefComprar({ origen: "terceros", productoId: "p1", proveedorId: "x" }, { ...todo, compras: false })).toBeNull();
  });
  it("Comprar todas: un solo destino o ninguno", () => {
    const t1 = { origen: "taller" as const, productoId: "a", proveedorId: null };
    const t2 = { origen: "taller" as const, productoId: "b", proveedorId: null };
    const c1 = { origen: "terceros" as const, productoId: "c", proveedorId: "x" };
    expect(hrefComprarTodas([t1, t2], todo)).toBe("/produccion/ordenes");
    expect(hrefComprarTodas([t1], todo)).toBe("/produccion/ordenes?nueva=a");
    expect(hrefComprarTodas([t1, c1], todo)).toBeNull();
  });
  it("Enviar: lo libre de cada una, con el destino ya elegido", () => {
    const href = hrefEnviar([{ varianteId: "v1", piso: 2, almacen: 1 }, { varianteId: "v2", piso: 0, almacen: 0 }], { id: "aqp" }, todo);
    expect(href).toContain("/inventario/traslados/nuevo?lineas=");
    expect(href).toContain("destino=aqp");
    expect(decodeURIComponent(href!)).toContain("v1:3");
    expect(decodeURIComponent(href!)).not.toContain("v2");
    expect(hrefEnviar([{ varianteId: "v1", piso: 1, almacen: 0 }], { id: "aqp" }, { traslados: false })).toBeNull();
  });
  it("Liquidar abre las etiquetas de esas prendas; Reponer baja solo lo que tiene almacén", () => {
    expect(hrefLiquidar([{ varianteId: "v1" }], todo)).toContain("/etiquetas-de-precio?variantes=");
    expect(hrefLiquidar([], todo)).toBeNull();
    expect(hrefReponerPiso([{ varianteId: "v1", almacen: 0 }], todo)).toBeNull();
    expect(hrefReponerPiso([{ varianteId: "v1", almacen: 2 }], todo)).toContain("/inventario/bajar?lineas=");
  });
  it("Pedir propone una de cada una de lo que esa tienda tiene", () => {
    const l = lineasParaPedir([{ varianteId: "v1", nombre: "Body Sonali", color: "Terracota", talla: "M", otras: [{ sedeId: "aqp", stock: 5, vendidas30: 0 }] }], "aqp");
    expect(l).toEqual([{ varianteId: "v1", etiqueta: "Body Sonali · Terracota · M", disponibleEnOrigen: 5, cantidad: 1 }]);
    expect(lineasParaPedir([{ varianteId: "v1", nombre: "x", color: "y", talla: "z", otras: [] }], "aqp")).toEqual([]);
  });
});
