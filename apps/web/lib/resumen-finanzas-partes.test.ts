import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fixture from "./resumen-finanzas.fixture.json";
import { GRUPOS_DEL_RESUMEN, juntarResumen, PARTE_BALANCE, PARTES_DEL_RESUMEN, type GrupoDelResumen } from "./resumen-finanzas-partes";
import { leerResumen } from "./resumen-finanzas-reglas";

// Resumen por bloques (ADR-0661): las tres lecturas juntas tienen que ser la entera. Aquí, del lado de la web (lo que hace `leerResumen` con cada
// respuesta y cómo se juntan); en la base lo exige `pnpm pruebas:resumen-por-partes`.

type Json = Record<string, unknown>;
const ARRIBA = ["hoy", "mes", "mes_anterior", "lider", "ver", "parametros", "unidades"];

/** Lo que devolvería `fn_resumen_finanzas_partes` para un grupo, armado desde la respuesta entera (como hace la base). */
function respuestaDelGrupo(entera: Json, grupo: GrupoDelResumen): Json {
  const partes: readonly string[] = GRUPOS_DEL_RESUMEN[grupo];
  const r: Json = {};
  for (const k of ARRIBA) if (k in entera) r[k] = entera[k];
  for (const p of partes) if (p in entera) r[p] = entera[p];
  r.ms = Object.fromEntries(Object.entries((entera.ms ?? {}) as Json).filter(([k]) => partes.includes(k)));
  return r;
}
const porPartes = (entera: Json) =>
  juntarResumen(leerResumen(respuestaDelGrupo(entera, "rapido")), leerResumen(respuestaDelGrupo(entera, "mes")), leerResumen(respuestaDelGrupo(entera, "avisos")));

describe("los grupos del Resumen", () => {
  it("son una partición de las 13 partes: ninguna falta, ninguna se repite", () => {
    const juntos = Object.values(GRUPOS_DEL_RESUMEN).flat();
    expect(juntos).toHaveLength(PARTES_DEL_RESUMEN.length);
    expect(new Set(juntos)).toEqual(new Set(PARTES_DEL_RESUMEN));
  });

  it("las 13 partes (y la de `balance`, que no es de la entera) son las que valida la función por partes en la base, y los grupos son los de su prueba", () => {
    const raiz = join(__dirname, "..", "..", "..");
    // La definición viva de `fn_resumen_finanzas_partes` es la de la última migración que la reescribe (20261114005000).
    const sql = readFileSync(join(raiz, "supabase/migrations/20261114005000_estado_de_resultados_una_vez.sql"), "utf8");
    const lista = /x <> all \(array\[([\s\S]*?)\]\)\)/.exec(sql)?.[1] ?? "";
    expect(new Set(lista.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1)))).toEqual(new Set([...PARTES_DEL_RESUMEN, PARTE_BALANCE]));
    expect(PARTES_DEL_RESUMEN).not.toContain(PARTE_BALANCE);
    const prueba = readFileSync(join(raiz, "scripts/pruebas/resumen_finanzas_por_partes.mjs"), "utf8");
    for (const [grupo, partes] of Object.entries(GRUPOS_DEL_RESUMEN)) {
      const enLaPrueba = new RegExp(`${grupo}: \\[([^\\]]*)\\]`).exec(prueba)?.[1] ?? "";
      expect(enLaPrueba.match(/"([a-z_]+)"/g)?.map((s) => s.slice(1, -1)), grupo).toEqual([...partes]);
    }
  });
});

describe("juntarResumen", () => {
  const sinMs = <T extends { ms: unknown }>(r: T) => ({ ...r, ms: null });

  it.each(Object.keys(fixture).filter((k) => k !== "_nota"))("las tres lecturas juntas son la entera (%s)", (caso) => {
    const entera = (fixture as unknown as Record<string, Json>)[caso]!;
    expect(sinMs(porPartes(entera))).toEqual(sinMs(leerResumen(entera)));
    expect(porPartes(entera).ms).toEqual(leerResumen(entera).ms);
  });

  it("con el corte de Finanzas (ADR-0332), el mes anterior y el cierre siguen «no aplica» igual que en la entera", () => {
    const entera = { ...(fixture.todas as Json), mes_anterior: "2026-08-01", parametros: { ...((fixture.todas as Json).parametros as Json), inicio_finanzas: "2026-09-01" } };
    const r = porPartes(entera);
    expect(r.antesDelCorte).toBe("2026-09-01");
    expect(r.resultadosAnterior).toEqual({ estado: "no_aplica" });
    expect(r.cierre).toEqual({ estado: "no_aplica" });
    expect(sinMs(r)).toEqual(sinMs(leerResumen(entera)));
  });

  it("una parte que falló en su grupo llega como falla, no como la del otro grupo", () => {
    const entera = { ...(fixture.todas as Json), presupuesto: { falla: "se cortó por tiempo" } };
    expect(porPartes(entera).presupuesto).toEqual({ estado: "falla", mensaje: "se cortó por tiempo" });
  });

  it("control: si un grupo se olvidara una parte, ya no sería la entera", () => {
    const entera = fixture.todas as Json;
    const sinPresupuesto = juntarResumen(
      leerResumen(respuestaDelGrupo(entera, "rapido")),
      leerResumen({ ...respuestaDelGrupo(entera, "mes"), presupuesto: undefined }),
      leerResumen(respuestaDelGrupo(entera, "avisos")),
    );
    expect(sinMs(sinPresupuesto)).not.toEqual(sinMs(leerResumen(entera)));
  });
});
