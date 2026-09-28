import { describe, expect, it } from "vitest";
import { avisoSinStock, unidadesEnSede } from "./stock-en-sede-reglas";

describe("unidadesEnSede", () => {
  const stock = new Map([
    ["xs", 3],
    ["s", 1],
  ]);

  it("suma solo las prendas pedidas", () => {
    expect(unidadesEnSede(stock, ["xs", "s"])).toBe(4);
    expect(unidadesEnSede(stock, ["s"])).toBe(1);
  });

  it("una prenda sin fila de stock cuenta 0 (así la etiqueta de una talla agotada no se abre)", () => {
    expect(unidadesEnSede(stock, ["m"])).toBe(0);
    expect(unidadesEnSede(stock, [])).toBe(0);
  });

  it("un negativo (no debería existir: lo impide fn_aplicar_movimiento) no resta a las demás", () => {
    expect(unidadesEnSede(new Map([["a", -2], ["b", 1]]), ["a", "b"])).toBe(1);
  });
});

describe("avisoSinStock", () => {
  it("nombra la prenda y la sede", () => {
    expect(avisoSinStock("XS Beige", "Tienda Trujillo").texto).toBe("XS Beige no tiene stock en Tienda Trujillo");
  });

  it("varias prendas marcadas concuerdan en plural", () => {
    expect(avisoSinStock("Las 3 prendas marcadas", "Tienda Arequipa", true).texto).toBe("Las 3 prendas marcadas no tienen stock en Tienda Arequipa");
  });

  it("sin nombre de sede no deja un hueco", () => {
    expect(avisoSinStock("Blusa Carlita", " ").texto).toBe("Blusa Carlita no tiene stock en tu sede");
  });
});
