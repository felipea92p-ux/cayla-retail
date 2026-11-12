import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bordeDeArriba } from "../components/ui/HojasAlCentro";

// Las hojas al centro (Felipe 2026-11-12): abren al centro y desde ahí no bailan (ADR-0185). Ver `components/ui/HojasAlCentro.tsx`.

describe("dónde abre una hoja al centro", () => {
  it("al abrir, al centro de la ventana", () => {
    expect(bordeDeArriba(900, 500, null)).toBe(200);
  });
  it("una hoja casi tan alta como la ventana no pasa el tope de arriba (8 %)", () => {
    expect(bordeDeArriba(900, 860, null)).toBe(72);
  });
  it("después de abrir, su contenido crece y el borde de arriba no se mueve mientras quepa", () => {
    expect(bordeDeArriba(900, 600, 200)).toBe(200);
    // Se achica: tampoco baja (bajar sería «bailar»).
    expect(bordeDeArriba(900, 300, 200)).toBe(200);
  });
  it("si ya no cabe, sube lo justo para caber, sin pasar el tope", () => {
    // 900 − 750 − 24 = 126
    expect(bordeDeArriba(900, 750, 200)).toBe(126);
    expect(bordeDeArriba(900, 900, 200)).toBe(72);
  });
});

describe("dónde se enciende", () => {
  it("todo Recibir está dentro de <HojasAlCentro>", () => {
    const layout = readFileSync(join(__dirname, "..", "app", "(app)", "recibir", "layout.tsx"), "utf8");
    expect(layout).toMatch(/<HojasAlCentro>\{children\}<\/HojasAlCentro>/);
  });
  it("<Modal> lo lee solo: el borde medido pisa el 8vh en su contenedor", () => {
    const modal = readFileSync(join(__dirname, "..", "components", "ui", "Modal.tsx"), "utf8");
    expect(modal).toContain("useHojaAlCentro(deCara, hojaMontada)");
    expect(modal).toContain("paddingTop: arribaAlCentro");
  });
});
