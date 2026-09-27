import { describe, expect, it } from "vitest";
import { coloresParecidos, deltaE2000, distanciaEntreHex, esHexValido, hexALab } from "./color-parecido";

describe("deltaE2000", () => {
  // Pares de referencia publicados con la fórmula (Sharma, Wu y Dalal, 2005). Los 13-17 prueban el salto
  // del matiz alrededor de 0°/360°, que es donde las implementaciones caseras suelen equivocarse.
  const referencia: [[number, number, number], [number, number, number], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
  ];
  it.each(referencia)("%j contra %j = %f", (a, b, esperado) => {
    expect(deltaE2000(a, b)).toBeCloseTo(esperado, 4);
    expect(deltaE2000(b, a)).toBeCloseTo(esperado, 4);
  });

  it("un color contra sí mismo da 0", () => {
    expect(distanciaEntreHex("#A9563A", "#A9563A")).toBe(0);
  });
});

describe("hexALab", () => {
  it("blanco y negro caen en los extremos de la luminosidad", () => {
    expect(hexALab("#FFFFFF")[0]).toBeCloseTo(100, 1);
    expect(hexALab("#000000")[0]).toBeCloseTo(0, 5);
  });
});

describe("esHexValido", () => {
  it("solo #RRGGBB", () => {
    expect(esHexValido("#c9b79c")).toBe(true);
    expect(esHexValido("c9b79c")).toBe(false);
    expect(esHexValido("#fff")).toBe(false);
    expect(esHexValido(null)).toBe(false);
  });
});

describe("coloresParecidos", () => {
  // Hex de producción al 2026-09-25.
  const vocabulario = [
    { codigo: "BEI", nombre: "Beige", hex: "#d9c7a8", familiaColor: "neutro" },
    { codigo: "ARN", nombre: "Arena", hex: "#C9B79C", familiaColor: "tierra" },
    { codigo: "CRU", nombre: "Crudo", hex: "#F0E9DD", familiaColor: "neutro" },
    { codigo: "BLA", nombre: "Blanco", hex: "#f5f5f0", familiaColor: "neutro" },
    { codigo: "GRI", nombre: "Gris", hex: "#8A8A8A", familiaColor: "neutro" },
    { codigo: "PLV", nombre: "Plata vieja", hex: "#8C8D88", familiaColor: "metalico" },
    { codigo: "PLA", nombre: "Plateado", hex: "#B8BCC0", familiaColor: "metalico" },
    { codigo: "TER", nombre: "Terracota", hex: "#A9563A", familiaColor: "tierra" },
    { codigo: "EST", nombre: "Estampado", hex: null, familiaColor: "estampado" },
  ];

  it("encuentra los casi iguales de producción: Beige y Arena", () => {
    const r = coloresParecidos("#d9c7a8", "neutro", vocabulario, { excluir: "BEI" });
    expect(r.map((p) => p.color.codigo)).toEqual(["ARN"]);
    expect(r[0].distancia).toBeGreaterThan(4);
    expect(r[0].distancia).toBeLessThan(4.6);
  });

  it("ordena del más parecido al menos", () => {
    const r = coloresParecidos("#E6DCC8", "neutro", vocabulario);
    expect(r.length).toBeGreaterThan(1);
    for (let i = 1; i < r.length; i++) expect(r[i].distancia).toBeGreaterThanOrEqual(r[i - 1].distancia);
  });

  it("un color liso no se compara con metálicos, ni un metálico con lisos", () => {
    // Plata vieja y Gris son casi el mismo gris plano (ΔE ~3), pero uno es acabado metálico.
    expect(coloresParecidos("#8A8A8A", "neutro", vocabulario, { excluir: "GRI" }).map((p) => p.color.codigo)).not.toContain("PLV");
    expect(coloresParecidos("#8C8D88", "metalico", vocabulario, { excluir: "PLV" }).map((p) => p.color.codigo)).not.toContain("GRI");
  });

  it("sin hex válido no avisa nada, y los colores sin hex no participan", () => {
    expect(coloresParecidos(null, "neutro", vocabulario)).toEqual([]);
    expect(coloresParecidos("#12", "neutro", vocabulario)).toEqual([]);
    expect(coloresParecidos("#d9c7a8", "neutro", vocabulario).map((p) => p.color.codigo)).not.toContain("EST");
  });

  it("un color distinto no dispara el aviso", () => {
    expect(coloresParecidos("#1D5561", "azul", vocabulario)).toEqual([]);
  });
});
