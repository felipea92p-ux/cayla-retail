import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FALTA_DETALLE_MOTIVO,
  FALTA_MOTIVO,
  MAX_DETALLE_MOTIVO,
  MOTIVOS_SIN_REGISTRAR,
  faltaEnMotivo,
  motivoParaRegistrar,
  textoDeMotivo,
} from "./prenda-sin-registrar-motivo";

const MIGRACION = readFileSync(new URL("../../../supabase/migrations/20261106233000_motivo_de_la_venta_sin_registrar.sql", import.meta.url), "utf8");

describe("los motivos de la venta sin registrar", () => {
  it("son los cinco que eligió Felipe, en su orden", () => {
    expect(MOTIVOS_SIN_REGISTRAR.map((m) => m.texto)).toEqual([
      "La pistola no la lee",
      "No tiene etiqueta",
      "El sistema dice que no hay",
      "Había cola, fue más rápido",
      "Otro motivo",
    ]);
  });

  it("cada valor es uno de los que acepta la base, en el candado y en registrar_venta", () => {
    const candado = MIGRACION.match(/motivo in \(([^)]*)\)\);/)?.[1] ?? "";
    const enLaFuncion = MIGRACION.match(/'motivo_sin_registrar' in \(([^)]*)\)/)?.[1] ?? "";
    const valores = (lista: string) => [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(valores(candado)).toEqual(MOTIVOS_SIN_REGISTRAR.map((m) => m.valor));
    expect(valores(enLaFuncion)).toEqual(MOTIVOS_SIN_REGISTRAR.map((m) => m.valor));
    expect(MIGRACION).toContain(`left(btrim(coalesce(v_item ->> 'motivo_sin_registrar_detalle', '')), ${MAX_DETALLE_MOTIVO})`);
  });
});

describe("faltaEnMotivo", () => {
  it("sin motivo, o con uno que no es de la lista, pide elegirlo", () => {
    expect(faltaEnMotivo(null, null)).toBe(FALTA_MOTIVO);
    expect(faltaEnMotivo("", "")).toBe(FALTA_MOTIVO);
    expect(faltaEnMotivo("flojera", null)).toBe(FALTA_MOTIVO);
  });

  it("con un motivo de la lista que no es «otro», ya está (el texto no importa)", () => {
    for (const m of MOTIVOS_SIN_REGISTRAR.filter((x) => x.valor !== "otro")) expect(faltaEnMotivo(m.valor, null)).toBeNull();
  });

  it("con «otro» pide el texto, y los blancos no cuentan", () => {
    expect(faltaEnMotivo("otro", null)).toBe(FALTA_DETALLE_MOTIVO);
    expect(faltaEnMotivo("otro", "   ")).toBe(FALTA_DETALLE_MOTIVO);
    expect(faltaEnMotivo("otro", "La trajo de otra tienda")).toBeNull();
  });
});

describe("motivoParaRegistrar", () => {
  it("manda solo el motivo, sin el texto, si no es «otro»", () => {
    expect(motivoParaRegistrar("cola", "no debería viajar")).toEqual({ motivo_sin_registrar: "cola" });
  });

  it("con «otro» manda el texto sin blancos y recortado como la base", () => {
    expect(motivoParaRegistrar("otro", "  algo raro  ")).toEqual({ motivo_sin_registrar: "otro", motivo_sin_registrar_detalle: "algo raro" });
    expect(motivoParaRegistrar("otro", "x".repeat(200)).motivo_sin_registrar_detalle).toHaveLength(MAX_DETALLE_MOTIVO);
  });

  it("sin motivo válido no manda nada (la base lo deja sin motivo)", () => {
    expect(motivoParaRegistrar(null, "x")).toEqual({});
    expect(motivoParaRegistrar("raro", "x")).toEqual({});
  });
});

describe("textoDeMotivo", () => {
  it("dice el motivo con las palabras de la lista", () => {
    expect(textoDeMotivo("pistola_no_lee", null)).toBe("La pistola no la lee");
    expect(textoDeMotivo("sistema_sin_stock", null)).toBe("El sistema dice que no hay");
  });

  it("con «otro» dice lo que escribió la caja", () => {
    expect(textoDeMotivo("otro", " La trajo de otra tienda ")).toBe("Otro: La trajo de otra tienda");
    expect(textoDeMotivo("otro", null)).toBe("Otro motivo");
  });

  it("una venta de antes, sin motivo, no dice nada", () => {
    expect(textoDeMotivo(null, null)).toBeNull();
  });
});
