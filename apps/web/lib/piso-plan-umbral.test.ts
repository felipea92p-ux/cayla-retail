import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/* ====================================================================
   UNA sola casa para las cifras del piso (ADR-0328 act. 7)

   EL PROBLEMA QUE VIGILA. La misma pregunta —¿falta o sobra en el piso?— llegó a tener cinco reglas, cada una con su número:
   piso ≤ 4 en la política de Existencias, «0 en el piso y algo atrás» en las reglas de inventario, «se está cortando» con
   piso ≤ 1 en Análisis… y Tienda TRU terminó con «Reponer» en sus 510 tallas de 510. Desde la actividad 7 lo decide UN motor,
   `lib/piso-plan.ts`. Esta prueba falla si alguien vuelve a comparar lo colgado contra un umbral fuera de ese archivo.

   QUÉ CUENTA COMO «UMBRAL DE PISO». Se lee el código de verdad (el árbol de TypeScript, no el texto: un comentario o un texto
   de pantalla no cuentan) y se busca una comparación `<`, `<=`, `>`, `>=` donde un lado es una cifra de piso (`piso`,
   `pisoDisponible`, `pisoLibre`, `piso_libre`, `stockPiso`, `enPiso`, `colgadas`, o los días que cubre: `pisoCubreDias`,
   `coberturaPiso`, `diasDePiso`, o una de esas dividida por algo) y el otro un número de 1 para arriba o un nombre de umbral
   (`umbral…`, `minimo…`, `requisito…`, `…alerta…`). Comparar con 0 («¿hay algo colgado?») no es un umbral: es presencia.
   Y el nombre retirado `umbralStockPisoReposicion` no puede volver en ningún lado.

   LA DEUDA DE ANTES. Análisis tiene sus propias cifras de piso, de antes del motor (dos «piso ≤ 1» y los días que cubre el piso
   contra `DIAS_PISO_ALERTA`); las reemplaza la actividad 11 («se vendió rápido y falta»). Están listadas abajo con su cuenta
   EXACTA: la lista solo puede bajar. Un archivo nuevo no puede entrar.
   ==================================================================== */

const RAIZ = join(__dirname, "..");
const CARPETAS = ["lib", "components", "app"];
const CASA = "lib/piso-plan.ts";

// Las cifras de lo colgado, y las que salen de dividirlo por un ritmo (días que cubre el piso): `piso / ritmo < 3` es el mismo
// umbral de piso con otra cara (revisión adversarial: Análisis decide «Bajar al piso» así y la prueba no lo veía).
const CIFRAS_DE_PISO = new Set([
  "piso",
  "pisoDisponible",
  "pisoLibre",
  "piso_libre",
  "stockPiso",
  "stock_piso",
  "enPiso",
  "colgadas",
  "pisoCubreDias",
  "coberturaPiso",
  "diasDePiso",
]);
const NOMBRE_DE_UMBRAL = /umbral|minimo|requisito|alerta/i;
const COMPARACIONES = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

/** La deuda de Análisis, anterior al motor, con cuántas cifras de piso tiene cada archivo. Solo baja (actividad 11). */
const DEUDA_DE_ANALISIS: Record<string, number> = {
  // «La talla que se está cortando» de la prenda top: piso ≤ 1.
  "lib/analisis-que-hacer.ts": 1,
  // «Bajar al piso» del Resumen cuando lo colgado cubre menos de 3 días al ritmo de la talla (`DIAS_PISO_ALERTA`).
  "lib/resumen-reglas.ts": 1,
};

/** Lo que la comparación mira de verdad: sin paréntesis, sin `!`, sin `as`, y en `a ?? b` el lado `a`. */
function nucleo(e: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) return nucleo(e.expression);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) return nucleo(e.left);
  return e;
}
function nombre(e: ts.Expression): string | null {
  const n = nucleo(e);
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  if (ts.isElementAccessExpression(n) && ts.isStringLiteral(n.argumentExpression)) return n.argumentExpression.text;
  return null;
}
/** Una cifra de piso, o una cifra de piso dividida por algo (`f.piso / demanda`: los días que cubre lo colgado). */
function esCifraDePiso(e: ts.Expression): boolean {
  const n = nucleo(e);
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.SlashToken) return esCifraDePiso(n.left);
  return CIFRAS_DE_PISO.has(nombre(n) ?? "");
}
function esUmbral(e: ts.Expression): boolean {
  const n = nucleo(e);
  if (ts.isNumericLiteral(n)) return Number(n.text) >= 1;
  const nom = nombre(n);
  return nom !== null && NOMBRE_DE_UMBRAL.test(nom);
}

