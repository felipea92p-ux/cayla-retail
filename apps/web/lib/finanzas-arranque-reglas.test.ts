import { describe, expect, it } from "vitest";
import {
  avisoAntesDelCorte,
  baseTraeElCorte,
  consecuenciaCorte,
  corteParaBase,
  SIN_CORTE,
  fechaDelCorte,
  leerInicioFinanzas,
  mesAntesDelCorte,
  opcionesCorte,
  primerMesCompleto,
} from "./finanzas-arranque-reglas";

describe("leerInicioFinanzas — la fecha que manda la base", () => {
  it("lee un día 1", () => expect(leerInicioFinanzas({ inicio_finanzas: "2026-10-01" })).toBe("2026-10-01"));
  it("sin corte es null", () => {
    expect(leerInicioFinanzas({ inicio_finanzas: null })).toBeNull();
    expect(leerInicioFinanzas({})).toBeNull();
    expect(leerInicioFinanzas(null)).toBeNull();
  });
  it("lo que no es un día 1 se ignora (la base ya lo impide; aquí no se inventa un corte)", () => {
    expect(leerInicioFinanzas({ inicio_finanzas: "2026-10-15" })).toBeNull();
    expect(leerInicioFinanzas({ inicio_finanzas: "basura" })).toBeNull();
    expect(leerInicioFinanzas({ inicio_finanzas: 20261001 })).toBeNull();
  });
  it("acepta una marca con hora", () => expect(leerInicioFinanzas({ inicio_finanzas: "2026-10-01T00:00:00" })).toBe("2026-10-01"));
});

describe("baseTraeElCorte — ¿ya se pegó la migración?", () => {
  it("con la clave (aunque sea null) sí; sin ella, no", () => {
    expect(baseTraeElCorte({ minimo_caja: 1, inicio_finanzas: null })).toBe(true);
    expect(baseTraeElCorte({ minimo_caja: 1, inicio_finanzas: "2026-10-01" })).toBe(true);
    expect(baseTraeElCorte({ minimo_caja: 1 })).toBe(false);
    expect(baseTraeElCorte(null)).toBe(false);
  });
});

describe("mesAntesDelCorte — qué mes ya no se cuenta", () => {
  it("septiembre es anterior a un corte del 1 de octubre; octubre no", () => {
    expect(mesAntesDelCorte("2026-09", "2026-10-01")).toBe(true);
    expect(mesAntesDelCorte("2026-10", "2026-10-01")).toBe(false);
    expect(mesAntesDelCorte("2026-11", "2026-10-01")).toBe(false);
  });
  it("cruza el año: diciembre de 2025 es anterior a enero de 2026", () => {
    expect(mesAntesDelCorte("2025-12", "2026-01-01")).toBe(true);
    expect(mesAntesDelCorte("2026-01", "2026-01-01")).toBe(false);
  });
  it("sin corte, ningún mes es anterior", () => expect(mesAntesDelCorte("2020-01", null)).toBe(false));
});

describe("palabras del corte", () => {
  it("la fecha en español", () => expect(fechaDelCorte("2026-10-01")).toBe("1 de octubre de 2026"));
  it("el primer mes completo y desde cuándo se cierra", () => {
    expect(primerMesCompleto("2026-10-01")).toEqual({ mes: "2026-10", seCierraDesde: "2026-11-01" });
    expect(primerMesCompleto("2026-12-01")).toEqual({ mes: "2026-12", seCierraDesde: "2027-01-01" });
  });
  it("el aviso de un mes anterior al corte nombra los dos meses", () => {
    expect(avisoAntesDelCorte("2026-10-01")).toBe("Finanzas cuenta desde el 1 de octubre de 2026: octubre es el primer mes completo y se mide al terminar (desde el 1 de noviembre).");
  });
  it("la consecuencia dice qué se corta y qué no", () => {
    const t = consecuenciaCorte("2026-10-01");
    expect(t).toContain("1 de octubre de 2026");
    expect(t).toContain("no se borra");
    expect(t).toContain("impuestos");
    expect(consecuenciaCorte(null)).toContain("cuenta todo");
  });
});

describe("opcionesCorte — el combo de Configuración", () => {
  it("«Sin corte» primero y 12 meses hacia atrás, el de hoy incluido", () => {
    const o = opcionesCorte("2026-10-04", null);
    expect(o[0]).toEqual({ valor: SIN_CORTE, texto: "Sin corte: cuenta todo" });
    expect(o).toHaveLength(13);
    expect(o[1]).toEqual({ valor: "2026-10-01", texto: "Desde Octubre 2026" });
    expect(o[12]!.valor).toBe("2025-11-01");
  });
  it("todo valor elegible es un día 1 (la base lo exige)", () => {
    for (const x of opcionesCorte("2026-03-31", null).slice(1)) expect(x.valor).toMatch(/^\d{4}-\d{2}-01$/);
  });
  it("un corte vigente más viejo que un año se sigue ofreciendo (para verlo elegido)", () => {
    const o = opcionesCorte("2026-10-04", "2024-01-01");
    expect(o.some((x) => x.valor === "2024-01-01")).toBe(true);
  });
  it("un corte vigente dentro del año no se repite", () => {
    const o = opcionesCorte("2026-10-04", "2026-10-01");
    expect(o.filter((x) => x.valor === "2026-10-01")).toHaveLength(1);
  });
});

describe("corteParaBase — lo que el combo manda", () => {
  it("un mes elegido va como día 1; «sin corte» va como null", () => {
    expect(corteParaBase("2026-10-01")).toBe("2026-10-01");
    expect(corteParaBase(SIN_CORTE)).toBeNull();
    expect(corteParaBase("")).toBeNull();
  });
  it("lo que no es un día 1 nunca se manda como fecha", () => expect(corteParaBase("2026-10-15")).toBeNull());
});
