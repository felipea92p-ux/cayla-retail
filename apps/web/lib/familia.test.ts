import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATRIBUTO_TEMA, TEMAS } from "./tema-reglas";

// Candado de la familia CAYLA (docs/familia/README.md). CAYLA Retail y CAYLA Dynamic son la misma empresa: lo que una persona mira para
// reconocerla —la paleta, las dos letras, los radios, el nombre del atributo del tema— tiene que ser igual en las dos aplicaciones.
// `docs/familia/contrato.json` es el mismo archivo en los dos repositorios; este test comprueba que el código de Retail dice lo que el
// contrato dice. El mismo test (con su propia ruta de globals.css) vive en el repositorio de Dynamic.
//
// Si falla porque CAMBIASTE un valor a propósito: cámbialo también en docs/familia/contrato.json, copia el contrato a Dynamic y avisa
// (la capa «marca» se cambia en las dos aplicaciones el mismo día). Si falla y no lo cambiaste, algo se desfasó solo: eso es lo que
// este test existe para encontrar (el espejo `design-tokens.ts` se desfasó en silencio y nadie lo notó durante semanas).

const raiz = join(__dirname, "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const contrato = JSON.parse(leer("docs/familia/contrato.json")) as {
  version: number;
  marca: {
    colores_claro: Record<string, string>;
    tipografia: { sans: string; serif: string };
    radios: { funcion: string; px: number; retail: string | null }[];
    tema: { atributo: string; claro: string; oscuro: string };
  };
  oscuro: { retail: Record<string, string>; dynamic: Record<string, string> };
  sistema: { id: string; regla: string }[];
  producto: { id: string; motivo: string; estado: string }[];
  pendientes: { id: string; tema: string; estado: string; como_decidir: string }[];
};

const globals = sinComentarios(leer("apps/web/app/globals.css"));
const tema = sinComentarios(leer("apps/web/app/estilos/tema.css"));
const layout = leer("apps/web/app/layout.tsx");

/** Los colores con valor hex literal de un texto CSS: nombre → hex (el primero que aparece gana: el `@theme` va antes que lo demás). */
function hexDe(css: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) salida[m[1]] ??= m[2].toLowerCase();
  return salida;
}

/** El texto entre las llaves del bloque que empieza con `cabecera` (un bloque de declaraciones, sin llaves anidadas). */
function cuerpoDe(css: string, cabecera: string): string {
  const i = css.indexOf(cabecera);
  if (i < 0) throw new Error(`no encontré «${cabecera}»`);
  const ini = css.indexOf("{", i);
  return css.slice(ini + 1, css.indexOf("}", ini));
}

const claro = hexDe(globals);
const oscuro = hexDe(cuerpoDe(tema, ':root[data-tema="oscuro"]'));
const FIJOS = ["tinta-fija", "crema-fija"];

describe("el contrato de la familia está bien armado", () => {
  it("tiene versión, y cada pieza de las capas trae lo que su capa exige", () => {
    expect(contrato.version).toBeGreaterThanOrEqual(1);
    expect(contrato.sistema.length).toBeGreaterThan(0);
    for (const s of contrato.sistema) expect(s.regla.length, `sistema ${s.id}`).toBeGreaterThan(20);
    // Una diferencia de producto sin su motivo es un accidente con otro nombre.
    for (const p of contrato.producto) expect(p.motivo.length, `producto ${p.id}: falta el motivo`).toBeGreaterThan(10);
  });

  it("los pendientes tienen id único, un estado conocido y dicen cómo se decide", () => {
    const ids = contrato.pendientes.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of contrato.pendientes) {
      expect(["abierto", "decidido"], `pendiente ${p.id}`).toContain(p.estado);
      expect(p.como_decidir.length, `pendiente ${p.id}: falta cómo se decide`).toBeGreaterThan(10);
    }
  });
});

describe("la capa «marca»: Retail dice lo que el contrato dice", () => {
  it("el detector sí encuentra tokens (que no pase en vacío por estar mal escrito)", () => {
    expect(Object.keys(claro).length).toBeGreaterThan(20);
    expect(Object.keys(oscuro).length).toBeGreaterThan(10);
  });

  it("los colores del tema claro son los de la familia, al hex", () => {
    for (const [nombre, hex] of Object.entries(contrato.marca.colores_claro)) {
      expect(claro[nombre], `--color-${nombre} en globals.css`).toBe(hex.toLowerCase());
    }
  });

  it("los radios de control, superficie y flotante son los de la familia", () => {
    for (const r of contrato.marca.radios.filter((x) => x.retail !== null)) {
      const m = new RegExp(`--${r.retail}\\s*:\\s*(\\d+)px`).exec(globals);
      expect(m, `--${r.retail} en globals.css`).not.toBeNull();
      expect(Number(m![1]), `--${r.retail} (${r.funcion})`).toBe(r.px);
    }
  });

  it("las dos letras de la familia son las que carga el layout", () => {
    const familia = (nombre: string) => nombre.replace(/ /g, "_");
    expect(layout).toContain(`${familia(contrato.marca.tipografia.serif)}`);
    expect(layout).toContain(`${familia(contrato.marca.tipografia.sans)}`);
  });

  it("el tema se llama como en la familia: el atributo y sus dos valores", () => {
    expect(ATRIBUTO_TEMA).toBe(contrato.marca.tema.atributo);
    expect([...TEMAS]).toEqual([contrato.marca.tema.claro, contrato.marca.tema.oscuro]);
  });
});

describe("el detector de la paridad entre las dos aplicaciones", () => {
  it("no está ciego: cada cambio de la capa «marca» se nota (scripts/familia/comparar.mjs --autoprueba)", () => {
    const salida = execFileSync(process.execPath, [join(raiz, "scripts/familia/comparar.mjs"), "--autoprueba"], { encoding: "utf8" });
    expect(salida).toContain("el detector no está ciego");
  });
});

describe("el oscuro de Retail está congelado en el contrato (pendiente P1)", () => {
  it("cada color del oscuro es el que el contrato guarda para Retail", () => {
    for (const [nombre, hex] of Object.entries(contrato.oscuro.retail)) {
      expect(oscuro[nombre], `--color-${nombre} en estilos/tema.css (oscuro)`).toBe(hex.toLowerCase());
    }
  });

  it("el contrato guarda el oscuro de TODO color de marca que tiene uno (no se escapa ninguno)", () => {
    const conOscuro = Object.keys(contrato.marca.colores_claro).filter((n) => !FIJOS.includes(n) && n in oscuro);
    expect(Object.keys(contrato.oscuro.retail).sort()).toEqual(conOscuro.sort());
  });

  it("mientras el pendiente P1 siga abierto, los dos oscuros se registran por separado", () => {
    const p1 = contrato.pendientes.find((p) => p.id === "P1");
    const iguales = JSON.stringify(contrato.oscuro.retail) === JSON.stringify(contrato.oscuro.dynamic);
    // Si ya son iguales, P1 debe estar decidido; si no, debe seguir abierto: el contrato no puede decir dos cosas.
    expect(p1?.estado, "P1 contra los dos oscuros").toBe(iguales ? "decidido" : "abierto");
  });
});
