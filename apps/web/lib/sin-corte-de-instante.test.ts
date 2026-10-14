import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado de «el día de un instante se lee en Lima» (2026-10-14). Un instante —un timestamptz: `created_at`, `cerrado_en`,
// `inventariado_at`…— llega de la base en UTC: «2026-10-14T01:00:00+00:00» son las 20:00 del 13 en Lima. Cortarle los 10
// primeros caracteres da el día de UTC, y lo hecho de 7 pm a medianoche de Lima cae al día siguiente. Pasó en Impuestos
// (PR #1063), en Cuentas y dinero (PR #1065) y en 15 líneas más de Producción, Notas de crédito, Apartados y Análisis: se
// arreglaba un caso y nacía otro. El día de un instante se pide a `diaLima` (`lib/fechas-lima.ts`).
//
// Contrato. PROMETE: que ningún archivo de `app/`, `components/` o `lib/` le corta los 10 primeros caracteres
// (`.slice(0, 10)`, `.substring(0, 10)` o `.substr(0, 10)`) a un campo con nombre de instante —termina en `En` o `At`
// (`creadoEn`, `createdAt`) o en `_en` o `_at` (`cerrado_en`, `created_at`)—, solo o envuelto en `String(…)`, `(… ?? "")`,
// `!` o `as`. ASUME: los instantes se llaman así en todo el ERP (en `retail` las 234 columnas `_en`/`_at` son timestamptz,
// 2026-10-14). NO PROMETE: ver un instante con otro nombre (`clubDesde`, la `fecha` de un pago) ni el corte que una función de
// formato hace por dentro (`diaMes(f.cerradoEn)`): esos se revisaron a mano ese día. Un campo con nombre de instante que de verdad
// guarda una fecha sola lleva en su línea `// fecha-sola: <por qué>`, con 10 caracteres o más.

const NOMBRE_DE_INSTANTE = /(?:[a-z0-9](?:En|At)|_(?:en|at))$/;
const CORTES = new Set(["slice", "substring", "substr"]);
const EXIMIDA = /\/\/\s*fecha-sola:\s*\S.{9,}/;

/** El nombre del campo que se corta, sin lo que lo envuelve: `(x ?? "")`, `String(x)`, `x!`, `x as string`. */
function campoCortado(expr: ts.Expression): string | null {
  let e = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e)) e = e.expression;
    else if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) e = e.left;
    else if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "String" && e.arguments.length === 1) e = e.arguments[0]!;
    else break;
  }
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression)) return e.argumentExpression.text;
  return null;
}

const esNumero = (nodo: ts.Node | undefined, valor: string) => !!nodo && ts.isNumericLiteral(nodo) && nodo.text === valor;

/** Las líneas donde el archivo le corta a un instante sus 10 primeros caracteres. Un comentario o un texto no cuentan: se lee el
 *  árbol del código, no las letras. */
function cortesDeInstante(ruta: string, fuente: string): number[] {
  if (!/\b(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/.test(fuente)) return []; // el atajo barato: la mayoría ni lo menciona
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineas = fuente.split("\n");
  const halladas: number[] = [];
  const visitar = (nodo: ts.Node) => {
    if (
      ts.isCallExpression(nodo) &&
      ts.isPropertyAccessExpression(nodo.expression) &&
      CORTES.has(nodo.expression.name.text) &&
      nodo.arguments.length === 2 &&
      esNumero(nodo.arguments[0], "0") &&
      esNumero(nodo.arguments[1], "10")
    ) {
      const campo = campoCortado(nodo.expression.expression);
      const linea = archivo.getLineAndCharacterOfPosition(nodo.expression.name.getStart(archivo)).line + 1;
      if (campo && NOMBRE_DE_INSTANTE.test(campo) && !EXIMIDA.test(lineas[linea - 1] ?? "")) halladas.push(linea);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return halladas;
}

describe("cómo se reconoce el corte de un instante", () => {
  it("un campo …En, …At, _en o _at cortado a 10, con o sin ?.", () => {
    const fuente = [
      "const a = o.creadoEn.slice(0, 10);",
      "const b = f.cerradoEn?.slice(0, 10) ?? f.fecha;",
      "const c = c.createdAt.substring(0, 10);",
      "const d = fila.created_at.substr(0, 10);",
      "const e = fila['inventariado_at'].slice(0, 10);",
    ].join("\n");
    expect(cortesDeInstante("a.ts", fuente)).toEqual([1, 2, 3, 4, 5]);
  });

  it("también envuelto en String(…), en (… ?? \"\"), con ! o con as", () => {
    const fuente = [
      'const a = String(f.created_at ?? "").slice(0, 10);',
      'const b = (o.inventariadoEn ?? "").slice(0, 10);',
      "const c = o.creadoEn!.slice(0, 10);",
      "const d = (o.creadoEn as string).slice(0, 10);",
    ].join("\n");
    expect(cortesDeInstante("b.ts", fuente)).toEqual([1, 2, 3, 4]);
  });

  it("una fecha sola, otro corte o un nombre que no es de instante no cuentan", () => {
    const fuente = [
      "const a = f.fecha.slice(0, 10);",
      "const b = f.vigenteDesde.slice(0, 10);",
      "const c = o.creadoEn.slice(0, 7);",
      "const d = o.creadoEn.slice(11, 16);",
      "const e = new Date().toISOString().slice(0, 10);",
      "const g = orden.slice(0, 10);",
      "const h = token.slice(0, 10);",
    ].join("\n");
    expect(cortesDeInstante("c.ts", fuente)).toEqual([]);
  });

  it("un comentario o un texto que lo nombran no son un corte", () => {
    const fuente = `// o.creadoEn.slice(0, 10) daba el día de UTC\nconst t = "o.creadoEn.slice(0, 10)";\nexport const C = () => <p title="x.createdAt.slice(0, 10)">{"x.cerradoEn.slice(0, 10)"}</p>;`;
    expect(cortesDeInstante("c.tsx", fuente)).toEqual([]);
  });

  it("se exime con «// fecha-sola:» y su porqué en la misma línea, nunca sin porqué", () => {
    const fuente = [
      "const a = f.vigenteEn.slice(0, 10); // fecha-sola: la columna es date, no timestamptz",
      "const b = f.vigenteEn.slice(0, 10); // fecha-sola: ok",
    ].join("\n");
    expect(cortesDeInstante("d.ts", fuente)).toEqual([2]);
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

describe("la web no le corta a un instante el día de UTC", () => {
  it("ningún archivo de app/, components/ o lib/", () => {
    const hallados = ["app", "components", "lib"]
      .flatMap(fuentesBajo)
      .flatMap((ruta) => cortesDeInstante(ruta, readFileSync(join(WEB, ruta), "utf8")).map((linea) => `${ruta}:${linea}`));
    expect(
      hallados,
      "Estas líneas cortan un instante (timestamptz, que la base manda en UTC) a sus 10 primeros caracteres: muestran el día de UTC, " +
        "y lo hecho de 7 pm a medianoche de Lima cae al día siguiente. Pide el día de Lima con `diaLima(instante)` " +
        "(`lib/fechas-lima.ts`): da `aaaa-mm-dd` o `null` si no se lee, y `diaMes(diaLima(x))` lo muestra como dd/mm. Si el campo " +
        "de verdad guarda una fecha sola, escribe en esa línea `// fecha-sola: <por qué>`.",
    ).toEqual([]);
  });
});
