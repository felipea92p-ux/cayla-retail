import { describe, expect, it } from "vitest";
import { PAUSA_MISMO_CODIGO_MS, esLecturaRepetida, mensajeEscaneo, normalizarLectura } from "./escaner-reglas";

describe("escaner-reglas", () => {
  it("normaliza la lectura como la dejaría el lector", () => {
    expect(normalizarLectura("  CAY-0012\n")).toBe("CAY-0012");
  });

  it("ignora la misma etiqueta mientras sigue delante de la cámara", () => {
    const ultima = { codigo: "CAY-0012", en: 1_000 };
    expect(esLecturaRepetida("CAY-0012", ultima, 1_000 + PAUSA_MISMO_CODIGO_MS - 1)).toBe(true);
  });

  it("vuelve a contar la misma etiqueta pasada la pausa (segunda unidad)", () => {
    const ultima = { codigo: "CAY-0012", en: 1_000 };
    expect(esLecturaRepetida("CAY-0012", ultima, 1_000 + PAUSA_MISMO_CODIGO_MS)).toBe(false);
  });

  it("una etiqueta distinta nunca espera", () => {
    expect(esLecturaRepetida("CAY-0099", { codigo: "CAY-0012", en: 1_000 }, 1_001)).toBe(false);
    expect(esLecturaRepetida("CAY-0012", null, 0)).toBe(false);
  });

  it("dice qué pasó con cada lectura", () => {
    expect(mensajeEscaneo({ estado: "agregada", codigo: "C1", nombre: "Blusa Emma · M" })).toEqual({ tono: "verde", texto: "Blusa Emma · M · al ticket" });
    expect(mensajeEscaneo({ estado: "agotada", codigo: "C1", nombre: "Blusa Emma · M" }).tono).toBe("ambar");
    expect(mensajeEscaneo({ estado: "tope", codigo: "C1", nombre: "Blusa Emma · M" }).texto).toContain("Ya están todas");
    expect(mensajeEscaneo({ estado: "no-encontrada", codigo: "XYZ" }).texto).toBe("No encontramos «XYZ» en esta tienda");
  });
});
