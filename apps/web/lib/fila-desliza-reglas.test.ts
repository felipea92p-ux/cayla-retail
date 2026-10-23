import { describe, expect, it } from "vitest";
import { bordesQueFaltan } from "./fila-desliza-reglas";

describe("bordesQueFaltan — qué le falta ver a una fila que se desliza", () => {
  it("una fila que cabe entera no avisa nada", () => {
    expect(bordesQueFaltan(0, 343, 343)).toEqual({ izquierda: false, derecha: false });
    expect(bordesQueFaltan(0, 343, 300)).toEqual({ izquierda: false, derecha: false });
  });

  it("el aire de 4 px del anillo de foco no cuenta como contenido que falte", () => {
    expect(bordesQueFaltan(0, 343, 347)).toEqual({ izquierda: false, derecha: false });
    expect(bordesQueFaltan(0, 343, 349)).toEqual({ izquierda: false, derecha: true });
  });

  it("al principio solo hay más a la derecha; en medio, a los dos lados; al final, solo a la izquierda", () => {
    expect(bordesQueFaltan(0, 343, 700)).toEqual({ izquierda: false, derecha: true });
    expect(bordesQueFaltan(150, 343, 700)).toEqual({ izquierda: true, derecha: true });
    expect(bordesQueFaltan(357, 343, 700)).toEqual({ izquierda: true, derecha: false });
  });

  it("un scrollLeft con decimales al llegar al final ya no avisa a la derecha", () => {
    expect(bordesQueFaltan(356.5, 343, 700)).toEqual({ izquierda: true, derecha: false });
    expect(bordesQueFaltan(2.5, 343, 700)).toEqual({ izquierda: false, derecha: true });
  });

  it("no se rompe con medidas vacías (una fila oculta mide 0)", () => {
    expect(bordesQueFaltan(0, 0, 0)).toEqual({ izquierda: false, derecha: false });
    expect(bordesQueFaltan(Number.NaN, 343, 700)).toEqual({ izquierda: false, derecha: true });
  });
});
