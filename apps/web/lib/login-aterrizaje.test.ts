import { describe, expect, it } from "vitest";
import { DESTINO_SI_NO_SE, destinoDeLaRespuesta } from "./login-aterrizaje";

describe("el login entra directo a la pantalla de la cuenta (Felipe 2026-10-13, «se ve el inicio»)", () => {
  it("con una respuesta clara, va a la pantalla que dice", () => {
    expect(destinoDeLaRespuesta({ destino: "/inventario" })).toBe("/inventario");
    expect(destinoDeLaRespuesta({ destino: "/vender" })).toBe("/vender");
    expect(destinoDeLaRespuesta({ destino: "/global" })).toBe("/global");
    expect(destinoDeLaRespuesta({ destino: "/" })).toBe("/");
    expect(destinoDeLaRespuesta({ destino: "/global/elige-sede?desde=/inventario" })).toBe("/global/elige-sede?desde=/inventario");
  });

  it("sin respuesta o con una que no se entiende, va al Inicio, el camino de siempre", () => {
    for (const cuerpo of [null, undefined, "", "/inventario", 42, [], {}, { destino: null }, { destino: 7 }, { destino: "" }, { destino: "inventario" }]) {
      expect(destinoDeLaRespuesta(cuerpo), JSON.stringify(cuerpo)).toBe(DESTINO_SI_NO_SE);
    }
  });

  it("nunca lleva a otro sitio, aunque la respuesta lo pida", () => {
    for (const destino of ["//otro.com", "//otro.com/vender", "/\\otro.com", "https://otro.com", "javascript:alert(1)", " /vender", "/ven der", "/vender\n"]) {
      expect(destinoDeLaRespuesta({ destino }), destino).toBe(DESTINO_SI_NO_SE);
    }
  });

  it("si no sabe a dónde, el destino es el Inicio, que decide solo", () => {
    expect(DESTINO_SI_NO_SE).toBe("/");
  });
});
