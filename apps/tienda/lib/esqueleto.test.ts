import { describe, expect, it } from "vitest";
import { formaDeLaRuta } from "./esqueleto";

const PRENDA = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";

describe("la forma del esqueleto según la página que viene", () => {
  it("la ficha de una prenda se anuncia con su foto y sus datos", () => {
    expect(formaDeLaRuta(`/catalogo/${PRENDA}`)).toBe("ficha");
    expect(formaDeLaRuta(`/catalogo/${PRENDA}/`)).toBe("ficha");
  });

  it("una dirección que no es de una prenda no es una ficha", () => {
    expect(formaDeLaRuta("/catalogo/no-es-un-id")).toBe("grilla");
    expect(formaDeLaRuta(`/catalogo/${PRENDA}/otra`)).toBe("grilla");
  });

  it("«Mi perfil» con su saludo y sus cuadros; sus páginas y la bolsa, con su lista", () => {
    expect(formaDeLaRuta("/cuenta")).toBe("perfil");
    expect(formaDeLaRuta("/cuenta/")).toBe("perfil");
    expect(formaDeLaRuta("/cuenta/pedidos")).toBe("lista");
    expect(formaDeLaRuta("/cuenta/pedidos/W-0008")).toBe("lista");
    expect(formaDeLaRuta("/bolsa")).toBe("lista");
    expect(formaDeLaRuta("/bolsa/separado/W-0008")).toBe("lista");
  });

  it("lo demás (el Inicio, la lista, los looks), con la grilla de prendas", () => {
    expect(formaDeLaRuta("/inicio")).toBe("grilla");
    expect(formaDeLaRuta("/catalogo")).toBe("grilla");
    expect(formaDeLaRuta("/looks")).toBe("grilla");
    expect(formaDeLaRuta("/")).toBe("grilla");
    expect(formaDeLaRuta("/bolsas")).toBe("grilla");
  });
});
