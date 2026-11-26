import { describe, expect, it } from "vitest";
import { SEMANAS_DE_HISTORIA_CORTA, notaDeHistoria } from "./produccion-cifras-textos";

describe("la edad de los datos: una nota mientras el sistema lleva poco midiendo ventas", () => {
  it("a las 4 semanas dice «4 semanas» y desde cuándo", () => {
    expect(notaDeHistoria("2026-10-27")).toBe("El sistema lleva 4 semanas de ventas (desde el 29 de setiembre): las cantidades son una guía, no una orden.");
  });
  it("la primera semana dice «menos de una semana»; una sola semana, en singular", () => {
    expect(notaDeHistoria("2026-10-02")).toContain("menos de una semana");
    expect(notaDeHistoria("2026-10-06")).toContain("1 semana de ventas");
  });
  it("se apaga sola al llegar al tope", () => {
    expect(notaDeHistoria("2026-11-23")).not.toBeNull(); // 55 días = 7 semanas
    expect(notaDeHistoria("2026-11-24")).toBeNull(); // 56 días = 8 semanas = SEMANAS_DE_HISTORIA_CORTA
    expect(SEMANAS_DE_HISTORIA_CORTA).toBe(8);
  });
  it("una fecha anterior al arranque no inventa semanas", () => {
    expect(notaDeHistoria("2026-09-01")).toBeNull();
  });
});
