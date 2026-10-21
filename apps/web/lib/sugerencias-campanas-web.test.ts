import { describe, expect, it } from "vitest";
import { AMBIENTES_CAMPANA } from "@cayla-retail/shared";
import { AMBIENTES_CON_EJEMPLOS, TEXTOS_NEUTROS, TOPES_DE_TEXTO, sugerirTextos } from "./sugerencias-campanas-web";

// ADR-0290: la sugerencia sigue lo que la persona ya eligió. Esta prueba recorre TODOS los valores del control (el ambiente).

describe("sugerirTextos: los ejemplos siguen al ambiente", () => {
  it("cada ambiente del catálogo tiene sus ejemplos propios (totalidad)", () => {
    for (const clave of AMBIENTES_CON_EJEMPLOS) {
      const s = sugerirTextos(clave);
      expect(s, clave).not.toEqual(TEXTOS_NEUTROS);
      expect(s.titular.trim(), clave).not.toBe("");
      expect(s.bajada.trim(), clave).not.toBe("");
      expect(s.boton.trim(), clave).not.toBe("");
    }
  });

  it("sin contradicción: el titular de un ambiente no es el de otro", () => {
    const titulares = AMBIENTES_CAMPANA.map((a) => sugerirTextos(a.clave).titular);
    expect(new Set(titulares).size).toBe(titulares.length);
  });

  it("el ejemplo habla de SU campaña (no del Aniversario con Black Week elegido)", () => {
    expect(sugerirTextos("cyber").titular).toBe("Black Week");
    expect(sugerirTextos("navidad").titular).toContain("Navidad");
    expect(sugerirTextos("madre").bajada).not.toMatch(/aniversario/i);
    expect(sugerirTextos("gato").titular).toContain("Gato");
  });

  it("sin ambiente, o con una clave que el catálogo no conoce, salen los neutros (nunca el ejemplo de otra campaña)", () => {
    expect(sugerirTextos(null)).toEqual(TEXTOS_NEUTROS);
    expect(sugerirTextos(undefined)).toEqual(TEXTOS_NEUTROS);
    expect(sugerirTextos("halloween")).toEqual(TEXTOS_NEUTROS);
    expect(sugerirTextos("")).toEqual(TEXTOS_NEUTROS);
  });

  it("sigue al control: A → B → A da lo mismo, y es estable (sin azar)", () => {
    const a1 = sugerirTextos("cyber");
    sugerirTextos("navidad");
    expect(sugerirTextos("cyber")).toEqual(a1);
    expect(sugerirTextos("cyber")).toBe(sugerirTextos("cyber"));
  });

  it("ningún ejemplo pasa del tope de su caja (a 375 px un placeholder largo se corta a media palabra)", () => {
    for (const s of [...AMBIENTES_CON_EJEMPLOS.map((c) => sugerirTextos(c)), TEXTOS_NEUTROS]) {
      expect(s.titular.length).toBeLessThanOrEqual(TOPES_DE_TEXTO.titular);
      expect(s.bajada.length).toBeLessThanOrEqual(TOPES_DE_TEXTO.bajada);
      expect(s.boton.length).toBeLessThanOrEqual(TOPES_DE_TEXTO.boton);
    }
  });

  it("los topes son los de la base (los CHECK de campana_web_disenos)", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../../supabase/migrations/20261021161000_campanas_web_modulo_y_lista.sql", import.meta.url), "utf8");
    const tope = (columna: string) => Number(new RegExp(`${columna} is null or char_length\\(${columna}\\) between 1 and (\\d+)`).exec(sql)?.[1]);
    expect(tope("titular")).toBe(TOPES_DE_TEXTO.titular);
    expect(tope("bajada")).toBe(TOPES_DE_TEXTO.bajada);
    expect(tope("boton")).toBe(TOPES_DE_TEXTO.boton);
  });
});
