import { afterEach, describe, expect, it, vi } from "vitest";
import { preferenciaLocal, valorValido } from "./preferencia-local";

describe("valorValido", () => {
  const validos = ["iconos", "texto"] as const;
  it("deja pasar lo que está en la lista", () => {
    expect(valorValido("texto", validos, "iconos")).toBe("texto");
  });
  it("sin nada guardado, o con algo que no es de la lista, usa el de fábrica", () => {
    expect(valorValido(null, validos, "iconos")).toBe("iconos");
    expect(valorValido(undefined, validos, "iconos")).toBe("iconos");
    expect(valorValido("", validos, "iconos")).toBe("iconos");
    expect(valorValido("grande", validos, "iconos")).toBe("iconos");
  });
});

describe("preferenciaLocal con un valor de fábrica que depende del aparato", () => {
  afterEach(() => vi.unstubAllGlobals());
  const validos = ["si", "no"] as const;
  const conGuardado = (guardado: string | null) =>
    vi.stubGlobal("window", { localStorage: { getItem: () => guardado, setItem: () => {} }, addEventListener: () => {}, removeEventListener: () => {} });

  it("sin nada guardado, pregunta al aparato; con algo guardado, ni le pregunta", () => {
    let preguntas = 0;
    const p = preferenciaLocal("x", validos, "no", () => {
      preguntas++;
      return "si";
    });
    conGuardado(null);
    expect(p.leer()).toBe("si");
    expect(preguntas).toBe(1);
    conGuardado("no");
    expect(p.leer()).toBe("no");
    expect(preguntas).toBe(1);
  });

  it("si la pregunta al aparato falla o responde fuera de la lista, vale el de fábrica de siempre", () => {
    conGuardado(null);
    expect(
      preferenciaLocal("x", validos, "no", () => {
        throw new Error("sin matchMedia");
      }).leer(),
    ).toBe("no");
    expect(preferenciaLocal("x", validos, "no", () => "quizas" as "si").leer()).toBe("no");
  });

  it("el servidor no sabe qué aparato es: siempre el de fábrica de siempre", () => {
    expect(preferenciaLocal("x", validos, "no", () => "si").leerEnServidor()).toBe("no");
  });
});
