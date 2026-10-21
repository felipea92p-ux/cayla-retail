import { describe, expect, it } from "vitest";
import {
  AMBIENTES_CAMPANA,
  EFECTOS_CAMPANA,
  FRANJAS_CAMPANA,
  ambienteDeCampana,
  colorDelSello,
  coloresDeCampana,
  comprobarLectura,
  esColorHex,
  ratioContraste,
  textoSobre,
} from "@cayla-retail/shared";

// El catálogo de ambientes y el candado de lectura de las campañas de la tienda web (maqueta docs/maquetas/campanas-tienda-2026-10).
// Lo que vigila: que NINGUNA de las 21 paletas deje letras que no se ven (el líder las elige a ciegas del código), que el candado mida bien
// y que un color propio que no se lee se note.

describe("el catálogo de ambientes", () => {
  it("son los 7 ambientes, con 3 paletas cada uno y claves que no se repiten", () => {
    expect(AMBIENTES_CAMPANA.map((a) => a.clave)).toEqual(["sobrio", "aniversario", "patrias", "madre", "cyber", "gato", "navidad"]);
    expect(new Set(AMBIENTES_CAMPANA.map((a) => a.clave)).size).toBe(AMBIENTES_CAMPANA.length);
    for (const a of AMBIENTES_CAMPANA) expect(a.paletas).toHaveLength(3);
  });

  it("cada ambiente nace con un efecto y una franja que existen, y todo color es #rrggbb", () => {
    for (const a of AMBIENTES_CAMPANA) {
      expect(EFECTOS_CAMPANA).toContain(a.efecto);
      expect(FRANJAS_CAMPANA).toContain(a.franja);
      for (const p of a.paletas) for (const c of [p.fondo, p.texto, p.acento]) expect(esColorHex(c), `${a.clave}/${p.nombre}: ${c}`).toBe(true);
    }
  });

  it("las claves son las del CHECK de la base (no se inventa un ambiente que la base no acepta)", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../../supabase/migrations/20261021161000_campanas_web_modulo_y_lista.sql", import.meta.url), "utf8");
    const check = /plantilla in \(([^)]*)\)/.exec(sql)?.[1] ?? "";
    const enLaBase = [...check.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(enLaBase).toEqual(AMBIENTES_CAMPANA.map((a) => a.clave).sort());
  });

  it("los efectos y las franjas son los del CHECK de la base", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(new URL("../../../supabase/migrations/20261021161000_campanas_web_modulo_y_lista.sql", import.meta.url), "utf8");
    const lista = (columna: string) => [...(new RegExp(`${columna} in \\(([^)]*)\\)`).exec(sql)?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(lista("efecto")).toEqual([...EFECTOS_CAMPANA].sort());
    expect(lista("franja")).toEqual([...FRANJAS_CAMPANA].sort());
  });
});

describe("candado de lectura: todas las paletas del catálogo se leen", () => {
  for (const a of AMBIENTES_CAMPANA) {
    for (const [i, p] of a.paletas.entries()) {
      it(`${a.nombre} · ${p.nombre}`, () => {
        const c = coloresDeCampana(a.clave, i);
        expect(c).toEqual({ fondo: p.fondo, texto: p.texto, acento: p.acento });
        const r = comprobarLectura(c!);
        expect(r.items.filter((x) => !x.ok), JSON.stringify(r.items)).toEqual([]);
        expect(r.ok).toBe(true);
      });
    }
  }
});

describe("ratioContraste y textoSobre", () => {
  it("negro sobre blanco es 21:1 y un color consigo mismo, 1:1", () => {
    expect(ratioContraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratioContraste("#9e1d32", "#9e1d32")).toBeCloseTo(1, 5);
  });

  it("no depende del orden", () => {
    expect(ratioContraste("#2b1016", "#f6ecd8")).toBeCloseTo(ratioContraste("#f6ecd8", "#2b1016"), 10);
  });

  it("elige letras oscuras sobre un fondo claro y claras sobre uno oscuro", () => {
    expect(textoSobre("#f1d9a0")).toBe("#141413");
    expect(textoSobre("#2b1016")).toBe("#fbf6f2");
    // el texto elegido siempre se lee (>= 4,5) sobre cualquier color del catálogo
    for (const a of AMBIENTES_CAMPANA) for (const p of a.paletas) for (const x of [p.fondo, p.acento]) expect(ratioContraste(x, textoSobre(x))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("el color propio", () => {
  it("un acento propio reemplaza al de la paleta; uno que no es #rrggbb se ignora", () => {
    expect(coloresDeCampana("cyber", 0, "#00AA55")?.acento).toBe("#00aa55");
    expect(coloresDeCampana("cyber", 0, "verde")?.acento).toBe("#e47d8d");
    expect(coloresDeCampana("cyber", 0, null)?.acento).toBe("#e47d8d");
  });

  it("una clave o una paleta que no existen no inventan colores", () => {
    expect(coloresDeCampana("halloween", 0)).toBeNull();
    expect(coloresDeCampana("cyber", 3)).toBeNull();
    expect(coloresDeCampana(null, 0)).toBeNull();
    expect(ambienteDeCampana("halloween")).toBeNull();
  });

  it("un acento que casi no se ve sobre el fondo hace fallar el candado, y dice cuál", () => {
    const c = coloresDeCampana("cyber", 0, "#1a1a19")!; // casi igual al fondo negro
    const r = comprobarLectura(c);
    expect(r.ok).toBe(false);
    expect(r.items.filter((x) => !x.ok).map((x) => x.nombre)).toEqual(["Botón y palabra de color sobre el fondo"]);
  });

  it("el sello elige solo un color que se lea sobre la foto y su letra se lee sobre él", () => {
    // sobre fondo claro, el acento (#8a6a2a) ya se lee sobre la foto
    const claro = colorDelSello(coloresDeCampana("aniversario", 2)!);
    expect(ratioContraste(claro.fondo, "#e1ded7")).toBeGreaterThanOrEqual(3);
    expect(ratioContraste(claro.fondo, claro.texto)).toBeGreaterThanOrEqual(4.5);
    // un acento claro (champán) no se lee sobre la foto: usa el fondo de la campaña
    const champan = colorDelSello(coloresDeCampana("aniversario", 0)!);
    expect(champan.fondo).toBe("#2b1016");
    // ni el acento ni el fondo se leen (los dos claros): cae al grafito
    expect(colorDelSello({ fondo: "#f5f5f5", texto: "#111111", acento: "#eeeeee" }).fondo).toBe("#1c1c1a");
  });
});
