import { describe, expect, it } from "vitest";
import { avisoVisible, salioAlDejarlo, salioTrasCambiar } from "./validar-al-salir";

const MAL = "El RUC tiene 11 dígitos.";

/** Una persona que escribe y sale: devuelve lo que ve tras cada paso. */
function recorrer(pasos: ({ motivo: string | null } | "salir")[]) {
  let salio = false;
  let motivo: string | null = null;
  return pasos.map((p) => {
    if (p === "salir") salio = salioAlDejarlo(motivo);
    else {
      motivo = p.motivo;
      salio = salioTrasCambiar(salio, motivo);
    }
    return avisoVisible(salio, motivo);
  });
}

describe("validar al salir del campo", () => {
  it("mientras escribe por primera vez no se regaña, aunque el dato esté a medias", () => {
    expect(recorrer([{ motivo: MAL }, { motivo: MAL }, { motivo: MAL }])).toEqual([null, null, null]);
  });

  it("al salir con el dato mal, se avisa", () => {
    expect(recorrer([{ motivo: MAL }, "salir"])).toEqual([null, MAL]);
  });

  it("si vuelve a escribir y sigue mal, el aviso se queda para que vea qué corrige", () => {
    expect(recorrer([{ motivo: MAL }, "salir", { motivo: MAL }])).toEqual([null, MAL, MAL]);
  });

  it("apenas queda bien, el aviso se va, sin esperar a que salga", () => {
    expect(recorrer([{ motivo: MAL }, "salir", { motivo: null }])).toEqual([null, MAL, null]);
  });

  it("corregido, si lo vuelve a dañar espera a que salga otra vez", () => {
    expect(recorrer([{ motivo: MAL }, "salir", { motivo: null }, { motivo: MAL }, "salir"])).toEqual([null, MAL, null, null, MAL]);
  });

  it("salir con el dato bien o vacío no avisa nada", () => {
    expect(recorrer(["salir", { motivo: null }, "salir"])).toEqual([null, null, null]);
  });
});
