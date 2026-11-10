import { describe, expect, it } from "vitest";
import { normalizarComponentes } from "./color-combinado";

describe("normalizarComponentes", () => {
  it("acepta la base y de 1 a 3 acompañantes, en mayúsculas y en el orden recibido", () => {
    expect(normalizarComponentes(["cru", " AZU "])).toEqual(["CRU", "AZU"]);
    expect(normalizarComponentes(["CRU", "NEG", "AZU", "ROJ"])).toEqual(["CRU", "NEG", "AZU", "ROJ"]);
  });

  it("rechaza un solo color, cinco, uno repetido, un código mal escrito o algo que no es lista", () => {
    expect(normalizarComponentes(["CRU"])).toBeNull();
    expect(normalizarComponentes(["CRU", "AZU", "NEG", "ROJ", "AZM"])).toBeNull();
    expect(normalizarComponentes(["CRU", "cru"])).toBeNull();
    expect(normalizarComponentes(["CRU", "AZUL"])).toBeNull();
    expect(normalizarComponentes(["CRU", 3])).toBeNull();
    expect(normalizarComponentes("CRU,AZU")).toBeNull();
    expect(normalizarComponentes(undefined)).toBeNull();
  });
});
