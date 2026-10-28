import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado: un atributo JSX entre comillas (`texto="S/ 100"`) NO interpreta escapes de JavaScript; la pantalla
// muestra las letras « » tal cual. Un texto con escape va como expresión: `texto={"S/ 100"}`.
//
// Por qué existe: el 2026-10-27 «¿Y de cada S/ 100?» salió así en Finanzas ▸ Resumen, y el `aria-label` de al lado
// habría hecho leer «u00a0» a un lector de pantalla. Ni el tipo ni el build lo ven: es una cadena válida.
//
// Contrato. PROMETE: que ningún archivo de `app/` ni `components/` tiene un atributo JSX con comillas que contenga
// `\uXXXX`, `\u{…}`, `\xXX` o `\n`. ASUME: la web arma su HTML con JSX. NO PROMETE: ver el escape que llegue por una
// variable; eso sí se interpreta bien, porque ya es una cadena de JavaScript.

const ESCAPE = /\\(?:u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2}|n)/;

/** Las líneas donde un atributo JSX escrito con comillas trae un escape que el navegador mostraría literal. */
function escapesEnAtributos(ruta: string, fuente: string): number[] {
  if (!fuente.includes("\\")) return []; // el atajo barato
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isJsxAttribute(nodo) && nodo.initializer && ts.isStringLiteral(nodo.initializer)) {
      // `getText` devuelve el texto tal como se escribió (con la barra); `.text` ya lo habría interpretado.
      if (ESCAPE.test(nodo.initializer.getText(archivo))) {
        lineas.push(archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1);
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return lineas;
}

describe("cómo se reconoce un escape que no se interpreta", () => {
  it("el atributo entre comillas con \\u00a0", () => {
    const fuente = 'export const A = () => <Boton texto="¿Y de cada S/\\u00a0100?" />;';
    expect(escapesEnAtributos("a.tsx", fuente)).toEqual([1]);
  });

  it("la expresión con llaves sí se interpreta: no es hallazgo", () => {
    const fuente = 'export const B = () => <Boton texto={"S/\\u00a0100"} />;';
    expect(escapesEnAtributos("b.tsx", fuente)).toEqual([]);
  });

  it("un escape dentro de una cadena de JavaScript o del hijo de un elemento no cuenta", () => {
    const fuente = 'const t = "S/\\u00a0100";\nexport const C = () => <p>{t}</p>;';
    expect(escapesEnAtributos("c.tsx", fuente)).toEqual([]);
  });
});

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [ruta] : [];
  });
}

describe("ningún texto de pantalla muestra un escape sin interpretar", () => {
  it("ningún atributo JSX de app/ o components/", () => {
    const hallados = ["app", "components"]
      .flatMap(fuentesBajo)
      .flatMap((ruta) => escapesEnAtributos(ruta, readFileSync(join(WEB, ruta), "utf8")).map((linea) => `${ruta}:${linea}`));
    expect(
      hallados,
      'Un atributo con comillas no interpreta "\\u00a0": la pantalla muestra la barra y las letras. ' +
        'Escríbelo como expresión: texto={"S/\\u00a0100"}.',
    ).toEqual([]);
  });
});
