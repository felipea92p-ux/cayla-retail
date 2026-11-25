import { afterEach, describe, expect, it, vi } from "vitest";
import { preferenciaLocal, valorValido } from "./preferencia-local";

describe("preferenciaLocal con un valor de fábrica que depende del equipo", () => {
  afterEach(() => vi.unstubAllGlobals());

  function conAlmacen(guardado: Record<string, string>) {
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => guardado[k] ?? null } });
  }

  it("sin nada guardado, usa el de este equipo; lo guardado a mano gana", () => {
    const p = preferenciaLocal("prueba", ["si", "no"] as const, "no", () => "si");
    conAlmacen({});
    expect(p.leer()).toBe("si");
    conAlmacen({ prueba: "no" });
    expect(p.leer()).toBe("no");
  });

  it("en el servidor, siempre el de fábrica fijo", () => {
    const p = preferenciaLocal("prueba", ["si", "no"] as const, "no", () => "si");
    expect(p.leerEnServidor()).toBe("no");
  });

  it("si preguntar al equipo falla, cae en el de fábrica fijo", () => {
    const p = preferenciaLocal("prueba", ["si", "no"] as const, "no", () => {
      throw new Error("sin matchMedia");
    });
    conAlmacen({});
    expect(p.leer()).toBe("no");
  });
});

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
