import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SILUETA_GENERICA, SILUETAS_PROPIAS, siluetaDe } from "./plan-piso-siluetas";

describe("la silueta de cada grupo", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261006100000_plan_del_piso_grupos_del_mix.sql", import.meta.url), "utf8").replace(/--[^\n]*/g, "");
  const filas = [...sql.matchAll(/\('([a-z_]+)',\s*'[^']+',\s*'(?:destino|rutina|ocasional|estacional|conveniencia)',\s*(true|false),\s*\d+\)/g)];
  const sembrados = filas.map((m) => m[1]!);

  it("los 8 grupos que siembra la base (leídos del SQL real) tienen cada uno su silueta propia", () => {
    expect(sembrados).toHaveLength(8);
    for (const clave of sembrados) expect(siluetaDe(clave), clave).toBe(clave);
  });

  it("no sobra ninguna silueta propia: todas son de un grupo que la base siembra", () => {
    for (const clave of SILUETAS_PROPIAS) expect(sembrados, clave).toContain(clave);
    expect(new Set(SILUETAS_PROPIAS).size).toBe(SILUETAS_PROPIAS.length);
  });

  it("la base siembra como máximo SEIS grupos en el riel: son los seis colores de `--grupo-N`; con uno más, dos grupos compartirían color (y silueta genérica)", () => {
    const enRiel = filas.filter((m) => m[2] === "true");
    expect(enRiel).toHaveLength(6);
    expect(enRiel.length).toBeLessThanOrEqual(6);
  });

  it("un grupo que entra después (por migración, no hay pantalla para crearlos) usa la silueta genérica y nunca se queda sin dibujo", () => {
    expect(siluetaDe("camisas_de_lino")).toBe(SILUETA_GENERICA);
    expect(siluetaDe("")).toBe(SILUETA_GENERICA);
    expect(SILUETAS_PROPIAS as readonly string[]).not.toContain(SILUETA_GENERICA);
  });
});
