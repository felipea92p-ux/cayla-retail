import { describe, expect, it } from "vitest";
import { valorValido } from "./preferencia-local";

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
