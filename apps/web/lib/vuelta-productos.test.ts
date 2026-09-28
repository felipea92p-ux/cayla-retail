import { describe, expect, it } from "vitest";
import { conDesde, desdeDeParams, desdeSeguro, vueltaAProductos } from "./vuelta-productos";

describe("vuelta-productos", () => {
  it("desdeSeguro solo deja pasar rutas internas de Productos", () => {
    expect(desdeSeguro("/productos")).toBe("/productos");
    expect(desdeSeguro("/productos?vista=tabla")).toBe("/productos?vista=tabla");
    for (const malo of ["//malo.com", "https://malo.com", "javascript:alert(1)", "/productosx", "/inventario", "/productos\\x", "", null, undefined]) {
      expect(desdeSeguro(malo)).toBeNull();
    }
  });
  it("conDesde agrega la pantalla de origen con ? o & según el enlace", () => {
    expect(conDesde("/productos/a/editar", "/productos?vista=tabla")).toBe("/productos/a/editar?desde=%2Fproductos%3Fvista%3Dtabla");
    expect(conDesde("/x?y=1", "/productos")).toBe("/x?y=1&desde=%2Fproductos");
    expect(conDesde("/productos/a/editar", "https://malo.com")).toBe("/productos/a/editar");
    expect(conDesde("/productos/a/editar", null)).toBe("/productos/a/editar");
  });
  it("vueltaAProductos y desdeDeParams", () => {
    expect(vueltaAProductos("/productos?vista=tabla")).toBe("/productos?vista=tabla");
    expect(vueltaAProductos("//malo.com")).toBe("/productos");
    expect(desdeDeParams(["/productos?vista=tabla", "/otra"])).toBe("/productos?vista=tabla");
    expect(desdeDeParams(undefined)).toBeNull();
  });
});
