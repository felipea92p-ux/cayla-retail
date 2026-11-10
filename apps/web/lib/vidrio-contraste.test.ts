import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado del contraste sobre el vidrio (ADR-0596, act. 2026-11-05). `tema-tokens.test.ts` mide los tokens planos, y `tema:auditar` solo suma
// `background-color`: casi todo el vidrio es un degradado, así que la letra de un botón nadie la medía. Por ahí pasaron la letra de «Anular»
// a 2.87:1 y un borde de campo a 2.64:1. Aquí se compone cada tramo del degradado sobre lo que puede haber detrás (la página, la tarjeta, la
// hoja), en los dos temas, y se exige el peor punto: 4.5:1 para la letra (WCAG 1.4.3) y 3:1 para el borde de lo que se escribe (WCAG 1.4.11).

type Rgba = [number, number, number, number];

const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const globals = leer("app/globals.css");
const tema = leer("app/estilos/tema.css");

/** El texto sin los bloques `@media (prefers-reduced-transparency …)`: ahí el vidrio ya es papel, y su selector también nombra el oscuro. */
function sinRespaldo(css: string): string {
  let salida = css;
  for (;;) {
    const i = salida.indexOf("@media (prefers-reduced-transparency");
    if (i < 0) return salida;
    let j = salida.indexOf("{", i) + 1;
    for (let hondo = 1; hondo > 0; j++) {
      if (salida[j] === "{") hondo++;
      if (salida[j] === "}") hondo--;
    }
    salida = salida.slice(0, i) + salida.slice(j);
  }
}

const recetas = sinRespaldo(leer("app/estilos/vidrio/recetas.css"));

/** Todas las declaraciones `--x: valor;` de un cuerpo de bloque. */
function declaraciones(cuerpo: string): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const m of cuerpo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) salida[m[1]] = m[2].replace(/\s+/g, " ").trim();
  return salida;
}

/** Los cuerpos de todos los bloques cuyo selector es exactamente `selector`. */
function cuerpos(css: string, selector: string): string[] {
  const salida: string[] = [];
  let desde = 0;
  for (;;) {
    const i = css.indexOf(selector, desde);
    if (i < 0) return salida;
    desde = i + selector.length;
    const antes = css.slice(0, i).trimEnd().at(-1);
    const resto = css.slice(desde).trimStart();
    if (!resto.startsWith("{") || (antes !== undefined && !"{};".includes(antes))) continue;
    const ini = css.indexOf("{", desde);
    salida.push(css.slice(ini + 1, css.indexOf("}", ini)));
  }
}

const claro: Record<string, string> = { ...declaraciones(cuerpos(globals, "@theme static")[0] ?? ""), ...cuerpos(recetas, ":root").reduce((a, c) => ({ ...a, ...declaraciones(c) }), {}) };
const tokensOscuros = declaraciones(cuerpos(tema, ':root[data-tema="oscuro"]')[0] ?? "");
const recetasOscuras = cuerpos(recetas, ':root[data-tema="oscuro"]').reduce((a, c) => ({ ...a, ...declaraciones(c) }), {} as Record<string, string>);
const oscuro: Record<string, string> = { ...claro, ...tokensOscuros, ...recetasOscuras };

const TEMAS = { claro, oscuro } as const;
type NombreTema = keyof typeof TEMAS;

const hex = (h: string): Rgba => {
  const n = h.replace("#", "");
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), 1];
};
const sobre = (a: Rgba, b: Rgba): Rgba => {
  const alfa = a[3] + b[3] * (1 - a[3]);
  if (alfa === 0) return [0, 0, 0, 0];
  const canal = (i: number) => (a[i] * a[3] + b[i] * b[3] * (1 - a[3])) / alfa;
  return [canal(0), canal(1), canal(2), alfa];
};
const luminancia = (c: Rgba) => {
  const [r, g, b] = [c[0], c[1], c[2]].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: Rgba, b: Rgba) => {
  const [l, d] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l + 0.05) / (d + 0.05);
};

/** Parte `a, b, c` por las comas de primer nivel. */
function partes(texto: string): string[] {
  const salida: string[] = [];
  let hondo = 0;
  let actual = "";
  for (const ch of texto) {
    if (ch === "(") hondo++;
    if (ch === ")") hondo--;
    if (ch === "," && hondo === 0) {
      salida.push(actual.trim());
      actual = "";
    } else actual += ch;
  }
  salida.push(actual.trim());
  return salida;
}

