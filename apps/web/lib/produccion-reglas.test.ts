import { describe, expect, it } from "vitest";
import { costoUnitario, semaforoMargen, ETAPAS_MUESTRA, ETAPAS_PRODUCCION } from "./produccion-reglas";

describe("semaforoMargen", () => {
  it("gana con 60% o más de margen", () => {
    expect(semaforoMargen(100, 40)?.tono).toBe("gana");
  });
  it("al filo entre 40% y 60%", () => {
    expect(semaforoMargen(100, 50)?.tono).toBe("filo");
  });
  it("pierde por debajo de 40%", () => {
    expect(semaforoMargen(100, 70)?.tono).toBe("pierde");
  });
  it("sin precio o sin costo no opina", () => {
    expect(semaforoMargen(0, 40)).toBeNull();
    expect(semaforoMargen(100, 0)).toBeNull();
  });
});

describe("costoUnitario", () => {
  it("reparte los tres costos entre las prendas, a 2 decimales como la base", () => {
    expect(costoUnitario(100, 20, 5, 3)).toBe(41.67);
  });
  it("la merma sube el unitario: menos buenas, mismo costo", () => {
    expect(costoUnitario(120, 0, 0, 12)).toBe(10);
    expect(costoUnitario(120, 0, 0, 10)).toBe(12);
  });
  it("sin prendas no divide por cero", () => {
    expect(costoUnitario(120, 0, 0, 0)).toBe(0);
  });
});

describe("etapas", () => {
  it("las claves son las que set_etapa_produccion acepta", () => {
    const claves = [...ETAPAS_MUESTRA, ...ETAPAS_PRODUCCION].map((e) => e.clave);
    expect(claves).toEqual(["patronaje", "muestra", "escalado", "corte", "confeccion", "acabado"]);
  });
});
