import { describe, expect, it } from "vitest";
import { reglasDelClub } from "./club-publico";

const CONFIG = { puntosPorSol: 1, solesPor100: 5, canjeMinimo: 200, compraMinimaX: 3, vigenciaDias: 7, regaloCumple: 100 };

describe("las reglas de la página pública del Club", () => {
  it("con la configuración de la caja, dice sus cifras", () => {
    expect(reglasDelClub(CONFIG).map((r) => r.titulo)).toEqual([
      "1 punto por cada S/ 1",
      "100 puntos valen S/ 5",
      "Los cambias desde 200 puntos",
      "Tu cupón vale 7 días",
      "+100 puntos en tu cumpleaños",
    ]);
    expect(reglasDelClub(CONFIG)[2].texto).toBe("Un cupón de S/ 10 o más, de 100 en 100, en la web o en caja.");
    expect(reglasDelClub(CONFIG)[3].texto).toContain("desde 3 veces su valor");
    expect(reglasDelClub({ ...CONFIG, puntosPorSol: 2, vigenciaDias: 1, compraMinimaX: 2.5 }).map((r) => r.titulo)[0]).toBe("2 puntos por cada S/ 1");
    expect(reglasDelClub({ ...CONFIG, vigenciaDias: 1, compraMinimaX: 2.5 })[3]).toMatchObject({ titulo: "Tu cupón vale 1 día", texto: expect.stringContaining("2.50 veces") });
  });

  it("sin la base, las mismas cinco reglas sin ninguna cifra", () => {
    const sin = reglasDelClub(null);
    expect(sin).toHaveLength(5);
    expect(sin.every((r) => !/\d/.test(r.titulo))).toBe(true);
    expect(sin.filter((r) => /\d/.test(r.texto)).map((r) => r.texto)).toEqual([
      "Cada 100 puntos valen un descuento, en un cupón con código.",
      "Desde un mínimo de puntos, de 100 en 100, en la web o en caja.",
    ]);
  });
});
