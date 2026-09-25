import { describe, expect, it } from "vitest";
import { comboLlegoAlFinal, comboNecesitaBuscador, TAMANO_PAGINA_COMBO, UMBRAL_BUSCAR_COMBO } from "./combo-reglas";

describe("comboNecesitaBuscador", () => {
  it("no busca con el umbral exacto", () => {
    expect(comboNecesitaBuscador(UMBRAL_BUSCAR_COMBO)).toBe(false);
  });

  it("busca apenas se pasa del umbral", () => {
    expect(comboNecesitaBuscador(UMBRAL_BUSCAR_COMBO + 1)).toBe(true);
  });

  it("no busca con una lista corta", () => {
    expect(comboNecesitaBuscador(3)).toBe(false);
  });

  it("no busca sin opciones", () => {
    expect(comboNecesitaBuscador(0)).toBe(false);
  });
});

describe("comboLlegoAlFinal", () => {
  it("no llegó si sobra scroll", () => {
    expect(comboLlegoAlFinal({ scrollTop: 0, clientHeight: 200, scrollHeight: 1000 })).toBe(false);
  });

  it("llegó cuando el resto cabe en el margen por defecto", () => {
    expect(comboLlegoAlFinal({ scrollTop: 780, clientHeight: 200, scrollHeight: 1000 })).toBe(true);
  });

  it("respeta un margen propio", () => {
    expect(comboLlegoAlFinal({ scrollTop: 700, clientHeight: 200, scrollHeight: 1000 }, 100)).toBe(true);
    expect(comboLlegoAlFinal({ scrollTop: 650, clientHeight: 200, scrollHeight: 1000 }, 100)).toBe(false);
  });

  it("una lista que no se desplaza ya está en el fondo", () => {
    expect(comboLlegoAlFinal({ scrollTop: 0, clientHeight: 200, scrollHeight: 200 })).toBe(true);
  });
});

describe("umbrales", () => {
  it("8 y 50, los números que pidió Felipe", () => {
    expect(UMBRAL_BUSCAR_COMBO).toBe(8);
    expect(TAMANO_PAGINA_COMBO).toBe(50);
  });
});
