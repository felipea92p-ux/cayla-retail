/**
 * La lectura de código que usa `comparar.mjs`, separada para poder probarla (ese archivo se ejecuta al importarlo).
 *
 * EL PROBLEMA QUE RESUELVE. `comparar.mjs` solo veía una llamada escrita como `.rpc("nombre", …)` con el nombre
 * literal como primer argumento. Cualquier otra forma —un ternario `.rpc(p.activo ? "desactivar_proveedor" :
 * "reactivar_proveedor", …)`, un ayudante `llamar("cerrar_periodo", …)`— era invisible, y `DRIFT.md` decía de esa
 * función «ninguna pantalla la usa… una función que sobra y habría que retirar». Quien confiara en esa frase podía
 * retirar una función viva y romper Finanzas o Proveedores en las tiendas.
 *
 * LA REGLA. Un nombre de función de producción que aparece ENTRE COMILLAS en código de una pantalla (no en un
 * comentario ni en una prueba) cuenta como usado: no se puede leer qué parámetros manda, pero la pantalla lo nombra.
 * Los comentarios no cuentan: uno que cita `agregar_colaborador` entre acentos graves NO usa la función, y contarlo
 * taparía a una función que de verdad sobra.
 *
 * POR QUÉ CON EL PARSER DE TYPESCRIPT Y NO A MANO. Este script leía el código con recorridos propios (una expresión
 * regular para `.rpc(`, un contador de llaves y comillas para las claves de los parámetros) y se equivocaba en código
 * real: un literal de expresión regular con una comilla o con `//` (`t.replace(/'/g, "’")`, `/^https?:\/\//i`) lo
 * desordenaba, y un comentario entre la coma y una clave hacía que la clave no se reconociera (8 avisos falsos de «no manda
 * `p_x`»). Distinguir un comentario de una expresión regular, de un texto o de una plantilla es justo el trabajo del
 * parser, y ya está en el repo (dependencia de la raíz): aquí no se reescribe.
 */
import { createRequire } from "node:module";

let ts;
try {
  ts = createRequire(import.meta.url)("typescript");
} catch {
  throw new Error("comparar-lectura.mjs necesita `typescript` (dependencia de la raíz del repo): corre `pnpm install`.");
}

/** Las pruebas no son pantallas: ni sus llamadas ni sus menciones cuentan como «la pantalla usa la función». */
export function esDePrueba(ruta) {
  return /\.test\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(ruta);
}

/** Los archivos que se leen: TypeScript y JavaScript (un `.js` o un `.jsx` también puede llamar a `.rpc`). */
export const EXTENSIONES_DE_CODIGO = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function parsear(texto, ruta) {
  const tipo = /\.tsx$/.test(ruta) ? ts.ScriptKind.TSX : /\.jsx$/.test(ruta) ? ts.ScriptKind.JSX : /\.(js|mjs|cjs)$/.test(ruta) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  return ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, tipo);
}

// `x as never`, `(x)`, `x!`, `x satisfies T`, `<T>x`: lo que envuelve a un valor sin cambiarlo.
function desenvolver(e) {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  return e;
}

// Los textos que puede valer una expresión que se usa como NOMBRE de función: el texto mismo, las dos ramas de un ternario
// (`c ? "a" : "b"`) o los lados de `||`, `??`, `&&`. Todo lo demás (una variable, `MAPA["x"]`, una plantilla con partes) no se
// lee: `[]`. Un texto que solo es la llave de un objeto (`RPC["abrir"]`) NO cuenta como nombre.
function nombresPosibles(e) {
  e = desenvolver(e);
  if (ts.isStringLiteralLike(e)) return [e.text];
  if (ts.isConditionalExpression(e)) return [...nombresPosibles(e.whenTrue), ...nombresPosibles(e.whenFalse)];
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(e.operatorToken.kind)) return [...nombresPosibles(e.left), ...nombresPosibles(e.right)];
  return [];
}

/**
 * Cuántos errores de sintaxis vio el parser en el archivo. Con un error, el parser sigue y devuelve un árbol truncado: las
 * llamadas que vienen después pueden no aparecer, sin que nada falle. `comparar.mjs` lo lista como «no analizado».
 */
export function erroresDeSintaxis(texto, ruta = "archivo.tsx") {
  return parsear(texto, ruta).parseDiagnostics.length;
}

/**
 * Las llamadas `X.rpc(…)` de un archivo (`supabase.rpc`, `createClient().rpc`…), leídas del árbol, una por llamada:
 *
 *   { linea, nombre, nombresEnElNombre, argumentos, claves }
 *
 *   · `nombre`: el nombre de la función si el primer argumento es UN texto (`"x"`, `"x" as never`), y `null` si es otra
 *     cosa (una variable, un ternario, una plantilla con partes). En ese caso `nombresEnElNombre` trae los textos que
 *     puede valer (los dos de `cond ? "a" : "b"`): son nombres de función por construcción, y `[]` si no hay ninguno
 *     legible (una variable, `MAPA["x"]`).
 *   · `argumentos`: `"ninguno"` (`.rpc("x")`), `"objeto"` (`{ p_a: 1 }`: sus claves están en `claves`, solo las del primer
 *     nivel), `"objeto con spread"` (`{ ...resto }`), `"objeto con clave calculada"` (`{ [k]: 1 }`) o `"no es un objeto"`
 *     (una variable, un ternario…). En los tres últimos no se puede saber qué parámetros manda, pero las `claves`
 *     escritas ahí mismo sí se leen (una clave que la función no acepta falla siempre, haya o no un «...»).
 *   · `linea`: la línea de `.rpc`, contada desde 1.
 */
