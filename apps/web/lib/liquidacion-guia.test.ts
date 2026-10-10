import { describe, expect, it } from "vitest";
import { camposDeCambiarPrecio, camposDeEtiquetar, camposDeRetirar } from "./liquidacion-guia";
import { sePuedeConfirmar } from "./guia-campos";
import { problemaDePrecio } from "./liquidacion-reglas";

const listo = { responsableListo: true, responsableMotivo: null };

describe("Etiquetar una pieza", () => {
  it("se confirma solo con categoría, un precio válido y quién etiqueta", () => {
    expect(sePuedeConfirmar(camposDeEtiquetar({ categoriaId: "c1", precio: "25", minimo: 10, esLider: false, ...listo }))).toBe(true);
    expect(sePuedeConfirmar(camposDeEtiquetar({ categoriaId: "", precio: "25", minimo: 10, esLider: false, ...listo }))).toBe(false);
    expect(
      sePuedeConfirmar(camposDeEtiquetar({ categoriaId: "c1", precio: "25", minimo: 10, esLider: false, responsableListo: false, responsableMotivo: "Elige" })),
    ).toBe(false);
  });

  // La guía no inventa reglas: el precio «falta» exactamente cuando la regla del precio (la misma de la base) lo rechaza.
  it("el precio falta exactamente cuando problemaDePrecio lo rechaza", () => {
    for (const precio of ["", "0", "5", "9.99", "10", "25,5", "2.555", "abc", "99999", "100000"]) {
      for (const esLider of [false, true]) {
        const campo = camposDeEtiquetar({ categoriaId: "c1", precio, minimo: 10, esLider, ...listo }).find((c) => c.id === "precio")!;
        expect(campo.hecho).toBe(problemaDePrecio(precio, 10, esLider) === null);
      }
    }
  });
});

describe("Cambiar el precio", () => {
  it("el mismo precio de ahora no cuenta como hecho", () => {
    const [p] = camposDeCambiarPrecio({ precio: "30", actual: 30, minimo: 10, esLider: false, ...listo });
    expect(p!.hecho).toBe(false);
    expect(p!.pendiente).toMatch(/ya es su precio/);
    expect(sePuedeConfirmar(camposDeCambiarPrecio({ precio: "20", actual: 30, minimo: 10, esLider: false, ...listo }))).toBe(true);
  });
});

describe("Retirar", () => {
  it("pide por qué sale, en 120 letras o menos", () => {
    expect(sePuedeConfirmar(camposDeRetirar({ motivo: "  ", ...listo }))).toBe(false);
    expect(sePuedeConfirmar(camposDeRetirar({ motivo: "se manchó", ...listo }))).toBe(true);
    expect(sePuedeConfirmar(camposDeRetirar({ motivo: "x".repeat(121), ...listo }))).toBe(false);
  });
});
