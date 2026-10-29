import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { argumentosDeLugar, camposGuiaLugar, fraseDejarEn, MAX_LUGAR_DANADAS, MIN_LUGAR_DANADAS, PARAMETROS_RPC_LUGAR, problemaDeLugar, RPC_DEFINIR_LUGAR_DANADAS } from "./danadas-lugar";
import { sePuedeConfirmar } from "./guia-campos";

const MIGRACION = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261029031000_danadas_lugar_de_la_sede.sql"), "utf8").replace(/--[^\n]*/g, "");

describe("el contrato con la base", () => {
  it("la RPC y sus parámetros son los de la migración", () => {
    const m = new RegExp(`create or replace function retail\\.${RPC_DEFINIR_LUGAR_DANADAS}\\(([^)]*)\\)`).exec(MIGRACION);
    expect(m).not.toBeNull();
    expect(m![1].split(",").map((p) => p.trim().split(/\s+/)[0])).toEqual([...PARAMETROS_RPC_LUGAR]);
  });

  it("los límites son los del candado de la base (3 a 80) y los hints que la pantalla lee existen", () => {
    expect(MIGRACION).toContain("between 3 and 80");
    expect([MIN_LUGAR_DANADAS, MAX_LUGAR_DANADAS]).toEqual([3, 80]);
    for (const hint of ["lugar_sin_modulo", "lugar_sin_tienda", "lugar_invalido", "lugar_sede_sin_cuarentena", "responsable_requerido"]) expect(MIGRACION, hint).toContain(`'${hint}'`);
  });

  it("los argumentos llevan los nombres del contrato y el texto sin espacios de más", () => {
    const a = argumentosDeLugar("tru", "  perchero detrás de caja ");
    expect(a).toEqual({ p_ubicacion_id: "tru", p_lugar: "perchero detrás de caja" });
    expect(Object.keys(a).sort()).toEqual([...PARAMETROS_RPC_LUGAR].sort());
  });
});

describe("qué falta para guardar el lugar", () => {
  it("vacío borra el lugar (no es un problema); 1 o 2 letras y más de 80, sí", () => {
    expect(problemaDeLugar("")).toBeNull();
    expect(problemaDeLugar("   ")).toBeNull();
    expect(problemaDeLugar(" ab ")).not.toBeNull();
    expect(problemaDeLugar("abc")).toBeNull();
    expect(problemaDeLugar("x".repeat(80))).toBeNull();
    expect(problemaDeLugar("x".repeat(81))).not.toBeNull();
  });

  it("la guía pide el lugar válido y quién lo hace; sin eso no se confirma", () => {
    expect(sePuedeConfirmar(camposGuiaLugar("", true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaLugar("perchero", false))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaLugar("perchero", true))).toBe(true);
    expect(sePuedeConfirmar(camposGuiaLugar("ab", true))).toBe(false);
  });
});

describe("la frase para quien tiene la prenda en la mano", () => {
  it("dice dónde dejarla, y sin lugar marcado no inventa uno", () => {
    expect(fraseDejarEn("  perchero detrás de caja ")).toBe("Déjala en: perchero detrás de caja.");
    expect(fraseDejarEn(null)).toBeNull();
    expect(fraseDejarEn("   ")).toBeNull();
  });
});