/** Un color de CSS (un hex, un `var(--…)` o un `color-mix(in srgb, …)`), con los valores del tema. */
function color(valor: string, vars: Record<string, string>): Rgba {
  const v = valor.trim();
  if (v === "transparent") return [0, 0, 0, 0];
  if (v.startsWith("#")) return hex(v);
  const unaVar = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (unaVar) {
    if (!vars[unaVar[1]]) throw new Error(`no existe ${unaVar[1]}`);
    return color(vars[unaVar[1]], vars);
  }
  const mezcla = v.match(/^color-mix\(in srgb,\s*(.*)\)$/);
  if (mezcla) {
    const [a, b] = partes(mezcla[1]);
    const conPct = a.match(/^(.*\S)\s+([\d.]+)%$/);
    if (!conPct) throw new Error(`no entiendo la mezcla «${v}»`);
    const pct = Number(conPct[2]) / 100;
    const ca = color(conPct[1], vars);
    const cb = color(b, vars);
    // color-mix con transparente: el color no cambia y baja su alfa; con otro color opaco, se mezclan los canales.
    if (cb[3] === 0) return [ca[0], ca[1], ca[2], ca[3] * pct];
    return [ca[0] * pct + cb[0] * (1 - pct), ca[1] * pct + cb[1] * (1 - pct), ca[2] * pct + cb[2] * (1 - pct), 1];
  }
  throw new Error(`no entiendo el color «${v}»`);
}

/** Los tramos de un fondo: los dos extremos de un degradado, o el color parejo. Entre extremos el contraste cambia sin dar vueltas: el peor es uno de ellos. */
function tramos(valor: string, vars: Record<string, string>): Rgba[] {
  const unaVar = valor.trim().match(/^var\((--[a-z0-9-]+)\)$/);
  if (unaVar && vars[unaVar[1]]) return tramos(vars[unaVar[1]], vars);
  const degradado = valor.trim().match(/^linear-gradient\((.*)\)$/);
  if (degradado) return partes(degradado[1]).slice(1).map((p) => color(p, vars));
  return [color(valor, vars)];
}

/** Lo que puede haber detrás de un botón: la página, la tarjeta y la hoja de vidrio sobre la página. */
function superficies(vars: Record<string, string>): Rgba[] {
  const pagina = color("var(--color-crema)", vars);
  return [pagina, color("var(--color-papel)", vars), sobre(color("var(--vidrio-hoja-fondo)", vars), pagina)];
}

