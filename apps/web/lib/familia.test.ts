import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ATRIBUTO_TEMA, TEMAS } from "./tema-reglas";

// Candado de la familia CAYLA (docs/familia/README.md). CAYLA Retail y CAYLA Dynamic son la misma empresa: lo que una persona mira para
// reconocerla —la paleta de los dos temas, las dos letras, los radios, el nombre del atributo del tema— tiene que ser igual en las dos
// aplicaciones. `docs/familia/contrato.json` es el mismo archivo en los dos repositorios; este test comprueba que el código de Retail dice
// lo que el contrato dice. El mismo test (con su propia ruta de globals.css) vive en el repositorio de Dynamic.
//
// Si falla porque CAMBIASTE un valor a propósito: cámbialo también en docs/familia/contrato.json (y sube su `version`); desde la versión 4 Retail manda y el
// vigilante de Dynamic lo ve. Si falla y no lo cambiaste, algo se desfasó solo: eso es lo que este test existe para encontrar (el espejo `design-tokens.ts` se
// desfasó en silencio y nadie lo notó durante semanas).

const raiz = join(__dirname, "..", "..", "..");
const leer = (ruta: string) => readFileSync(join(raiz, ruta), "utf8");
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const contrato = JSON.parse(leer("docs/familia/contrato.json")) as {
  version: number;
  marca: {
    colores_claro: Record<string, string>;
    colores_oscuro: Record<string, string>;
    tipografia: { sans: string; serif: string };
    radios: { funcion: string; px: number; retail: string | null }[];
    tema: { atributo: string; claro: string; oscuro: string };
  };
  sistema: { id: string; regla: string }[];
  producto: { id: string; motivo: string; estado: string }[];
  aplicacion_pendiente: { miembro: string; tema: string; que: string }[];
  pendientes: { id: string; tema: string; estado: string; como_decidir: string; decision?: string }[];
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

  it("los pendientes tienen id único, un estado conocido y dicen cómo se decide; uno decidido dice qué se decidió", () => {
    const ids = contrato.pendientes.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of contrato.pendientes) {
      expect(["abierto", "decidido"], `pendiente ${p.id}`).toContain(p.estado);
      expect(p.como_decidir.length, `pendiente ${p.id}: falta cómo se decide`).toBeGreaterThan(10);
      if (p.estado === "decidido") expect(p.decision?.length ?? 0, `pendiente ${p.id}: falta la decisión`).toBeGreaterThan(10);
    }
  });

  it("lo que falta aplicar en la otra aplicación está dicho (no se pierde al cerrar la sesión)", () => {
    for (const a of contrato.aplicacion_pendiente) {
      expect(["retail", "dynamic"]).toContain(a.miembro);
      expect(a.que.length, `aplicación pendiente de ${a.miembro}`).toBeGreaterThan(20);
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

  it("los colores del tema oscuro son los de la familia, al hex (P1, opción C)", () => {
    for (const [nombre, hex] of Object.entries(contrato.marca.colores_oscuro)) {
      expect(oscuro[nombre], `--color-${nombre} en estilos/tema.css (oscuro)`).toBe(hex.toLowerCase());
    }
  });

  it("el contrato guarda el oscuro de TODO color de marca que tiene uno (no se escapa ninguno)", () => {
    const conOscuro = Object.keys(contrato.marca.colores_claro).filter((n) => !FIJOS.includes(n) && n in oscuro);
    expect(Object.keys(contrato.marca.colores_oscuro).sort()).toEqual(conOscuro.sort());
  });

  it("los radios de cada pieza son los de la familia", () => {
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

describe("el oscuro de la familia: P1 está decidido y Retail ya lo aplica", () => {
  it("P1 está decidido y dice cuál se eligió", () => {
    const p1 = contrato.pendientes.find((p) => p.id === "P1");
    expect(p1?.estado).toBe("decidido");
    expect(p1?.decision).toMatch(/^C\b/);
  });

  it("lo único que le falta a la familia es aplicarlo en Dynamic (no en Retail)", () => {
    const faltan = contrato.aplicacion_pendiente.filter((a) => a.tema === "oscuro").map((a) => a.miembro);
    expect(faltan).not.toContain("retail");
  });
});

describe("el borde de un control: P2 está decidido y Retail ya lo aplica", () => {
  it("P2 está decidido y dice cuál se eligió", () => {
    const p2 = contrato.pendientes.find((p) => p.id === "P2");
    expect(p2?.estado).toBe("decidido");
    expect(p2?.decision).toMatch(/^C\b/);
  });

  it("`borde-control` es un color de marca de los dos temas, y es otro color que `sand` (la línea decorativa) y que `taupe`", () => {
    for (const tema of ["colores_claro", "colores_oscuro"] as const) {
      const c = contrato.marca[tema];
      expect(c["borde-control"], `${tema}.borde-control`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c["borde-control"]).not.toBe(c.sand);
      expect(c["borde-control"]).not.toBe(c.taupe);
    }
  });

  it("Retail no tiene nada pendiente de aplicar (todo lo que falta es de Dynamic)", () => {
    expect(contrato.aplicacion_pendiente.filter((a) => a.miembro === "retail")).toEqual([]);
  });
});

describe("el detector de la paridad entre las dos aplicaciones", () => {
  it("no está ciego: cada cambio de la capa «marca» se nota (scripts/familia/comparar.mjs --autoprueba)", () => {
    const salida = execFileSync(process.execPath, [join(raiz, "scripts/familia/comparar.mjs"), "--autoprueba"], { encoding: "utf8" });
    expect(salida).toContain("el detector no está ciego");
  });
});

// Lo que Dynamic trae de Retail (contrato v4). Su vigilante envuelve recetas.css para colgarlo de su interruptor, y rechaza cualquier otra forma: una regla de
// clase apunta al HTML de Retail y un @keyframes o un @layer pisaría los suyos. Esta prueba existe para que el error salga en el PR de Retail, no después en Dynamic.
type Bloque = { preludio: string; cuerpo: string };

/** Los bloques de primer nivel de un CSS, y lo que queda suelto entre ellos (un `@import`). */
function partirCss(css: string): { bloques: Bloque[]; sueltos: string[] } {
  const bloques: Bloque[] = [];
  const sueltos: string[] = [];
  let i = 0;
  while (i < css.length) {
    const llave = css.indexOf("{", i);
    const punto = css.indexOf(";", i);
    if (llave < 0) {
      if (css.slice(i).trim()) sueltos.push(css.slice(i).trim());
      break;
    }
    if (punto >= 0 && punto < llave) {
      sueltos.push(css.slice(i, punto).trim());
      i = punto + 1;
      continue;
    }
    let abiertas = 1;
    let j = llave + 1;
    for (; j < css.length && abiertas > 0; j++) {
      if (css[j] === "{") abiertas++;
      else if (css[j] === "}") abiertas--;
    }
    bloques.push({ preludio: css.slice(i, llave).trim().replace(/\s+/g, " "), cuerpo: css.slice(llave + 1, j - 1) });
    i = j;
  }
  return { bloques, sueltos };
}

/** Las declaraciones de un bloque, sin partir el `;` de adentro de un `url(data:…)`. */
function declaraciones(cuerpo: string): string[] {
  const salida: string[] = [];
  let parentesis = 0;
  let actual = "";
  for (const c of cuerpo) {
    if (c === "(") parentesis++;
    if (c === ")") parentesis--;
    if (c === ";" && parentesis === 0) {
      salida.push(actual.trim());
      actual = "";
    } else actual += c;
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida.filter(Boolean);
}

/** Por qué un recetas.css no podría viajar; vacío si puede. */
function motivosParaNoViajar(css: string): string[] {
  const motivos: string[] = [];
  const soloVariables = (cuerpo: string, donde: string) => {
    for (const d of declaraciones(cuerpo)) {
      if (!d.startsWith("--")) motivos.push(`${donde}: «${d.slice(0, 50)}» no es una variable`);
      else if (/^--(color|radius)-/.test(d)) motivos.push(`${donde}: «${d.split(":")[0]}» es un valor de marca: entra por el contrato, no por las recetas`);
    }
  };
  const unSoloSelector = (cuerpo: string, selector: string, donde: string) => {
    const { bloques, sueltos } = partirCss(cuerpo);
    for (const s of sueltos) motivos.push(`${donde}: «${s.slice(0, 50)}» está suelto`);
    for (const b of bloques) {
      if (b.preludio !== selector) motivos.push(`${donde}: el selector «${b.preludio.slice(0, 50)}» apunta a otra cosa que ${selector}`);
      else soloVariables(b.cuerpo, `${donde} › ${selector}`);
    }
  };
  const { bloques, sueltos } = partirCss(css);
  for (const s of sueltos) motivos.push(`«${s.slice(0, 50)}» está suelto`);
  for (const b of bloques) {
    if (b.preludio === ":root") soloVariables(b.cuerpo, ":root");
    else if (b.preludio === "@media screen") unSoloSelector(b.cuerpo, ':root[data-tema="oscuro"]', b.preludio);
    else if (b.preludio === "@media (prefers-reduced-transparency: reduce)") unSoloSelector(b.cuerpo, ':root, :root[data-tema="oscuro"]', b.preludio);
    else motivos.push(`«${b.preludio.slice(0, 70)}» es una forma que no viaja`);
  }
  return motivos;
}

describe("las recetas pueden viajar a Dynamic", () => {
  const recetas = sinComentarios(leer("apps/web/app/estilos/vidrio/recetas.css"));

  it("recetas.css solo tiene variables, en las tres formas que Dynamic sabe envolver", () => {
    expect(partirCss(recetas).bloques.length, "no encontró bloques: la prueba pasaría en vacío").toBeGreaterThan(5);
    expect(motivosParaNoViajar(recetas)).toEqual([]);
  });

  it("el detector no está ciego: cada forma que no viaja se nota", () => {
    const raiz = ":root { --x: 1px; }";
    expect(motivosParaNoViajar(raiz)).toEqual([]);
    expect(motivosParaNoViajar(`${raiz} .tarjeta { color: red; }`).length, "una regla de clase").toBeGreaterThan(0);
    expect(motivosParaNoViajar(":root { color: red; }").length, "una propiedad en :root").toBeGreaterThan(0);
    expect(motivosParaNoViajar(":root { --color-tinta: #000; }").length, "un color de marca propio").toBeGreaterThan(0);
    expect(motivosParaNoViajar(":root { --radius-hoja: 1px; }").length, "un radio de marca propio").toBeGreaterThan(0);
    expect(motivosParaNoViajar("@keyframes x { from { opacity: 0; } }").length, "un @keyframes").toBeGreaterThan(0);
    expect(motivosParaNoViajar('@import "./otra.css";').length, "un @import").toBeGreaterThan(0);
    expect(motivosParaNoViajar("@media (prefers-contrast: more) { :root { --x: 1px; } }").length, "otro @media").toBeGreaterThan(0);
    expect(motivosParaNoViajar("@media screen { :root { --x: 1px; } }").length, "otro selector en @media screen").toBeGreaterThan(0);
    expect(motivosParaNoViajar('@media screen { :root[data-tema="oscuro"] { color: red; } }').length, "una propiedad en el oscuro").toBeGreaterThan(0);
  });

  it("una variable con un `url(data:…)` no se confunde con dos declaraciones", () => {
    expect(motivosParaNoViajar(':root { --x: url("data:image/svg+xml;utf8,<svg/>"); }')).toEqual([]);
  });

  it("el radio de la hoja de las recetas vale lo mismo que `hoja` en el contrato (no depende de un token: Dynamic no lo tiene)", () => {
    const hoja = contrato.marca.radios.find((r) => r.funcion === "hoja");
    const m = /--vidrio-hoja-radio\s*:\s*(\d+)px/.exec(recetas);
    expect(m, "--vidrio-hoja-radio en recetas.css").not.toBeNull();
    expect(Number(m![1])).toBe(hoja?.px);
  });
});
