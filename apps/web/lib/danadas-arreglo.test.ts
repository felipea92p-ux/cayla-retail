import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  argumentosDeSalida,
  camposGuiaSalida,
  contarDanadasViejas,
  DIAS_AVISO_DANADA,
  diasEnArreglo,
  leerEnArreglo,
  leerRespuestaSalida,
  leerRutaArreglo,
  argumentosDeNoSePudo,
  camposGuiaNoSePudo,
  leerRespuestaNoSePudo,
  PARAMETROS_RPC_NO_SE_PUDO,
  problemaDeNoSePudo,
  RPC_NO_SE_PUDO,
  PARAMETROS_RPC_SACAR,
  problemaDeSalida,
  RPC_SACAR_A_ARREGLAR,
  RUTAS_ARREGLO,
  textoEnArreglo,
  tituloExitoSalida,
  VALORES_RUTA_ARREGLO,
} from "./danadas-arreglo";
import { sePuedeConfirmar } from "./guia-campos";

const MIGRACION = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261029032000_danadas_salio_a_arreglar.sql"), "utf8").replace(/--[^\n]*/g, "");

describe("el contrato con la base", () => {
  it("la RPC y sus parámetros son los de la migración", () => {
    const m = new RegExp(`create or replace function retail\\.${RPC_SACAR_A_ARREGLAR}\\(([^)]*)\\)`).exec(MIGRACION);
    expect(m).not.toBeNull();
    expect(m![1].split(",").map((p) => p.trim().split(/\s+/)[0])).toEqual([...PARAMETROS_RPC_SACAR]);
  });

  it("las rutas de la pantalla son EXACTAMENTE las que acepta la base (candado y función)", () => {
    const enLaBase = (re: RegExp) => [...(re.exec(MIGRACION)?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(enLaBase(/ruta_arreglo in \(([^)]*)\)/)).toEqual([...VALORES_RUTA_ARREGLO]);
    expect(enLaBase(/p_ruta not in \(([^)]*)\)/)).toEqual([...VALORES_RUTA_ARREGLO]);
  });

  it("los hints que la pantalla lee existen y la nota vale lo mismo que en la base (3 a 200)", () => {
    for (const hint of ["arreglo_sin_modulo", "arreglo_sin_tienda", "arreglo_ruta_invalida", "arreglo_no_existe", "arreglo_ya_resuelta", "arreglo_ya_en_arreglo", "responsable_requerido"]) {
      expect(MIGRACION, hint).toContain(`'${hint}'`);
    }
    expect(MIGRACION).toContain("between 3 and 200");
  });

  it("los argumentos llevan los nombres del contrato; sin nota no se manda", () => {
    expect(argumentosDeSalida("d1", "taller", "  con Rosa ")).toEqual({ p_id: "d1", p_ruta: "taller", p_nota: "con Rosa" });
    expect(argumentosDeSalida("d1", "cerca", "   ")).toEqual({ p_id: "d1", p_ruta: "cerca" });
    for (const a of [argumentosDeSalida("d1", "taller", "x y z"), argumentosDeSalida("d1", "cerca", "")]) {
      for (const k of Object.keys(a)) expect([...PARAMETROS_RPC_SACAR]).toContain(k);
    }
  });

  it("la respuesta se lee solo si calza con el contrato", () => {
    expect(leerRespuestaSalida({ ya_registrada: false, id: "d1", ruta: "taller" })).toEqual({ ya_registrada: false, id: "d1", ruta: "taller" });
    expect(leerRespuestaSalida({ ya_registrada: "no", id: "d1", ruta: "taller" })).toBeNull();
    expect(leerRespuestaSalida({ ya_registrada: true, id: "", ruta: "taller" })).toBeNull();
    expect(leerRespuestaSalida({ ya_registrada: true, id: "d1", ruta: "luna" })).toBeNull();
    expect(leerRespuestaSalida(null)).toBeNull();
  });
});

describe("qué falta para marcar la salida", () => {
  it("sin ruta no se puede; la nota es opcional pero, si se escribe, de 3 a 200", () => {
    expect(problemaDeSalida("", "")).not.toBeNull();
    expect(problemaDeSalida("taller", "")).toBeNull();
    expect(problemaDeSalida("taller", "ab")).not.toBeNull();
    expect(problemaDeSalida("cerca", "con Rosa")).toBeNull();
    expect(problemaDeSalida("cerca", "x".repeat(201))).not.toBeNull();
  });

  it("la guía pide la ruta y quién lo hace, y la nota nunca bloquea", () => {
    expect(sePuedeConfirmar(camposGuiaSalida("", "", true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaSalida("taller", "", false))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaSalida("taller", "", true))).toBe(true);
    expect(camposGuiaSalida("taller", "", true).find((c) => c.id === "nota")?.requerido).toBe(false);
  });
});

