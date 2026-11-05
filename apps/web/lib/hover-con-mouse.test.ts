import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El mouse encima, solo con mouse (ADR-0479, actividad 7).
 *
 * En un teléfono el navegador deja puesto el `:hover` en lo último que se tocó: un botón queda levantado, una fila teñida, los
 * demás tramos de un gráfico apagados. Todo `:hover` de nuestro CSS va dentro de `@media (hover: hover)` (como el `hover:` de
 * Tailwind v4). Uno que debe responder al toque lleva justo antes `/* hover-tactil: <motivo de 10 letras o más> *\/`.
 */

type Suelto = { linea: number; selector: string };

/** Lee el CSS a mano (sin dependencias): sigue las llaves, salta comentarios y textos, y mira el bloque donde cae cada selector. */
function hoverSueltos(css: string): Suelto[] {
  const sueltos: Suelto[] = [];
  const pila: string[] = [];
  let prelude = "";
  let lineaDelPrelude = 0;
  let comentarioPrevio = "";
  let linea = 1;
  const reiniciar = () => {
    prelude = "";
    comentarioPrevio = "";
  };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "/" && css[i + 1] === "*") {
      const fin = css.indexOf("*/", i + 2);
      const texto = css.slice(i, fin < 0 ? css.length : fin + 2);
      linea += (texto.match(/\n/g) ?? []).length;
      // Un comentario solo exime al selector que viene pegado debajo (sin nada escrito entre los dos).
      if (prelude.trim() === "") comentarioPrevio = texto;
      i = fin < 0 ? css.length : fin + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const fin = css.indexOf(c, i + 1);
      prelude += css.slice(i, fin + 1);
      i = fin < 0 ? css.length : fin;
      continue;
    }
    if (c === "{") {
      const p = prelude.trim().replace(/\s+/g, " ");
      const bajoHover = pila.some((x) => /^@media\b.*\(\s*hover\s*:\s*hover\s*\)/.test(x) || /^@(-\w+-)?keyframes\b/.test(x));
      const exento = /hover-tactil:\s*\S[^*]{9,}/.test(comentarioPrevio);
      if (!p.startsWith("@") && /:hover\b/.test(p) && !bajoHover && !exento) sueltos.push({ linea: lineaDelPrelude, selector: p });
      pila.push(p);
      reiniciar();
      continue;
    }
    if (c === "}") {
      pila.pop();
      reiniciar();
      continue;
    }
    if (c === ";") {
      reiniciar();
      continue;
    }
    if (c === "\n") linea++;
    if (prelude.trim() === "" && c.trim() !== "") lineaDelPrelude = linea;
    prelude += c;
  }
  return sueltos;
}

function archivosCss(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === "node_modules" || e.name.startsWith(".")) return [];
    const ruta = join(dir, e.name);
    return e.isDirectory() ? archivosCss(ruta) : e.name.endsWith(".css") ? [ruta] : [];
  });
}

describe("el lector de :hover", () => {
  it("marca un :hover suelto, también dentro de un @layer", () => {
    expect(hoverSueltos(".a:hover { color: red; }")).toEqual([{ linea: 1, selector: ".a:hover" }]);
    expect(hoverSueltos("@layer components {\n  .a { x: 1; }\n  .b:hover .c { x: 2; }\n}")).toEqual([{ linea: 3, selector: ".b:hover .c" }]);
  });

  it("deja pasar el que vive bajo @media (hover: hover), aunque esté dentro de otro @media", () => {
    expect(hoverSueltos("@media (hover: hover) { .a:hover { x: 1; } }")).toEqual([]);
    expect(hoverSueltos("@media (min-width: 40rem) { @media (hover:hover) { .a:hover { x: 1; } } }")).toEqual([]);
    expect(hoverSueltos("@media (hover: hover) and (pointer: fine) { .a:hover { x: 1; } }")).toEqual([]);
  });

  it("no se confunde con otro @media ni con un :hover escrito en un comentario o un texto", () => {
    expect(hoverSueltos("@media (min-width: 40rem) { .a:hover { x: 1; } }")).toHaveLength(1);
    expect(hoverSueltos("/* .a:hover { x: 1; } */ .b { content: ':hover {'; }")).toEqual([]);
    expect(hoverSueltos(".a:focus-visible, [aria-current] { x: 1; }")).toEqual([]);
  });

  it("exime solo con hover-tactil y un motivo, y solo al selector pegado debajo", () => {
    expect(hoverSueltos("/* hover-tactil: el globito es la lectura del dato */\n.a:hover .g { opacity: 1; }")).toEqual([]);
    expect(hoverSueltos("/* hover-tactil: corto */\n.a:hover { x: 1; }")).toHaveLength(1);
    expect(hoverSueltos("/* hover-tactil: el globito es la lectura del dato */\n.a { x: 1; }\n.b:hover { x: 1; }")).toHaveLength(1);
  });
});

describe("todo :hover del ERP es solo con mouse", () => {
  const raiz = join(__dirname, "..");
  const archivos = archivosCss(join(raiz, "app")).concat(archivosCss(join(raiz, "components")));

  it("lee los archivos de estilos", () => {
    expect(archivos.length).toBeGreaterThan(40);
  });

  it("ningún :hover queda fuera de @media (hover: hover)", () => {
    const hallazgos = archivos.flatMap((f) =>
      hoverSueltos(readFileSync(f, "utf8")).map((s) => `${relative(raiz, f)}:${s.linea}  ${s.selector}`),
    );
    expect(
      hallazgos,
      "Envuelve la regla en `@media (hover: hover) { … }` (deja afuera el :focus-visible y lo marcado). Si de verdad debe responder " +
        "al toque, ponle justo antes `/* hover-tactil: <por qué> */`. Ver «EL MOUSE ENCIMA» en app/globals.css (ADR-0479).",
    ).toEqual([]);
  });
});
