import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sugerirFicha, SUGERENCIA_NEUTRA, SUGERENCIAS_POR_CATEGORIA } from "./sugerencias-gasto-fijo";

// Las categorías que trae el sistema, tal como las siembra la migración (la fuente real de los códigos).
const SEMILLA = readFileSync(join(__dirname, "../../../supabase/migrations/20260924235000_finanzas_plan_de_cuentas_y_categorias_gasto.sql"), "utf8");
const CODIGOS = [...(SEMILLA.split("insert into retail.categorias_gasto")[1] ?? "").matchAll(/^\s*\('([a-z_]+)',\s+'/gm)].map((m) => m[1]);

describe("los ejemplos de la ficha siguen a la categoría (ADR-0290)", () => {
  it("la siembra trae las 10 categorías de siempre", () => {
    expect(CODIGOS).toHaveLength(10);
  });
  it("totalidad: toda categoría del sistema tiene su ejemplo propio, completo y distinto del neutro", () => {
    for (const c of CODIGOS) {
      const s = SUGERENCIAS_POR_CATEGORIA[c];
      expect(s, c).toBeDefined();
      expect(s.beneficiario.trim(), c).not.toBe("");
      expect(s.codigo.trim(), c).not.toBe("");
      expect(s.recibo.trim(), c).not.toBe("");
      expect(s.beneficiario, c).not.toBe(SUGERENCIA_NEUTRA.beneficiario);
    }
    expect(Object.keys(SUGERENCIAS_POR_CATEGORIA).sort()).toEqual([...CODIGOS].sort());
  });
  it("sin contradicción: el alquiler no habla de luz ni la luz de contratos de local", () => {
    expect(sugerirFicha("alquileres").beneficiario).toMatch(/propietario/i);
    expect(sugerirFicha("alquileres").codigo).toMatch(/contrato/i);
    expect(sugerirFicha("servicios_basicos").codigo).toMatch(/suministro/i);
    expect(sugerirFicha("seguros").codigo).toMatch(/póliza/i);
    expect(sugerirFicha("alquileres").codigo).not.toMatch(/suministro|póliza/i);
    expect(sugerirFicha("servicios_basicos").beneficiario).not.toMatch(/propietario/i);
  });
  it("sin categoría, o con una que un líder creó después, el ejemplo es el neutro (nunca el de otra)", () => {
    expect(sugerirFicha("")).toEqual(SUGERENCIA_NEUTRA);
    expect(sugerirFicha("atencion_al_personal")).toEqual(SUGERENCIA_NEUTRA);
    expect(sugerirFicha("categoria_nueva_de_un_lider")).toEqual(SUGERENCIA_NEUTRA);
  });
  it("sigue al control y es estable: A → B → A da lo mismo, sin azar", () => {
    const a1 = sugerirFicha("alquileres");
    sugerirFicha("seguros");
    expect(sugerirFicha("alquileres")).toEqual(a1);
  });
  it("cabe a 375 px: ningún ejemplo pasa de 48 letras (un placeholder largo se corta a media palabra)", () => {
    for (const s of [SUGERENCIA_NEUTRA, ...Object.values(SUGERENCIAS_POR_CATEGORIA)]) {
      for (const t of [s.beneficiario, s.codigo, s.recibo]) expect(t.length, t).toBeLessThanOrEqual(48);
    }
  });
});