/** Las comparaciones de lo colgado contra un umbral, y el nombre retirado, en un archivo. */
export function umbralesDePiso(ruta: string, texto: string): string[] {
  const fuente = ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, ruta.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hallados: string[] = [];
  const visitar = (n: ts.Node) => {
    if (ts.isBinaryExpression(n) && COMPARACIONES.has(n.operatorToken.kind)) {
      if ((esCifraDePiso(n.left) && esUmbral(n.right)) || (esCifraDePiso(n.right) && esUmbral(n.left))) {
        const { line } = fuente.getLineAndCharacterOfPosition(n.getStart());
        hallados.push(`${ruta}:${line + 1} ${n.getText()}`);
      }
    }
    if (ts.isIdentifier(n) && n.text === "umbralStockPisoReposicion") {
      const { line } = fuente.getLineAndCharacterOfPosition(n.getStart());
      hallados.push(`${ruta}:${line + 1} umbralStockPisoReposicion`);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(fuente);
  return hallados;
}

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const nombreArchivo of readdirSync(dir)) {
    if (nombreArchivo === "node_modules" || nombreArchivo.startsWith(".")) continue;
    const ruta = join(dir, nombreArchivo);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (/\.(ts|tsx)$/.test(nombreArchivo) && !/\.test\.tsx?$/.test(nombreArchivo)) salida.push(ruta);
  }
  return salida;
}

describe("una sola casa para las cifras del piso", () => {
  const porArchivo = new Map<string, string[]>();
  for (const carpeta of CARPETAS) {
    for (const ruta of archivos(join(RAIZ, carpeta))) {
      const rel = relative(RAIZ, ruta).split("\\").join("/");
      if (rel === CASA) continue;
      const hallados = umbralesDePiso(rel, readFileSync(ruta, "utf8"));
      if (hallados.length > 0) porArchivo.set(rel, hallados);
    }
  }

  it("fuera de lib/piso-plan.ts nadie compara lo colgado contra un umbral (salvo la deuda listada de Análisis)", () => {
    const nuevos = [...porArchivo].filter(([rel]) => !(rel in DEUDA_DE_ANALISIS)).flatMap(([, h]) => h);
    expect(nuevos, "Una cifra de piso fuera del motor: decídela en lib/piso-plan.ts y lee su decisión (planPiso).").toEqual([]);
  });

  it("la deuda de Análisis tiene su cuenta EXACTA: si bajó, baja también el número de aquí", () => {
    const cuentas = Object.fromEntries(Object.keys(DEUDA_DE_ANALISIS).map((rel) => [rel, porArchivo.get(rel)?.length ?? 0]));
    expect(cuentas).toEqual(DEUDA_DE_ANALISIS);
  });

  it("el motor sí tiene sus cifras (si esta prueba no ve las de piso-plan.ts, tampoco vería una afuera)", () => {
    const enLaCasa = umbralesDePiso(CASA, readFileSync(join(RAIZ, CASA), "utf8"));
    expect(enLaCasa.length).toBeGreaterThan(0);
  });

  it("reconoce las formas de antes (la regla de piso ≤ 4, la de Análisis y el nombre retirado) y no confunde presencia con umbral", () => {
    const caso = (codigo: string) => umbralesDePiso("x.ts", codigo).length;
    expect(caso("if (piso <= politica.umbralStockPisoReposicion) {}")).toBe(2);
    expect(caso("const c = (hoyDe(t)?.piso ?? Infinity) <= 1;")).toBe(1);
    expect(caso("const b = hoy && hoy.piso <= 1;")).toBe(1);
    expect(caso("if (4 >= f.pisoDisponible!) {}")).toBe(1);
    expect(caso("const ok = t.pisoLibre < REQUISITO_POR_COLOR;")).toBe(1);
    expect(caso("if (f.pisoDisponible <= 0 && f.almacenDisponible > 0) {}")).toBe(0);
    expect(caso("const hay = piso > 0; // piso <= 4 en un comentario no cuenta")).toBe(0);
    expect(caso('const t = "piso <= 4";')).toBe(0);
    expect(caso("const n = almacen <= 4;")).toBe(0);
    // El piso dividido por un ritmo (los días que cubre) contra un umbral también es un umbral de piso.
    expect(caso("if (pisoCubreDias < DIAS_PISO_ALERTA) {}")).toBe(1);
    expect(caso("const corto = f.piso / demanda < 3;")).toBe(1);
    expect(caso("const corto = (f.pisoDisponible ?? 0) / ritmo <= umbralDias;")).toBe(1);
    expect(caso("const largo = f.almacen / demanda < 3;")).toBe(0);
  });
});
