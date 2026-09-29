import { describe, expect, it } from "vitest";
import { ORDENES_DESPLEGABLE, ORDENES_PRODUCTOS, ROTULO_ORDEN_PRODUCTOS, leerOrdenProductos, ordenPorVentas } from "./productos-orden";

describe("productos-orden", () => {
  it("lee las seis opciones y descarta cualquier otra cosa (sin orden = por nombre)", () => {
    for (const o of ORDENES_PRODUCTOS) expect(leerOrdenProductos(o)).toBe(o);
    for (const raro of [undefined, null, "", "nombre", "PRECIO_ASC", "precio_asc ", "vendidos", "drop table", "0"]) {
      expect(leerOrdenProductos(raro)).toBeUndefined();
    }
  });

  it("cada opción tiene un rótulo distinto y legible", () => {
    const rotulos = ORDENES_PRODUCTOS.map((o) => ROTULO_ORDEN_PRODUCTOS[o]);
    expect(new Set(rotulos).size).toBe(ORDENES_PRODUCTOS.length);
    for (const r of rotulos) expect(r.length).toBeGreaterThan(5);
  });

  it("los dos órdenes por ventas dicen la ventana de 30 días en su rótulo (la misma de «Pedir a proveedor»)", () => {
    expect(ROTULO_ORDEN_PRODUCTOS.vendidos_desc).toContain("30 días");
    expect(ROTULO_ORDEN_PRODUCTOS.vendidos_asc).toContain("30 días");
  });

  it("el desplegable trae las cuatro nuevas y las flechas conservan el precio: entre los dos, todas y ninguna repetida", () => {
    const flechas = ["precio_asc", "precio_desc"];
    expect([...ORDENES_DESPLEGABLE, ...flechas].sort()).toEqual([...ORDENES_PRODUCTOS].sort());
    expect(ORDENES_DESPLEGABLE.some((o) => flechas.includes(o))).toBe(false);
  });

  it("solo los de ventas cuentan como «por ventas»", () => {
    expect(ORDENES_PRODUCTOS.filter((o) => ordenPorVentas(o))).toEqual(["vendidos_desc", "vendidos_asc"]);
    expect(ordenPorVentas(undefined)).toBe(false);
  });
});
