import { describe, it, expect } from "vitest";
import { primerAviso, sumarUnidades, textoCifra } from "./inicio-reglas";

describe("sumarUnidades", () => {
  it("suma las unidades de la sede", () => {
    expect(sumarUnidades([{ cantidad: 3 }, { cantidad: 4 }, { cantidad: 0 }])).toBe(7);
  });
  it("una sede sin filas tiene 0 unidades (eso sí es un cero de verdad)", () => {
    expect(sumarUnidades([])).toBe(0);
  });
  it("una lectura caída NO es 0: es «no sé»", () => {
    expect(sumarUnidades(null)).toBeNull();
  });
});

describe("textoCifra", () => {
  it("pinta la cifra, incluido un 0 real", () => {
    expect(textoCifra(38)).toBe("38");
    expect(textoCifra(0)).toBe("0");
  });
  it("pinta «—» cuando no se pudo leer, nunca un 0 que parezca normalidad", () => {
    expect(textoCifra(null)).toBe("—");
  });
});

describe("primerAviso", () => {
  it("devuelve el primer aviso que falló", () => {
    expect(primerAviso([null, "falló A", "falló B"])).toBe("falló A");
  });
  it("es null si todo llegó", () => {
    expect(primerAviso([null, null])).toBeNull();
  });
});
