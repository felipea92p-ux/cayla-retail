// Pruebas del detector de choques de `/abrir-pr` (ADR-0381): la parte pura, sin git ni red.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { detectarChoques, funcionesQueToca } from "./choques.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const vacio = { archivos: [], adrs: [], migraciones: [], funciones: [] };

test("funcionesQueToca: create/replace, alter, drop y el reemplazo anclado; no las menciones ni pg_temp", () => {
  const sql = `
    -- create or replace function retail.solo_mencionada(uuid) en un comentario no cuenta
    create or replace function pg_temp.reemplazar_anclado(p text) returns void language plpgsql as $f$ begin end $f$;
    create or replace function retail.fn_nueva(p uuid) returns int as $$ select retail.fn_leida(p) $$ language sql;
    CREATE FUNCTION "retail"."Mayus"() returns int as $$ select 1 $$ language sql;
    alter function retail.fn_alterada(uuid) owner to postgres;
    drop function if exists retail.fn_vieja(text);
    select pg_temp.reemplazar_anclado('retail.registrar_venta(uuid, jsonb)', $v$a$v$, $n$b$n$);`;
  assert.deepEqual(funcionesQueToca(sql), ["fn_alterada", "fn_nueva", "fn_vieja", "mayus", "registrar_venta"]);
});

test("funcionesQueToca lee las migraciones reales: el parche de ADR-0377 toca fn_analisis_sede", () => {
  const sql = readFileSync(join(RAIZ, "supabase/migrations/20261010233000_analisis_y_frescura_ignoran_familias_apagadas.sql"), "utf8");
  assert.ok(funcionesQueToca(sql).includes("fn_analisis_sede"));
  assert.ok(!funcionesQueToca(sql).includes("reemplazar_anclado"));
});

test("el mismo número de migración o de ADR que otro PR o que main es SEGURO", () => {
  const mio = { ...vacio, adrs: ["0381"], migraciones: ["20261012150000"] };
  const otro = { ...vacio, numero: 9, titulo: "Plan", adrs: ["0381"], migraciones: ["20261012150000"] };
  const r = detectarChoques({ mio, otros: [otro], main: { adrs: [], migraciones: [] } });
  assert.deepEqual(r.seguros.map((c) => c.que), ["ADR 0381", "migración 20261012150000"]);
  const conMain = detectarChoques({ mio, otros: [], main: { adrs: ["0381"], migraciones: [] } });
  assert.deepEqual(conMain.seguros.map((c) => `${c.que} ${c.con}`), ["ADR 0381 main"]);
});

test("un número reservado por otra rama es SEGURO; uno mío, no", () => {
  const reservas = [{ tipo: "adr", numero: "0381", rama: "claude/otra" }, { tipo: "migracion", numero: "20261012150000", rama: "claude/yo" }];
  const mio = { ...vacio, adrs: ["0381"], migraciones: ["20261012150000"] };
  const r = detectarChoques({ mio, otros: [], main: { adrs: [], migraciones: [] }, reservas, rama: "claude/yo" });
  assert.equal(r.seguros.length, 1);
  assert.match(r.seguros[0].detalle, /claude\/otra/);
});

test("la misma función de la base y el mismo archivo de registro son PROBABLES; otros archivos, solo informativos", () => {
  const mio = { ...vacio, archivos: ["apps/web/lib/menu.ts", "apps/web/components/A.tsx", "scripts/ci/pruebas-postgres.mjs"], funciones: ["registrar_venta", "fn_x"] };
  const otro = { ...vacio, numero: 7, titulo: "Abrir producción", archivos: ["apps/web/lib/menu.ts", "apps/web/components/A.tsx", "scripts/ci/pruebas-postgres.mjs"], funciones: ["registrar_venta"] };
  const r = detectarChoques({ mio, otros: [otro], main: { adrs: [], migraciones: [] } });
  assert.deepEqual(r.seguros, []);
  assert.deepEqual(r.probables.map((c) => c.que), ["retail.registrar_venta", "apps/web/lib/menu.ts", "scripts/ci/pruebas-postgres.mjs"]);
  assert.deepEqual(r.compartidos.map((c) => c.detalle), ["apps/web/components/A.tsx"]);
});

test("sin nada en común no dice nada", () => {
  const r = detectarChoques({ mio: { ...vacio, archivos: ["a"] }, otros: [{ ...vacio, numero: 1, titulo: "x", archivos: ["b"] }], main: { adrs: [], migraciones: [] } });
  assert.deepEqual(r, { seguros: [], probables: [], compartidos: [] });
});
