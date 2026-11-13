import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0590: cómo se consigue una prenda por conseguir (compra | taller). La migración parcha dos funciones vivas con reemplazos anclados:
// si el texto que ancla no aparece EXACTAMENTE una vez en la definición de la que parte, la migración aborta en producción. Esta prueba
// lo comprueba contra el texto del repo, sin base: el CI de Postgres es el juez final.
const RAIZ = join(__dirname, "../../../supabase/migrations");
const leer = (n: string) => readFileSync(join(RAIZ, n), "utf8");
const MIGRACION = leer("20261031170000_pedidos_web_conseguir_via.sql");
const MODELO = leer("20261014235000_pedidos_web_modelo.sql");

/** El cuerpo de una función de `modelo`: de su `create or replace` hasta el siguiente. */
function cuerpo(firma: string): string {
  const ini = MODELO.indexOf(`create or replace function ${firma}`);
  expect(ini, `no está ${firma}`).toBeGreaterThan(-1);
  const sig = MODELO.indexOf("\ncreate or replace function ", ini + 10);
  return MODELO.slice(ini, sig === -1 ? undefined : sig);
}
const veces = (texto: string, parte: string) => texto.split(parte).length - 1;

/** Los pares (firma, ancla viejo) de cada reemplazo de la migración, leídos de su propio texto. */
function reemplazos() {
  const re = /select pg_temp\.reemplazar_anclado\('([^']+)',\s*\$v\$([\s\S]*?)\$v\$,\s*\$v\$([\s\S]*?)\$v\$\)/g;
  return [...MIGRACION.matchAll(re)].map((m) => ({ firma: m[1]!, viejo: m[2]!, nuevo: m[3]! }));
}

describe("pedidos web: cómo se consigue una prenda (compra | taller)", () => {
  it("son cuatro reemplazos anclados, sobre confirmar_pedido_web y fn_pedido_web", () => {
    const r = reemplazos();
    expect(r.map((x) => x.firma)).toEqual([
      "retail.confirmar_pedido_web(uuid, jsonb, integer)",
      "retail.confirmar_pedido_web(uuid, jsonb, integer)",
      "retail.confirmar_pedido_web(uuid, jsonb, integer)",
      "retail.fn_pedido_web(uuid, integer, integer, integer)",
    ]);
  });

  it("cada ancla aparece UNA vez en la función de la que parte (si no, producción aborta)", () => {
    for (const r of reemplazos()) {
      const fn = r.firma.startsWith("retail.confirmar") ? "retail.confirmar_pedido_web(" : "retail.fn_pedido_web(\n";
      const texto = cuerpo(r.firma.startsWith("retail.confirmar") ? fn : "retail.fn_pedido_web(");
      expect(veces(texto, r.viejo), `ancla: ${r.viejo.slice(0, 70)}`).toBe(1);
    }
  });

  it("ninguna migración posterior reescribe esas dos funciones (los anclas siguen siendo los de modelo)", () => {
    for (const n of ["20261015010000_pedidos_web_erp.sql", "20261015041000_pedidos_web_cobrar.sql", "20261015052000_pedidos_web_entregar.sql", "20261015115000_pedidos_web_anular_pagado_lecturas.sql"]) {
      const t = leer(n);
      expect(t, n).not.toMatch(/create or replace function retail\.(confirmar_pedido_web|fn_pedido_web)\(/);
    }
  });

  it("el texto nuevo valida el valor, lo guarda y lo devuelve; la columna solo admite compra o taller", () => {
    expect(MIGRACION).toContain("v_via not in ('compra', 'taller')");
    expect(MIGRACION).toContain("conseguir_via = d ->> 'via'");
    expect(MIGRACION).toContain("'conseguir_via', l.conseguir_via");
    expect(MIGRACION).toContain("check (conseguir_via is null or conseguir_via in ('compra', 'taller'))");
  });

  it("respeta las reglas de producción: partes seguras (sin políticas ni drop trigger) y sin `select … into` dentro de un texto", () => {
    const codigo = MIGRACION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(codigo).not.toMatch(/create policy|drop policy|drop trigger/i);
    expect(MIGRACION).toContain("set lock_timeout = '3s'");
    for (const r of reemplazos()) expect(r.nuevo).not.toMatch(/select[\s\S]*?\binto\b/i);
  });
});
