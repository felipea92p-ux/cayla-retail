import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { soles } from "./compras-reglas";
import { traducirError } from "./error-escritura";
import { montosSinCorte } from "./montos-sin-corte";

// Candado de «un monto no se parte al bajar de renglón» (ADR-0413, 2026-10-14). Hasta ese día el ERP escribía «S/» y la cifra con un
// espacio normal en 173 textos de 111 archivos (y en `soles`, y en unas quince copias locales de `soles`): en una frase larga —un
// subtítulo de hoja, un aviso, el pie de la guía— el renglón podía terminar en «S/» y dejar «25.00» al comienzo del siguiente. Se
// vio en Fondos por rendir («su deuda pasa de S/ ⏎ 25.00», /formidable). El propio `Intl` en es-PE ya escribe el espacio que no se
// parte (` `); desde ese día el ERP también.
//
// Contrato. PROMETE: que en `app/`, `components/` y `lib/` (sin las pruebas) ningún texto que el ERP escribe trae «S/» seguido de un
// espacio normal: en el código se escribe «S/ » (o se usa `soles`), y en el texto de JSX, «S/&nbsp;». ASUME: el monto se escribe
// con «S/» junto, como en todo el repo. NO PROMETE: el valor entre comillas de un atributo JSX (`placeholder="S/ 0.00"`: una caja de
// una línea no se parte), lo que el código BUSCA en un texto (el primer argumento de `replace`, `split`, `includes`…), los comentarios,
// ni lo que llega hecho desde afuera: un mensaje o una descripción de la base se pasa por `montosSinCorte` al mostrarlo (ya lo hace
// `traducirError`). Una línea que de verdad necesita el espacio normal —lo que se guarda o se manda a Lucode— lleva en esa línea
// `// monto-partible: <por qué>`, con 10 caracteres o más.

const EXIMIDA = /\/\/\s*monto-partible:\s*\S.{9,}/;
const BUSCA = new Set(["replace", "replaceAll", "split", "startsWith", "endsWith", "includes", "indexOf", "lastIndexOf"]);

const esTextoJs = (n: ts.Node) =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n);

/** ¿Es lo que el código busca en un texto (`x.replace("S/ ", …)`), y no algo que escribe? */
const esBusqueda = (n: ts.Node) =>
  ts.isCallExpression(n.parent) &&
  n.parent.arguments[0] === n &&
  ts.isPropertyAccessExpression(n.parent.expression) &&
  BUSCA.has(n.parent.expression.name.text);

/** Las líneas donde el archivo escribe «S/» con un espacio que se puede partir. Se lee el árbol del código, no las letras: un
 *  comentario no cuenta. */
function montosPartibles(ruta: string, fuente: string): number[] {
  if (!fuente.includes("S/ ")) return []; // el atajo barato: la mayoría ni lo menciona
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineas = fuente.split("\n");
  const halladas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    if (esTextoJs(nodo) || ts.isJsxText(nodo)) {
      const crudo = fuente.slice(nodo.getStart(archivo), nodo.getEnd());
      const atributo = ts.isStringLiteral(nodo) && ts.isJsxAttribute(nodo.parent);
      if (crudo.includes("S/ ") && !atributo && !esBusqueda(nodo)) {
        const linea = archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1;
        if (!EXIMIDA.test(lineas[linea - 1] ?? "")) halladas.push(linea);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return halladas;
}

describe("el monto sin corte", () => {
  it("soles escribe el espacio que no se parte, como Intl en es-PE", () => {
    expect(soles(1234.5)).toBe("S/ 1,234.50");
    expect(new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(1234.5)).toBe(soles(1234.5));
  });

  it("montosSinCorte arregla lo que llega de la base, y no toca lo demás", () => {
    expect(montosSinCorte("Debe S/ 20.00: no puede pagar S/ 30.00.")).toBe("Debe S/ 20.00: no puede pagar S/ 30.00.");
    expect(montosSinCorte("Sin montos: 3 prendas.")).toBe("Sin montos: 3 prendas.");
    expect(montosSinCorte("Ya venía bien: S/ 5.00")).toBe("Ya venía bien: S/ 5.00");
  });

  it("el mensaje de una función de la base sale con sus montos sin corte", () => {
    expect(traducirError({ code: "P0001", message: "Debe S/ 20.00: no puede pagar S/ 30.00." }, "registrar su pago")).toBe(
      "Debe S/ 20.00: no puede pagar S/ 30.00.",
    );
  });
});

describe("cómo se reconoce un monto que se puede partir", () => {
  it("en un texto, una plantilla, una suma de textos y el texto de JSX", () => {
    const fuente = [
      'const a = "Faltan S/ 5.00";',
      "const b = `Debe S/ ${monto}`;",
      'const c = "S/ " + monto.toFixed(2);',
      "export const D = () => <p>Desde S/ {minimo}</p>;",
      "const e = `${x} y S/ ${y}`;",
    ].join("\n");
    expect(montosPartibles("a.tsx", fuente)).toEqual([1, 2, 3, 4, 5]);
  });

  it("lo que ya va sin corte, un comentario, un atributo y lo que se busca no cuentan", () => {
    const fuente = [
      'const a = "Faltan S/\\u00a05.00";',
      "const b = `Debe S/\\u00a0${monto}`;",
      "// «S/ 5.00» en un comentario",
      "export const C = () => <p title={x}>Desde S/&nbsp;{minimo}</p>;",
      'export const D = () => <input placeholder="S/ 0.00" />;',
      'const e = texto.replace("S/ ", "");',
      "const f = /^S\\/ /.test(x);",
    ].join("\n");
    expect(montosPartibles("b.tsx", fuente)).toEqual([]);
  });

  it("se exime con «// monto-partible:» y su porqué en la misma línea, nunca sin porqué", () => {
    const fuente = [
      "const a = `S/ ${n}`; // monto-partible: se guarda en la cola de Lucode",
      "const b = `S/ ${n}`; // monto-partible: ok",
    ].join("\n");
    expect(montosPartibles("c.ts", fuente)).toEqual([2]);
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.[jt]sx?$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name) ? [ruta] : [];
  });
}

describe("todo monto del ERP se escribe sin corte", () => {
  it("ningún archivo de app/, components/ o lib/ escribe «S/» con un espacio normal", () => {
    const halladas = ["app", "components", "lib"]
      .flatMap(fuentesBajo)
      .flatMap((ruta) => montosPartibles(ruta, readFileSync(join(WEB, ruta), "utf8")).map((l) => `${ruta}:${l}`));
    expect(
      halladas,
      "Estas líneas escriben «S/» con un espacio normal, y un renglón puede partir el monto («S/» al final, la cifra abajo). Usa " +
        "`soles(n)` (lib/compras-reglas.ts), o escribe «S/\\u00a0» en el código y «S/&nbsp;» en el texto de JSX. Un texto que llega de la " +
        "base pásalo por `montosSinCorte`. Si de verdad va el espacio normal (se guarda, va a Lucode), escribe en esa línea " +
        "`// monto-partible: <por qué>`.",
    ).toEqual([]);
  });
});
