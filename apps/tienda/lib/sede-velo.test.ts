import { describe, expect, it } from "vitest";
import {
  debeCubrir,
  esperaHastaElTope,
  esperaParaSalir,
  letrasDelNombre,
  VELO_ENTRA_MS,
  VELO_LECTURA_MS,
  VELO_MINIMO_MS,
  VELO_SALE_MS,
  VELO_TOPE_MS,
} from "./sede-velo";

describe("el velo del cambio de tienda: cuándo se disipa", () => {
  it("el mínimo es lo que cubre más lo que se lee", () => {
    expect(VELO_MINIMO_MS).toBe(VELO_ENTRA_MS + VELO_LECTURA_MS);
  });

  it("si la página llega al instante, el velo espera lo que falta del mínimo (no parpadea)", () => {
    expect(esperaParaSalir(0)).toBe(VELO_MINIMO_MS);
    expect(esperaParaSalir(100)).toBe(VELO_MINIMO_MS - 100);
  });

  it("si la página tardó más que el mínimo, se disipa ya", () => {
    expect(esperaParaSalir(VELO_MINIMO_MS)).toBe(0);
    expect(esperaParaSalir(3000)).toBe(0);
  });

  it("un reloj que va para atrás (cambio de hora) no alarga la espera más del mínimo", () => {
    expect(esperaParaSalir(-500)).toBe(VELO_MINIMO_MS);
  });

  it("todo puede fallar: si la página nunca llega, el velo no se queda para siempre", () => {
    expect(esperaHastaElTope(0)).toBe(VELO_TOPE_MS);
    expect(esperaHastaElTope(VELO_TOPE_MS)).toBe(0);
    expect(esperaHastaElTope(VELO_TOPE_MS + 5000)).toBe(0);
    expect(esperaHastaElTope(-1)).toBe(VELO_TOPE_MS);
  });

  it("el tope es mucho mayor que cualquier espera normal (red lenta de 1,3 s medida en ADR-0445) y que el mínimo", () => {
    expect(VELO_TOPE_MS).toBeGreaterThan(4 * 1300);
    expect(VELO_TOPE_MS).toBeGreaterThan(VELO_MINIMO_MS + VELO_SALE_MS);
  });

  it("no es invasivo: entra y sale en menos de medio segundo cada vez", () => {
    expect(VELO_ENTRA_MS).toBeLessThanOrEqual(500);
    expect(VELO_SALE_MS).toBeLessThanOrEqual(500);
  });
});

describe("el velo solo cubre si hay otra tienda que esperar", () => {
  it("elegir otra tienda cubre", () => {
    expect(debeCubrir("arequipa", "lima")).toBe(true);
    expect(debeCubrir(null, "lima")).toBe(true);
    expect(debeCubrir(undefined, "trujillo")).toBe(true);
  });

  it("elegir la misma tienda no cubre: no navega a ninguna parte y el velo esperaría hasta el tope", () => {
    expect(debeCubrir("lima", "lima")).toBe(false);
  });

  it("sin tienda elegida no cubre", () => {
    expect(debeCubrir("lima", "")).toBe(false);
  });
});

describe("las letras del nombre", () => {
  it("una por una, sin espacios de los bordes", () => {
    expect(letrasDelNombre(" Lima ")).toEqual(["L", "i", "m", "a"]);
    expect(letrasDelNombre("Trujillo")).toHaveLength(8);
  });

  it("una letra con tilde es una sola letra (no se parte en dos)", () => {
    expect(letrasDelNombre("Ñaña")).toEqual(["Ñ", "a", "ñ", "a"]);
    expect(letrasDelNombre("Piura")).toHaveLength(5);
  });

  it("un nombre vacío no tiene letras", () => {
    expect(letrasDelNombre("")).toEqual([]);
  });
});