export function llamadasRpc(texto, ruta = "archivo.tsx") {
  const sf = parsear(texto, ruta);
  const llamadas = [];
  const visita = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "rpc" && n.arguments.length > 0) {
      const [primero, segundo] = n.arguments;
      const nombreDelTexto = desenvolver(primero);
      const llamada = {
        linea: sf.getLineAndCharacterOfPosition(n.expression.name.getStart(sf)).line + 1,
        nombre: ts.isStringLiteralLike(nombreDelTexto) ? nombreDelTexto.text : null,
        nombresEnElNombre: ts.isStringLiteralLike(nombreDelTexto) ? [] : nombresPosibles(primero),
        argumentos: "ninguno",
        claves: [],
      };
      if (segundo) {
        const objeto = desenvolver(segundo);
        if (!ts.isObjectLiteralExpression(objeto)) llamada.argumentos = "no es un objeto";
        else {
          llamada.argumentos = "objeto";
          for (const p of objeto.properties) {
            if (ts.isSpreadAssignment(p)) llamada.argumentos = "objeto con spread";
            else if (p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name) || ts.isNumericLiteral(p.name))) llamada.claves.push(p.name.text);
            else if (llamada.argumentos === "objeto") llamada.argumentos = "objeto con clave calculada";
          }
        }
      }
      llamadas.push(llamada);
    }
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return llamadas;
}

/**
 * Los usos de `.rpc` que NO son una llamada directa `x.rpc(…)` y por los que se puede llamar a una función sin que
 * `llamadasRpc` lo vea: `const r = x.rpc.bind(x)`, `const { rpc } = x`, `x["rpc"](…)`, `(x.rpc as Tipo)(…)`, `const f = x.rpc`.
 * Devuelve `[{ linea, forma }]`. NO cuenta `op.rpc === "…"` (un campo de un objeto cualquiera): solo lo que parece un alias.
 */
export function aliasesDeRpc(texto, ruta = "archivo.tsx") {
  const sf = parsear(texto, ruta);
  const usos = [];
  const linea = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visita = (n) => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === "rpc") {
      const padre = n.parent;
      if (ts.isCallExpression(padre) && padre.expression === n) {
        // es la llamada directa de `llamadasRpc`
      } else if (ts.isPropertyAccessExpression(padre) && padre.expression === n && ["bind", "call", "apply"].includes(padre.name.text)) usos.push({ linea: linea(n), forma: `.rpc.${padre.name.text}(…)` });
      else if (ts.isVariableDeclaration(padre) && padre.initializer === n) usos.push({ linea: linea(n), forma: "se guarda en una variable" });
      else if (ts.isBinaryExpression(padre) && padre.right === n && padre.operatorToken.kind === ts.SyntaxKind.EqualsToken) usos.push({ linea: linea(n), forma: "se guarda en una variable" });
      else if (ts.isAsExpression(padre) || ts.isParenthesizedExpression(padre) || ts.isNonNullExpression(padre) || ts.isSatisfiesExpression(padre) || ts.isTypeAssertionExpression(padre)) {
        let sube = padre;
        while (sube.parent && (ts.isAsExpression(sube.parent) || ts.isParenthesizedExpression(sube.parent) || ts.isNonNullExpression(sube.parent) || ts.isSatisfiesExpression(sube.parent) || ts.isTypeAssertionExpression(sube.parent))) sube = sube.parent;
        if (ts.isCallExpression(sube.parent) && sube.parent.expression === sube) usos.push({ linea: linea(n), forma: "se llama con un cast: `(x.rpc as …)(…)`" });
      }
    } else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "rpc") usos.push({ linea: linea(n), forma: 'x["rpc"]' });
    else if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent) && (n.propertyName ?? n.name).getText(sf) === "rpc") usos.push({ linea: linea(n), forma: "`const { rpc } = x`" });
    ts.forEachChild(n, visita);
  };
  visita(sf);
  return usos;
}

/**
 * Los nombres de `conocidos` (un `Set` de nombres de función) que aparecen como un TEXTO entre comillas en el código de
 * `texto` (`"x"`, `'x'` o `` `x` `` sin partes), con la línea de su PRIMERA aparición: `[{ nombre, linea }]`, en orden de
 * aparición. Un comentario, el texto de un JSX o el pedazo de una plantilla con más cosas NO cuentan; y «el nombre completo
 * y solo el nombre»: `"registrar_activo_x"` o `"la función registrar_activo"` tampoco.
 */
export function nombresEntreComillas(texto, conocidos, ruta = "archivo.tsx") {
  const sf = parsear(texto, ruta);
  const vistos = new Set();
  const encontrados = [];
  const visita = (nodo) => {
    if (ts.isStringLiteralLike(nodo) && conocidos.has(nodo.text) && !vistos.has(nodo.text)) {
      vistos.add(nodo.text);
      encontrados.push({ nombre: nodo.text, linea: sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1 });
    }
    ts.forEachChild(nodo, visita);
  };
  visita(sf);
  return encontrados;
}

/**
 * La fecha de la foto de producción en palabras («2026-09-25 16:09 UTC»), o `null` si no hay o no se entiende. Sale en
 * el informe porque todo lo que dice `comparar.mjs` es tan fresco como esa foto: una función creada o cambiada
 * DESPUÉS sale como «no existe» o con parámetros de más, aunque en producción ya esté bien.
 */
export function fechaDeLaFoto(iso) {
  if (typeof iso !== "string") return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
