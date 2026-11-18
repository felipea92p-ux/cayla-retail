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
import { finDeCampana, partesCuenta } from "./cuenta-regresiva";

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

  it("la franja de arriba: la campaña primero; sin campaña, solo lo que la tienda hace hoy", () => {
    const con = anuncios(ANIVERSARIO, 15);
    // El «%» va pegado a su número con un espacio que no se parte.
    expect(con[0].texto).toMatch(/^Aniversario CAYLA · −12\u00a0% hasta el 21 oct\.?$/);
    expect(con).toHaveLength(4);
    expect(anuncios({ ...ANIVERSARIO, hasta: null }, 15)[0].texto).toBe("Aniversario CAYLA · −12\u00a0%");
    expect(anuncios(null, 15).map((f) => f.texto)).toEqual(["Separa sin pagar", "Cambios en 15 días", "Atención por WhatsApp"]);
  });

  it("el plazo de cambio sale de la base: sin dato, la franja no dice un número", () => {
    expect(anuncios(null, 30)[1].texto).toBe("Cambios en 30 días");
    expect(anuncios(null, null)[1].texto).toBe("Cambios en cualquier tienda");
  });

  it("cada beneficio lleva a donde se explica; la campaña no lleva enlace", () => {
    expect(anuncios(null, 15).every((f) => f.href)).toBe(true);
    expect(anuncios(ANIVERSARIO, 15)[0].href).toBeUndefined();
  });
});

describe("la cuenta regresiva", () => {
  it("la campaña rige todo su último día en Lima (hasta las 23:59:59, UTC−5)", () => {
    expect(new Date(finDeCampana("2026-10-21")).toISOString()).toBe("2026-10-22T04:59:59.000Z");
  });

  it("parte lo que falta en días, horas, minutos y segundos; nunca negativo", () => {
    expect(partesCuenta(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000)).toEqual({ d: 2, h: 3, m: 4, s: 5 });
    expect(partesCuenta(-5000)).toEqual({ d: 0, h: 0, m: 0, s: 0 });
  });
});

describe("anioLima", () => {
  it("el año de Lima, no el del servidor (el 31 a las 23:30 en Lima ya es 1 de enero en UTC)", () => {
    expect(anioLima(new Date("2027-01-01T04:30:00Z"))).toBe(2026);
    expect(anioLima(new Date("2027-01-01T05:30:00Z"))).toBe(2027);
  });
});
