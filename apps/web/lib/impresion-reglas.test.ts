import { describe, expect, it } from "vitest";
import { nombreDeImpresion } from "./impresion-reglas";

describe("nombreDeImpresion", () => {
  it("deja pasar el número de un comprobante tal cual", () => {
    expect(nombreDeImpresion("B004-000004")).toBe("B004-000004");
    expect(nombreDeImpresion("NV01-000007")).toBe("NV01-000007");
    expect(nombreDeImpresion("F001-000123")).toBe("F001-000123");
    expect(nombreDeImpresion("PRO-000012")).toBe("PRO-000012");
  });

  it("no inventa un nombre cuando no hay número: se queda el título de siempre", () => {
    expect(nombreDeImpresion(null)).toBeNull();
    expect(nombreDeImpresion(undefined)).toBeNull();
    expect(nombreDeImpresion("")).toBeNull();
    expect(nombreDeImpresion("   ")).toBeNull();
  });

  it("cambia por «-» lo que ningún archivo admite", () => {
    expect(nombreDeImpresion("B004/000004")).toBe("B004-000004");
    expect(nombreDeImpresion('Cambio: "B001"?')).toBe("Cambio- -B001-");
  });

  it("recorta los espacios y no pasa de 100 caracteres", () => {
    expect(nombreDeImpresion("  Cambio   B001-000001  ")).toBe("Cambio B001-000001");
    expect(nombreDeImpresion("x".repeat(300))).toHaveLength(100);
  });
});
