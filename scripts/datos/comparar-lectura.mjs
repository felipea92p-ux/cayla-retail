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
  return /\.test\.(ts|tsx|mts)$/.test(ruta);
}

function parsear(texto, ruta) {
  const tipo = ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(ruta, texto, ts.ScriptTarget.Latest, true, tipo);
}

// `x as never`, `(x)`, `x!`, `x satisfies T`, `<T>x`: lo que envuelve a un valor sin cambiarlo.
function desenvolver(e) {
  while (ts.isAsExpression(e) || ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  return e;
}

// Todos los textos entre comillas (`"x"`, `'x'`, `` `x` `` sin partes) que hay dentro de una expresión.
function textosDe(nodo) {
  const textos = [];
  const visita = (n) => {
    if (ts.isStringLiteralLike(n)) textos.push(n.text);
    ts.forEachChild(n, visita);
  };
  visita(nodo);
  return textos;
}

/**
 * Las llamadas `X.rpc(…)` de un archivo (`supabase.rpc`, `createClient().rpc`…), leídas del árbol, una por llamada:
 *
 *   { linea, nombre, nombresEnElNombre, argumentos, claves }
 *
 *   · `nombre`: el nombre de la función si el primer argumento es UN texto (`"x"`, `"x" as never`), y `null` si es otra
 *     cosa (una variable, un ternario, una plantilla con partes). En ese caso `nombresEnElNombre` trae los textos que
 *     hay dentro (los dos de `cond ? "a" : "b"`); el que llama decide cuáles son funciones conocidas.
 *   · `argumentos`: `"ninguno"` (`.rpc("x")`), `"objeto"` (`{ p_a: 1 }`: sus claves están en `claves`, solo las del primer
 *     nivel), `"objeto con spread"` (`{ ...resto }`), `"objeto con clave calculada"` (`{ [k]: 1 }`) o `"no es un objeto"`
 *     (una variable, un ternario…). En los tres últimos no se puede saber qué parámetros manda.
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
        nombresEnElNombre: ts.isStringLiteralLike(nombreDelTexto) ? [] : textosDe(primero),
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
 * Los nombres de `conocidos` (un `Set` de nombres de función de producción) que aparecen como un TEXTO entre comillas en
 * el código de `texto` (`"x"`, `'x'` o `` `x` `` sin partes), con la línea de su PRIMERA aparición: `[{ nombre, linea }]`,
 * en orden de aparición. Un comentario, el texto de un JSX o el pedazo de una plantilla con más cosas NO cuentan; y
 * «el nombre completo y solo el nombre»: `"registrar_activo_x"` o `"la función registrar_activo"` tampoco.
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
