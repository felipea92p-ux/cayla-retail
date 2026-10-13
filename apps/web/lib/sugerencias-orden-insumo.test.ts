import { describe, expect, it } from "vitest";
import { MAX_CANTIDAD, MAX_DESCRIPCION, sugerirCantidadInsumo, sugerirDescripcionInsumo } from "./sugerencias-orden-insumo";
import { UNIDADES_INSUMO, TIPOS_INSUMO } from "./insumos-reglas";

// Los ejemplos de «Nueva orden de insumos» siguen al insumo elegido (CLAUDE.md «Sugerencias coherentes», ADR-0290). La prueba recorre
// TODOS los valores del catálogo de insumos (las seis unidades y los dos tipos de `insumos-reglas.ts`, que son los candados de la tabla
// `insumos`): totalidad, sin contradicción, neutro sin contexto, sigue al control (A → B → A), estable y cabe en su caja.

const UNIDADES = Object.keys(UNIDADES_INSUMO);
const TIPOS = TIPOS_INSUMO.map((t) => t.valor);
const NUMERO_DEL_EJEMPLO = (texto: string) => texto.replace(/^Ej\.\s*/, "");

describe("la cantidad sigue a la unidad del insumo", () => {
  it("toda unidad del catálogo tiene su ejemplo, y es un número que la base acepta", () => {
    for (const u of UNIDADES) {
      const { texto } = sugerirCantidadInsumo(u);
      expect(texto, u).toMatch(/^Ej\. \d+(\.\d{1,3})?$/);
      const n = Number(NUMERO_DEL_EJEMPLO(texto));
      expect(n > 0 && n <= 99_999.999, u).toBe(true);
    }
  });
  it("sin contradicción: lo que se mide (metros, kilos) lleva decimales en el ejemplo; lo que se cuenta (conos, unidades, pares, docenas), no", () => {
    for (const u of ["metro", "kilo"]) expect(NUMERO_DEL_EJEMPLO(sugerirCantidadInsumo(u).texto), u).toContain(".");
    for (const u of ["cono", "unidad", "par", "docena"]) expect(NUMERO_DEL_EJEMPLO(sugerirCantidadInsumo(u).texto), u).not.toContain(".");
  });
  it("sin insumo, o con una unidad que el catálogo sume mañana, el neutro: «0» (no el ejemplo de otra unidad)", () => {
    expect(sugerirCantidadInsumo(null).texto).toBe("0");
    expect(sugerirCantidadInsumo("rollo").texto).toBe("0");
  });
  it("sigue al control y es estable: metro → cono → metro da lo mismo que al principio", () => {
    const a = sugerirCantidadInsumo("metro").texto;
    expect(sugerirCantidadInsumo("cono").texto).not.toBe(a);
    expect(sugerirCantidadInsumo("metro").texto).toBe(a);
  });
  it("cabe en su caja", () => {
    for (const u of [...UNIDADES, null]) expect(sugerirCantidadInsumo(u).texto.length, String(u)).toBeLessThanOrEqual(MAX_CANTIDAD);
  });
});

describe("la descripción sigue al tipo del insumo", () => {
  it("todo tipo del catálogo tiene su ejemplo, distinto del otro; sin insumo (o un tipo nuevo), solo dice que es opcional", () => {
    const textos = TIPOS.map((t) => sugerirDescripcionInsumo(t).texto);
    for (const t of textos) expect(t).toMatch(/^Ej\. /);
    expect(new Set(textos).size).toBe(TIPOS.length);
    expect(sugerirDescripcionInsumo(null).texto).toBe("Opcional");
    expect(sugerirDescripcionInsumo("hilo-nuevo").texto).toBe("Opcional");
  });
  it("sin contradicción: la tela habla de su acabado (crudo); el avío, de su color, nunca de una tela", () => {
    expect(sugerirDescripcionInsumo("tela").texto).toMatch(/crudo/);
    expect(sugerirDescripcionInsumo("avio").texto).not.toMatch(/crudo|ancho|tela/);
  });
  it("sigue al control, es estable y cabe a 375 px", () => {
    const a = sugerirDescripcionInsumo("tela").texto;
    expect(sugerirDescripcionInsumo("avio").texto).not.toBe(a);
    expect(sugerirDescripcionInsumo("tela").texto).toBe(a);
    for (const t of [...TIPOS, null]) expect(sugerirDescripcionInsumo(t).texto.length, String(t)).toBeLessThanOrEqual(MAX_DESCRIPCION);
  });
});
