import { describe, expect, it } from "vitest";
import { avanceDelMes, claveUnidad, colorDeFijo, diaDelFijo, diasDelMes, mesConTopes, pagosEnLaLinea, unidadesDeFijos } from "./gastos-config-reglas";

const fijo = (id: string, fechaEsperada: string, ubicacionId: string | null = null, ubicacionNombre = "") => ({ id, descripcion: id, monto: 100, fechaEsperada, ubicacionId, ubicacionNombre });

describe("las unidades de los fijos", () => {
  it("las sedes sin repetir y la empresa al final", () => {
    const u = unidadesDeFijos([fijo("a", "2026-11-01"), fijo("b", "2026-11-02", "t", "Tienda Lima"), fijo("c", "2026-11-03", "t", "Tienda Lima"), fijo("d", "2026-11-03", "x", "Taller")]);
    expect(u.map((x) => x.clave)).toEqual(["t", "x", "empresa"]);
    expect(u[0]?.nombre).toBe("Lima");
  });

  it("sin fijos de la empresa no aparece", () => {
    expect(unidadesDeFijos([fijo("b", "2026-11-02", "t", "Tienda Lima")]).map((x) => x.clave)).toEqual(["t"]);
  });

  it("la clave y el color de cada una", () => {
    expect(claveUnidad({ ubicacionId: null })).toBe("empresa");
    expect(colorDeFijo({ ubicacionId: null, ubicacionNombre: "" })).toBe("emp");
    expect(colorDeFijo({ ubicacionId: "t", ubicacionNombre: "Tienda Lima" })).toBe("lim");
    expect(colorDeFijo({ ubicacionId: "x", ubicacionNombre: "Taller" })).toBe("tal");
  });
});

describe("la línea del mes", () => {
  it("el día sale de la fecha que dio la base, también en fin de mes", () => {
    expect(diaDelFijo({ fechaEsperada: "2026-02-28" })).toBe(28);
    expect(diasDelMes("2026-02-10")).toBe(28);
    expect(diasDelMes("2028-02-10")).toBe(29);
    expect(diasDelMes("2026-11-05")).toBe(30);
  });

  it("el día 1 va al inicio, el último al final y los del mismo día se apilan", () => {
    const l = pagosEnLaLinea([fijo("c", "2026-11-30"), fijo("a", "2026-11-01"), fijo("b", "2026-11-01")], 30);
    expect(l.map((f) => [f.id, f.x, f.piso])).toEqual([["a", 0, 0], ["b", 0, 1], ["c", 1, 0]]);
  });

  it("no se sale de la línea aunque el mes tenga menos días", () => {
    expect(pagosEnLaLinea([fijo("a", "2026-11-31")], 30)[0]?.x).toBe(1);
  });

  it("no pierde ni cambia la lista original", () => {
    const original = [fijo("b", "2026-11-09"), fijo("a", "2026-11-02")];
    expect(pagosEnLaLinea(original, 30)).toHaveLength(2);
    expect(original[0]?.id).toBe("b");
  });

  it("el avance va de 0 el primer día a 1 el último", () => {
    expect(avanceDelMes("2026-11-01")).toBe(0);
    expect(avanceDelMes("2026-11-30")).toBe(1);
    expect(avanceDelMes("2026-11-16")).toBeCloseTo(15 / 29);
  });
});

describe("los topes", () => {
  it("un mes sin ninguno pide partir de algo", () => {
    expect(mesConTopes({ montos: {} })).toBe(false);
    expect(mesConTopes({ montos: { "empresa|63": 500 } })).toBe(true);
  });
});
