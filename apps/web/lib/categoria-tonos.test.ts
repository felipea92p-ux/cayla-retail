import { describe, expect, it } from "vitest";
import { PUNTO_DEL_TONO, tonoDeFamilia } from "./categoria-tonos";

// Las seis familias de fábrica, en el orden en que salen en pantalla (`retail.familias.orden`).
const FAMILIAS_EN_PANTALLA = ["indumentaria", "calzado", "accesorios", "bisuteria", "belleza", "papeleria"];

describe("tonoDeFamilia", () => {
  it("dos familias que quedan una junto a la otra nunca comparten tono", () => {
    const tonos = FAMILIAS_EN_PANTALLA.map(tonoDeFamilia);
    for (let i = 1; i < tonos.length; i++) expect(tonos[i], `${FAMILIAS_EN_PANTALLA[i - 1]} y ${FAMILIAS_EN_PANTALLA[i]}`).not.toBe(tonos[i - 1]);
  });

  it("seis familias, cinco tonos: solo se repite uno (pizarra), y no en vecinas", () => {
    const tonos = FAMILIAS_EN_PANTALLA.map(tonoDeFamilia);
    expect(new Set(tonos).size).toBe(5);
    expect(tonos.filter((t) => t === "pizarra")).toHaveLength(2);
  });

  it("una familia nueva (la crea un Líder) o sin familia cae al neutro, no a un color inventado", () => {
    expect(tonoDeFamilia("hogar")).toBe("neutro");
    expect(tonoDeFamilia("")).toBe("neutro");
    expect(tonoDeFamilia(null)).toBe("neutro");
    expect(tonoDeFamilia(undefined)).toBe("neutro");
  });

  it("no hay rojo entre los tonos: es el acento de la marca, máx. 2 usos por pantalla", () => {
    const usados = new Set(FAMILIAS_EN_PANTALLA.map(tonoDeFamilia));
    for (const t of usados) expect(String(PUNTO_DEL_TONO[t])).not.toMatch(/rojo/);
  });

  it("todo tono tiene su puntito de título", () => {
    for (const t of ["taupe", "ambar", "verde", "pizarra", "neutro"] as const) expect(PUNTO_DEL_TONO[t]).toMatch(/^bg-/);
  });
});
