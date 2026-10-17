import { describe, expect, it } from "vitest";
import {
  anioLima,
  anuncios,
  fechaCorta,
  fechaLarga,
  interpretarPortada,
  partirTitulo,
  pctTexto,
  PORTADA_SIN_DATOS,
} from "./portada";

const ANIVERSARIO = { nombre: "Aniversario CAYLA", pct: 12, hasta: "2026-10-21" };

describe("interpretarPortada", () => {
  it("acepta lo que devuelve retail.tienda_portada()", () => {
    expect(interpretarPortada({ campana: ANIVERSARIO })).toEqual({ campana: ANIVERSARIO });
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, hasta: null } }).campana?.hasta).toBeNull();
    expect(interpretarPortada({ campana: null })).toEqual({ campana: null });
  });

  it("si la base responde algo raro, la portada sale sin campaña (no se cae)", () => {
    for (const raro of [null, undefined, "x", 3, {}, { campana: { nombre: "", pct: 12, hasta: null } }, { campana: { ...ANIVERSARIO, pct: 0 } },
      { campana: { ...ANIVERSARIO, pct: "12" } }, { campana: { ...ANIVERSARIO, hasta: "21/10/2026" } }]) {
      expect(interpretarPortada(raro)).toEqual(PORTADA_SIN_DATOS);
    }
  });
});

describe("textos de la campaña", () => {
  it("parte el nombre en dos líneas: la última palabra en cursiva", () => {
    expect(partirTitulo("Aniversario CAYLA")).toEqual(["Aniversario", "CAYLA"]);
    expect(partirTitulo("Día de la Madre")).toEqual(["Día de la", "Madre"]);
    expect(partirTitulo("  CyberWow ")).toEqual(["CyberWow", ""]);
  });

  it("el % sin ceros de más", () => {
    expect(pctTexto(12)).toBe("12");
    expect(pctTexto(12.5)).toBe("12.5");
    expect(pctTexto(12.0)).toBe("12");
  });

  it("las fechas, en Lima", () => {
    expect(fechaLarga("2026-10-21")).toBe("21 de octubre");
    expect(fechaCorta("2026-10-21")).toMatch(/^21 oct\.?$/);
  });

  it("la franja de arriba: la campaña primero; sin campaña, solo las frases fijas", () => {
    const con = anuncios(ANIVERSARIO);
    // El «%» va pegado a su número con un espacio que no se parte.
    expect(con[0]).toMatch(/^Aniversario CAYLA · −12\u00a0% hasta el 21 oct\.?$/);
    expect(con).toHaveLength(4);
    expect(anuncios({ ...ANIVERSARIO, hasta: null })[0]).toBe("Aniversario CAYLA · −12\u00a0%");
    expect(anuncios(null)).toEqual(["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", "Crea tu cuenta y forma parte del Club CAYLA"]);
  });

  it("con cuenta, la franja no invita a crear la cuenta: recuerda dónde están los beneficios del Club", () => {
    expect(anuncios(null, true)).toEqual(["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", "Tus beneficios del Club CAYLA están en Mi perfil"]);
    expect(anuncios(ANIVERSARIO, true)).not.toContain("Crea tu cuenta y forma parte del Club CAYLA");
  });
});


describe("anioLima", () => {
  it("el año de Lima, no el del servidor (el 31 a las 23:30 en Lima ya es 1 de enero en UTC)", () => {
    expect(anioLima(new Date("2027-01-01T04:30:00Z"))).toBe(2026);
    expect(anioLima(new Date("2027-01-01T05:30:00Z"))).toBe(2027);
  });
});
