import { describe, expect, it } from "vitest";
import { claveTexto, nombresParecidos } from "./nombres-parecidos";

// La regla general. Los casos de cada dominio viven en su prueba: marcas en `marcas.test.ts`, proveedores en
// `proveedores-reglas.test.ts`.
describe("nombresParecidos: la regla general de «¿no será uno que ya existe?»", () => {
  const existentes = ["CAYLA", "Divas Now", "Krisstell"].map((nombre, i) => ({ id: `x${i}`, nombre }));

  it("la clave es la de la base (fn_clave_texto): mayúsculas, tildes, ñ y espacios repetidos no hacen otro nombre", () => {
    expect(claveTexto("  Cáyla   Ñusta ")).toBe("cayla nusta");
    expect(nombresParecidos("Cáyla", existentes).igual?.nombre).toBe("CAYLA");
  });

  it("la base NO quita puntos: «S.A.C.» y «SAC» son nombres distintos para ella", () => {
    expect(claveTexto("Jacard Peru S.A.C.")).not.toBe(claveTexto("Jacard Peru SAC"));
  });

  it("sin `quitar`, todas las palabras cuentan (así se comparan las marcas)", () => {
    expect(nombresParecidos("Cayla 2", existentes).parecidos.map((p) => `${p.item.nombre}:${p.por}`)).toEqual(["CAYLA:raiz"]);
    expect(nombresParecidos("Cayla Kids", existentes).parecidos.map((p) => p.por)).toEqual(["contenida"]);
  });

  it("`quitar` saca palabras de los DOS lados antes de comparar, y el igual sigue siendo el de la base", () => {
    const sinKids = (ps: readonly string[]) => ps.filter((w) => w !== "kids");
    const r = nombresParecidos("Cayla Kids", existentes, { quitar: sinKids });
    expect(r.igual).toBeNull();
    expect(r.parecidos.map((p) => `${p.item.nombre}:${p.por}`)).toEqual(["CAYLA:raiz"]);
  });

  it("un nombre vacío no pregunta nada", () => {
    expect(nombresParecidos("  ", existentes)).toEqual({ igual: null, parecidos: [] });
  });
});
