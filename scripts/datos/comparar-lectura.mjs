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
 * Por eso hay que ignorar los comentarios: uno que cita `agregar_colaborador` entre acentos graves NO usa la función,
 * y contarlo taparía a una función que de verdad sobra.
 *
 * POR QUÉ CON EL PARSER DE TYPESCRIPT Y NO A MANO. La primera versión leía el texto con un recorrido propio y se
 * equivocaba en código real: un literal de expresión regular con `//` (`/^https?:\/\//i`) lo tomaba por un comentario, y
 * el idioma CSV `/[;"\n]/.test(s) ? `"…"` : s` desincronizaba el estado de las plantillas y dejaba comentarios sin
 * quitar varias líneas después. Distinguir un comentario de una expresión regular, de un texto o de una plantilla
 * es justo el trabajo del parser, y ya está en el repo (dependencia de la raíz): aquí no se reescribe.
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

const esDeJSDoc = (n) => n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode;

/**
 * El texto con los comentarios reemplazados por espacios. Conserva la longitud y los saltos de línea, así una posición
 * en el resultado es la misma posición en el original (los números de línea no se mueven).
 *
 * Cómo: lo que hay entre el final de un token y el principio del siguiente es SOLO espacio y comentarios (el parser lo
 * llama «trivia»). Se recorren todos los tokens y en cada trivia se borra lo que no sea espacio. Un `//` dentro de un
 * texto, de una plantilla o de una expresión regular no es trivia de nadie, así que no se toca.
 */
export function sinComentarios(texto, ruta = "archivo.tsx") {
  const sf = parsear(texto, ruta);
  const salida = texto.split("");
  const blanquear = (desde, hasta) => {
    for (let i = desde; i < hasta; i++) if (!/\s/.test(salida[i])) salida[i] = " ";
  };
  const visita = (nodo) => {
    if (esDeJSDoc(nodo)) return; // su texto es un comentario: lo borra la trivia del token que le sigue
    const hijos = nodo.getChildren(sf);
    if (hijos.length === 0) {
      // (Para el texto de un JSX —`<p>// no es un comentario</p>`— `getStart` ya no salta lo que parece un comentario.)
      blanquear(nodo.pos, nodo.getStart(sf));
      return;
    }
    for (const h of hijos) visita(h);
  };
  visita(sf);
  return salida.join("");
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
