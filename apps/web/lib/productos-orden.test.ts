import { describe, expect, it } from "vitest";
import {
  ORDENES_MENU,
  ORDENES_PRODUCTOS,
  ORDEN_POR_DEFECTO,
  ROTULO_ORDEN_PRODUCTOS,
  leerOrdenProductos,
  ordenDeUrl,
  ordenParaBase,
  ordenPorVentas,
} from "./productos-orden";

describe("productos-orden", () => {
  it("lee las siete opciones y, ante cualquier otra cosa, vuelve a la de fábrica (Más recientes)", () => {
    for (const o of ORDENES_MENU) expect(ordenDeUrl(o)).toBe(o);
    for (const raro of [undefined, null, "", "PRECIO_ASC", "precio_asc ", "vendidos", "drop table", "0"]) {
      expect(ordenDeUrl(raro)).toBe(ORDEN_POR_DEFECTO);
    }
    expect(ORDEN_POR_DEFECTO).toBe("recientes");
  });

  it("«nombre» es el orden sin parámetro de la base; los demás pasan tal cual", () => {
    expect(ordenParaBase("nombre")).toBeUndefined();
    for (const o of ORDENES_PRODUCTOS) expect(ordenParaBase(o)).toBe(o);
    expect(leerOrdenProductos(undefined)).toBe("recientes");
    expect(leerOrdenProductos("nombre")).toBeUndefined();
  });

  it("un solo menú con todas las de la base más «nombre», sin repetidas (antes: flechas + desplegable para lo mismo)", () => {
    expect([...ORDENES_MENU].sort()).toEqual([...ORDENES_PRODUCTOS, "nombre"].sort());
    expect(new Set(ORDENES_MENU).size).toBe(ORDENES_MENU.length);
  });

  it("cada opción tiene un rótulo distinto y legible", () => {
    const rotulos = ORDENES_MENU.map((o) => ROTULO_ORDEN_PRODUCTOS[o]);
    expect(new Set(rotulos).size).toBe(ORDENES_MENU.length);
    for (const r of rotulos) expect(r.length).toBeGreaterThan(5);
  });

  it("los dos órdenes por ventas dicen la ventana de 30 días en su rótulo (la misma de «Pedir a proveedor»)", () => {
    expect(ROTULO_ORDEN_PRODUCTOS.vendidos_desc).toContain("30 días");
    expect(ROTULO_ORDEN_PRODUCTOS.vendidos_asc).toContain("30 días");
  });

  it("solo los de ventas cuentan como «por ventas»", () => {
    expect(ORDENES_PRODUCTOS.filter((o) => ordenPorVentas(o))).toEqual(["vendidos_desc", "vendidos_asc"]);
    expect(ordenPorVentas(undefined)).toBe(false);
  });
});
