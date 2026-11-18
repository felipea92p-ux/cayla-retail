import { describe, expect, it } from "vitest";
import { camposRespuesta } from "./libro-reclamaciones-guia";
import { MAX_RESPUESTA, MIN_RESPUESTA, avisoDelError, letras, problemaDeLaRespuesta } from "./libro-reclamaciones-reglas";

const sin = { respuesta: null };

describe("la guía de la respuesta sigue a lo que la base rechaza", () => {
  it.each([
    ["", false],
    ["corta", false],
    ["x".repeat(MIN_RESPUESTA), true],
    ["  dos  espacios​ de más ", true],
    ["x".repeat(MAX_RESPUESTA), true],
    ["x".repeat(MAX_RESPUESTA + 1), false],
  ])("«%s…» lista: %s", (texto, lista) => {
    const [respuesta] = camposRespuesta({ hoja: sin, respuesta: texto, responsableListo: true, responsableMotivo: null });
    expect(respuesta!.hecho).toBe(lista);
    expect(problemaDeLaRespuesta(texto) === null).toBe(lista);
    if (!lista) expect(respuesta!.pendiente).not.toBe("");
  });

  it("cuenta las letras como la base (limpias)", () => {
    expect(letras("  hola   mundo ")).toBe(10);
  });

  it("una hoja ya respondida no pide nada; sin responsable, falta quién", () => {
    expect(camposRespuesta({ hoja: { respuesta: "Ya" }, respuesta: "", responsableListo: false, responsableMotivo: null })).toEqual([]);
    const [, quien] = camposRespuesta({ hoja: sin, respuesta: "", responsableListo: false, responsableMotivo: "Elige quién está en la tienda." });
    expect(quien).toMatchObject({ id: "responsable", hecho: false, pendiente: "Elige quién está en la tienda." });
  });

  it("los errores de la base tienen su frase", () => {
    for (const hint of ["libro_ya_respondida", "libro_no_existe", "libro_respuesta_corta", "libro_respuesta_larga"]) {
      expect(avisoDelError({ hint })).not.toBeNull();
    }
    expect(avisoDelError({ hint: "otra" })).toBeNull();
  });
});
