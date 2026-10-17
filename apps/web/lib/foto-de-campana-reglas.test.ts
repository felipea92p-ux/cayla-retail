import { describe, expect, it } from "vitest";
import { luminancia } from "@cayla-retail/portada";
import { avisosDeLaFoto, rutaFotoDeFondo, tonoClaro } from "./foto-de-campana-reglas";

const pixeles = (...colores: [number, number, number, number?][]) => Uint8ClampedArray.from(colores.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));

describe("el tono de la foto del fondo (lo que la revisión usa para la letra)", () => {
  it("es lo más claro de la foto, no su promedio: una foto oscura con un cielo blanco cuenta como clara", () => {
    const oscura = Array.from({ length: 90 }, () => [20, 20, 20] as [number, number, number]);
    const cielo = Array.from({ length: 10 }, () => [250, 250, 250] as [number, number, number]);
    const tono = tonoClaro(pixeles(...oscura, ...cielo));
    expect(luminancia(tono)).toBeGreaterThan(0.9);
  });

  it("una foto pareja da su color", () => {
    expect(tonoClaro(pixeles([200, 100, 50], [200, 100, 50], [200, 100, 50]))).toBe("#c86432");
  });

  it("los píxeles transparentes no cuentan; sin ninguno, lo más exigente (blanco)", () => {
    expect(tonoClaro(pixeles([10, 10, 10], [255, 255, 255, 0]))).toBe("#0a0a0a");
    expect(tonoClaro(new Uint8ClampedArray(0))).toBe("#ffffff");
  });

  it("sale en hex de seis cifras, como lo exige la base", () => {
    expect(tonoClaro(pixeles([1, 2, 3], [250, 240, 230]))).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("la foto elegida", () => {
  it("avisa si es chica o vertical, sin impedir usarla", () => {
    expect(avisosDeLaFoto(1920, 1080)).toEqual([]);
    expect(avisosDeLaFoto(800, 600)[0]).toContain("800 px");
    expect(avisosDeLaFoto(1500, 2000)[0]).toContain("vertical");
  });

  it("se guarda con un nombre nuevo, en la carpeta que la base acepta", () => {
    expect(rutaFotoDeFondo("0f0f0f0f-1111-4222-8333-444455556666")).toBe("fondos/0f0f0f0f-1111-4222-8333-444455556666.jpg");
  });
});
