import { describe, expect, it } from "vitest";
import { textoAtajoEnRevision } from "./conteo-atajo";

describe("textoAtajoEnRevision", () => {
  it("dice cuántas de las contadas se completaron con el atajo", () => {
    expect(textoAtajoEnRevision(23, 40)).toBe("23 de 40 variantes contadas se completaron con «Completar todo», con lo que CAYLA esperaba.");
  });

  it("singular, y todas las contadas", () => {
    expect(textoAtajoEnRevision(1, 12)).toBe("1 de 12 variantes contadas se completó con «Completar todo», con lo que CAYLA esperaba.");
    expect(textoAtajoEnRevision(1, 1)).toBe("1 de 1 variante contada se completó con «Completar todo», con lo que CAYLA esperaba.");
    expect(textoAtajoEnRevision(40, 40)).toBe("40 de 40 variantes contadas se completaron con «Completar todo», con lo que CAYLA esperaba.");
  });

  it("sin el total de contadas, el sustantivo concuerda con lo que se nombra (nunca «1 variantes»)", () => {
    expect(textoAtajoEnRevision(1, 0)).toBe("1 variante contada se completó con «Completar todo», con lo que CAYLA esperaba.");
    expect(textoAtajoEnRevision(3, 0)).toBe("3 variantes contadas se completaron con «Completar todo», con lo que CAYLA esperaba.");
  });

  it("si no hay ninguna, no dice nada (una frase que siempre sale se deja de leer)", () => {
    expect(textoAtajoEnRevision(0, 40)).toBeNull();
    expect(textoAtajoEnRevision(-1, 40)).toBeNull();
  });

  it("jamás dice más completadas que contadas (si la lectura de la marca y la del resumen no son de la misma foto)", () => {
    expect(textoAtajoEnRevision(41, 40)).toBe("40 de 40 variantes contadas se completaron con «Completar todo», con lo que CAYLA esperaba.");
  });

  it("no afirma que nadie escribió la cantidad: tecleando encima el mismo número la marca sigue puesta y la frase tiene que ser cierta", () => {
    expect(textoAtajoEnRevision(2, 4)).not.toMatch(/nadie escribi/i);
  });
});
