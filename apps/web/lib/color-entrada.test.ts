import { describe, it, expect } from "vitest";
import { parsearColor, rgbDeHex } from "./color-entrada";

describe("parsearColor — lo que la persona escribe o pega", () => {
  it.each([
    ["#c9b79c", "#c9b79c"],
    ["C9B79C", "#c9b79c"],
    ["  #C9B79C  ", "#c9b79c"],
    ["#fa0", "#ffaa00"],
    ["rgb(201, 183, 156)", "#c9b79c"],
    ["rgb(201,183,156)", "#c9b79c"],
    ["201 183 156", "#c9b79c"],
    ["201, 183, 156", "#c9b79c"],
    ["0 0 0", "#000000"],
    ["255,255,255", "#ffffff"],
  ])("%s → %s", (entrada, esperado) => {
    expect(parsearColor(entrada)).toBe(esperado);
  });

  it.each(["", "#12", "#12345", "#gggggg", "azul", "256 0 0", "1 2", "rgb(1,2,3,4)"])("rechaza %j", (entrada) => {
    expect(parsearColor(entrada)).toBeNull();
  });
});

describe("rgbDeHex", () => {
  it("convierte el hex guardado a los tres canales", () => {
    expect(rgbDeHex("#c9b79c")).toBe("201, 183, 156");
    expect(rgbDeHex("#000000")).toBe("0, 0, 0");
  });
});