describe("«No se pudo» (el contrato con la base y sus reglas)", () => {
  const REGRESO = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261029033000_danadas_se_arreglo_o_no_se_pudo.sql"), "utf8").replace(/--[^\n]*/g, "");

  it("la RPC y sus parámetros son los de la migración, y los hints que la pantalla lee existen", () => {
    const m = new RegExp(`create or replace function retail\\.${RPC_NO_SE_PUDO}\\(([^)]*)\\)`).exec(REGRESO);
    expect(m).not.toBeNull();
    expect(m![1].split(",").map((p) => p.trim().split(/\s+/)[0])).toEqual([...PARAMETROS_RPC_NO_SE_PUDO]);
    for (const h of ["arreglo_no_esta_fuera", "arreglo_ya_volvio", "arreglo_ya_resuelta", "arreglo_nota_invalida"]) expect(REGRESO, h).toContain(`'${h}'`);
  });

  it("los argumentos llevan el motivo solo si se escribió; el motivo vale 3 a 200 y nunca bloquea vacío", () => {
    expect(argumentosDeNoSePudo("d1", "  La mancha no sale ")).toEqual({ p_id: "d1", p_motivo: "La mancha no sale" });
    expect(argumentosDeNoSePudo("d1", "   ")).toEqual({ p_id: "d1" });
    expect(problemaDeNoSePudo("")).toBeNull();
    expect(problemaDeNoSePudo("ab")).not.toBeNull();
    expect(problemaDeNoSePudo("x".repeat(201))).not.toBeNull();
    expect(sePuedeConfirmar(camposGuiaNoSePudo("", true))).toBe(true);
    expect(sePuedeConfirmar(camposGuiaNoSePudo("ab", true))).toBe(false);
    expect(sePuedeConfirmar(camposGuiaNoSePudo("", false))).toBe(false);
  });

  it("la respuesta se lee solo si calza", () => {
    expect(leerRespuestaNoSePudo({ ya_registrada: true, id: "d1" })).toEqual({ ya_registrada: true, id: "d1" });
    expect(leerRespuestaNoSePudo({ ya_registrada: "si", id: "d1" })).toBeNull();
    expect(leerRespuestaNoSePudo(null)).toBeNull();
  });
});

describe("el aviso a los 7 días", () => {
  const ahora = new Date("2026-10-30T15:00:00-05:00");
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();

  it("cuenta las que llevan 7 días o más separadas SIN salir a arreglar; las que alguien tiene afuera no", () => {
    expect(DIAS_AVISO_DANADA).toBe(7);
    const filas = [
      { creadoEn: hace(6), enArreglo: null }, // aún no
      { creadoEn: hace(7), enArreglo: null }, // justo
      { creadoEn: hace(20), enArreglo: null },
      { creadoEn: hace(20), enArreglo: { desde: hace(2), ruta: "taller" } }, // alguien la tiene
    ];
    expect(contarDanadasViejas(filas, ahora)).toBe(2);
    expect(contarDanadasViejas([], ahora)).toBe(0);
  });
});

describe("lo que dice la lista", () => {
  const ahora = new Date("2026-10-30T15:00:00-05:00");
  it("«En arreglo · ruta · cuánto»", () => {
    expect(textoEnArreglo({ desde: "2026-10-30T09:00:00-05:00", ruta: "cerca" }, ahora)).toBe("En arreglo · Cerca · salió hoy");
    expect(textoEnArreglo({ desde: "2026-10-29T09:00:00-05:00", ruta: "taller" }, ahora)).toBe("En arreglo · Taller · hace 1 día");
    expect(textoEnArreglo({ desde: "2026-10-27T09:00:00-05:00", ruta: "taller" }, ahora)).toBe("En arreglo · Taller · hace 3 días");
  });

  it("un reloj atrasado nunca da días negativos", () => {
    expect(diasEnArreglo("2026-10-31T09:00:00-05:00", ahora)).toBe(0);
  });

  it("solo se lee lo que trae las dos columnas y una ruta de la lista", () => {
    expect(leerEnArreglo("2026-10-30T09:00:00-05:00", "taller")).toEqual({ desde: "2026-10-30T09:00:00-05:00", ruta: "taller" });
    for (const [d, r] of [[null, "taller"], ["2026-10-30T09:00:00-05:00", null], ["no es fecha", "taller"], ["2026-10-30T09:00:00-05:00", "luna"]] as const) expect(leerEnArreglo(d, r)).toBeNull();
    expect(leerRutaArreglo("taller")).toBe("taller");
    expect(RUTAS_ARREGLO.map((r) => r.corta)).toEqual(["Cerca", "Taller"]);
    expect(tituloExitoSalida("taller")).toContain("Taller");
  });
});