/** Una declaración (`background`, `color`, `border-color`) del primer bloque con ese selector exacto en ese CSS, si la tiene. */
function propiedad(css: string, selector: string, nombre: string): string | null {
  for (const cuerpo of cuerpos(css, selector)) {
    const m = cuerpo.match(new RegExp(`(?:^|[;\\s])${nombre}\\s*:\\s*([^;]+);`));
    if (m) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

const carpetaVidrio = "app/estilos/vidrio";
const piezas = readdirSync(join(__dirname, "..", carpetaVidrio))
  .filter((f) => f.endsWith(".css") && f !== "recetas.css")
  .map((f) => ({ archivo: f, css: leer(`${carpetaVidrio}/${f}`) }));
const hoja = leer(`${carpetaVidrio}/hoja.css`);

/** La cara de un botón: su fondo sale de la pieza de vidrio; su letra, de la pieza o de la base de `globals.css`. */
function cara(selector: string, estado = "") {
  const conEstado = `${selector}${estado}`;
  const fondos = piezas.map((p) => propiedad(p.css, conEstado, "background")).filter((x): x is string => x !== null);
  if (fondos.length === 0) throw new Error(`ninguna pieza de vidrio le da fondo a «${conEstado}»`);
  const letra = piezas.map((p) => propiedad(p.css, selector, "color")).find((x) => x !== null) ?? propiedad(globals, selector, "color");
  if (!letra) throw new Error(`«${selector}» no dice de qué color es su letra`);
  return { fondo: fondos[0], letra };
}

function peorLetra(selector: string, nombreTema: NombreTema, estado = "") {
  const vars = TEMAS[nombreTema];
  const { fondo, letra } = cara(selector, estado);
  const tinta = color(letra, vars);
  let peor = Infinity;
  for (const detras of superficies(vars)) {
    for (const tramo of tramos(fondo, vars)) {
      const pintado = sobre(tramo, detras);
      peor = Math.min(peor, contraste(sobre(tinta, pintado), pintado));
    }
  }
  return peor;
}

/** Todo botón con su fondo en una receta, en reposo y al pasar el mouse. */
const BOTONES: Array<[string, string]> = [
  [".btn-primario", ""],
  [".btn-primario", ":hover:not(:disabled)"],
  [".btn-secundario", ""],
  [".btn-secundario", ":hover:not(:disabled)"],
  [".btn-peligro", ""],
  [".btn-peligro", ":hover:not(:disabled)"],
];

describe("la letra de un botón se lee sobre su vidrio, en el peor tramo del degradado", () => {
  for (const nombreTema of Object.keys(TEMAS) as NombreTema[]) {
    for (const [selector, estado] of BOTONES) {
      it(`${selector}${estado} en ${nombreTema} pasa 4.5:1`, () => {
        expect(peorLetra(selector, nombreTema, estado)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

/** Lo que se escribe o se marca: su borde es lo único que lo identifica como control (ADR-0516). */
const CONTROLES = [".caja-campo-input", ".buscador", ".marco-buscador", ".combo-pastilla", ".casilla-input", ".pantalla-en-vidrio .fin-control"];

describe("el borde de lo que se escribe no se diluye sobre el vidrio", () => {
  it("ningún control lleva el borde de control mezclado con transparente", () => {
    const aguados: string[] = [];
    for (const { archivo, css } of piezas) {
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = m[1].trim();
        // El :hover y el :focus suben el borde: no son el reposo.
        if (/:hover|:focus/.test(selector) || !CONTROLES.some((c) => selector.includes(c))) continue;
        if (/border-color:\s*color-mix\(in srgb, var\(--color-borde-control\) \d+%, transparent\)/.test(m[2])) aguados.push(`${archivo} · ${selector}`);
      }
    }
    expect(aguados).toEqual([]);
  });

  for (const nombreTema of Object.keys(TEMAS) as NombreTema[]) {
    it(`el borde de control pasa 3:1 sobre todo lo que puede haber detrás, en ${nombreTema}`, () => {
      const vars = TEMAS[nombreTema];
      for (const detras of superficies(vars)) {
        expect(contraste(color("var(--color-borde-control)", vars), detras)).toBeGreaterThanOrEqual(3);
      }
    });
  }
});

describe("lo que se toca en la barra de Finanzas lleva borde de control, no la línea decorativa", () => {
  const telar = leer("app/estilos/telar.css");
  const finanzas = leer("app/estilos/finanzas.css");
  /** El cuerpo del primer bloque cuyo selector (de una sola línea) es exactamente `selector`. */
  const bloque = (css: string, selector: string) => {
    const i = css.search(new RegExp(`(^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`));
    expect(i, `no aparece ${selector}`).toBeGreaterThanOrEqual(0);
    const abre = css.indexOf("{", i);
    return css.slice(abre + 1, css.indexOf("}", abre));
  };

  it.each([".sede-telar", ".te-toca-telar"])("%s declara borde-control", (selector) => {
    const cuerpo = bloque(telar, selector);
    expect(cuerpo).toMatch(/border:\s*1px solid var\(--color-borde-control\)/);
    expect(cuerpo).not.toMatch(/var\(--color-sand\)/);
  });

  it(".fin-control declara borde-control en reposo", () => {
    const cuerpo = bloque(finanzas, ".fin-control");
    expect(cuerpo).toMatch(/border:\s*1px solid var\(--color-borde-control\)/);
    expect(cuerpo).not.toMatch(/var\(--color-sand\)/);
  });

  // Con el borde en reposo ya en 3:1, un foco de taupe aguado haría que el campo se apague justo al entrar en él.
  it.each([".fin-control:focus", '.fin-desplegable[aria-expanded="true"]'])("%s se ve más fuerte que el reposo, no más tenue", (selector) => {
    const cuerpo = bloque(finanzas, selector);
    expect(cuerpo).toMatch(/border-color:\s*var\(--color-tinta\)/);
    expect(cuerpo).not.toMatch(/transparent/);
  });
});

describe("la hoja es una sola y lo que no se deshace no es un bloque rojo", () => {
  it("una hoja con un botón de peligro no cambia de material", () => {
    expect(hoja).not.toMatch(/\.hoja-serena:has\(\.btn-peligro\)/);
  });

  it("el rojo de vidrio ya no es una receta de botón", () => {
    expect(recetas).not.toMatch(/--rojo-vidrio-/);
    for (const { archivo, css } of piezas) {
      expect(`${archivo}: ${/--rojo-vidrio-/.test(css)}`).toBe(`${archivo}: false`);
    }
  });
});

/** Las hojas que anulan algo que SÍ se puede volver a hacer: no afirman lo que no es. */
const SE_PUEDE_VOLVER_A_HACER: Record<string, string> = {
  "components/orden-pagina/AnularSalidaOVueltaModal.tsx": "la salida o la vuelta se anota de nuevo (textoQuePasaAlAnular)",
};

function archivosTsx(carpeta: string): string[] {
  return readdirSync(join(__dirname, "..", carpeta), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${carpeta}/${e.name}`;
    return e.isDirectory() ? archivosTsx(ruta) : e.name.endsWith(".tsx") ? [ruta] : [];
  });
}

describe("una acción principal que anula o elimina nunca va sin señal", () => {
  it("todo botón negro que anula o elimina tiene su «No se puede deshacer» en el mismo archivo", () => {
    const sinAviso: string[] = [];
    for (const ruta of [...archivosTsx("components"), ...archivosTsx("app")]) {
      const texto = readFileSync(join(__dirname, "..", ruta), "utf8");
      const lineas = texto.split("\n");
      const anula = lineas.some((l, i) => /textoCargando="(?:Anulando|Eliminando|Borrando)…"/.test(l) && lineas.slice(Math.max(0, i - 3), i + 4).some((x) => /peso="primario"/.test(x)));
      if (anula && !texto.includes("<AvisoNoSeDeshace") && !SE_PUEDE_VOLVER_A_HACER[ruta]) sinAviso.push(ruta);
    }
    expect(sinAviso).toEqual([]);
  });
});
