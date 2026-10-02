import { describe, expect, it } from "vitest";
import { TODOS, textoPildora } from "./pildora-reglas";

describe("pildora-reglas — la píldora dice qué filtra", () => {
  it("sin nada elegido dice el nombre del filtro, nunca «Todas»", () => {
    expect(textoPildora("Categoría", { valor: TODOS, texto: "Todas" })).toEqual({ etiqueta: "Categoría", valor: null });
    expect(textoPildora("Vendedor", { valor: TODOS, texto: "Todos los vendedores" })).toEqual({ etiqueta: "Vendedor", valor: null });
  });

  it("con algo elegido dice el nombre y el valor: «Adidas» marca no se confunde con «Adidas» proveedor", () => {
    expect(textoPildora("Marca", { valor: "m1", texto: "Adidas" })).toEqual({ etiqueta: "Marca", valor: "Adidas" });
    expect(textoPildora("Proveedor", { valor: "p1", texto: "Adidas" })).toEqual({ etiqueta: "Proveedor", valor: "Adidas" });
  });

  it("un valor que ya no está en la lista (URL vieja) se lee como sin valor", () => {
    expect(textoPildora("Color", null)).toEqual({ etiqueta: "Color", valor: null });
  });

  it("una opción explícita que no es el «todos» de la lista se nombra («Tienda: Todas las tiendas» en Historial)", () => {
    expect(textoPildora("Tienda", { valor: "todas", texto: "Todas las tiendas" })).toEqual({ etiqueta: "Tienda", valor: "Todas las tiendas" });
  });
});
