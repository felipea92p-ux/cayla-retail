#!/usr/bin/env node
/**
 * Escáner de LECTURAS ANTES DE DECLARAR: un `const` o un `let` que se lee, en el momento, antes de la línea que lo declara.
 *
 * POR QUÉ EXISTE. El 2026-11-26 «Cerrar caja» se cayó en Lima (Sentry CAYLA-RETAIL-1G, «Cannot access 'W' before
 * initialization», PR #2038): `CerrarCajaModalV2` calculaba `cierresAliadas?.find((c) => … destino …)` nueve líneas antes de
 * `const [destino] = useState(…)`. En JavaScript un `const` existe desde el inicio de su bloque pero no se puede leer hasta su
 * línea (la «zona muerta»): leerlo antes lanza un error y la pantalla entera se cae. TypeScript solo lo ve si la lectura es
 * directa; dentro de una función (el `.find`) se calla, porque no sabe cuándo correrá esa función.
 *
 * QUÉ CUENTA. Una lectura de un `const`/`let` que aparece antes del final de su declaración, en el mismo bloque o uno de
 * adentro, y que corre EN ESE MOMENTO: directa, o dentro de funciones que se ejecutan ahí mismo —
 *   · los métodos de una lista o un texto que llaman su función al instante (`.find`, `.map`, `.filter`, `.some`, `.reduce`,
 *     `.sort`, `.forEach`, `.flatMap`, `.replace`…; ver `LLAMAN_AL_INSTANTE`) y `Array.from(x, fn)`;
 *   · los ganchos de React que corren su función durante el render (`useMemo`, el valor inicial de `useState`/`useReducer`,
 *     `useSyncExternalStore`);
 *   · una función que se llama donde se escribe (`(() => …)()`).
 * QUÉ NO CUENTA (no se cae): una lectura dentro de una función que corre DESPUÉS — `useEffect`, `useCallback`, un `onClick`,
 * un `setTimeout`, una función guardada en una variable o declarada con `function`. Por eso una constante del módulo usada en
 * un componente que está más arriba no es un problema: el componente se dibuja cuando el archivo ya terminó de cargar.
 * Tampoco los tipos (`typeof x` en un tipo) ni lo que no es `const`/`let` (`var`, `function`, `class`, `import`).
 *
 * LO QUE NO VE (a propósito, para no gritar en falso). Una función declarada antes que lee la variable y se LLAMA antes de
 * declararla (`const f = () => x; f(); const x = 1`): seguir la llamada pide el verificador de tipos completo. Es raro; si
 * aparece, este encabezado es el lugar para contarlo.
 *
 * MARCA. Una lectura que de verdad no corre en el momento aunque el escáner crea que sí se exime en su línea (o en el comentario
 * de arriba) con `// antes-de-declarar: <por qué, 10 caracteres o más>`. Lo normal es mover la declaración más arriba.
 *
 * Es la ÚNICA definición de la regla: la importa `apps/web/lib/antes-de-declarar.test.ts` (candado del CI).
 *
 * USO   node scripts/antes-de-declarar/escanear.mjs [--json]
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { RAIZ, cargarTS, leer, lineaDe, listarFuentes, parsear, rel } from "../rendimiento/comun.mjs";

/** Las carpetas que se revisan: todo el código de las dos apps y de los paquetes compartidos. */
export const CARPETAS = ["apps/web", "apps/tienda", "packages/shared/src"];

/** La marca de una excepción, con su motivo (10 caracteres o más, como las demás marcas del repo). */
export const MARCA = /antes-de-declarar:\s*\S.{9,}/;

/** Métodos que llaman a su función al instante (de listas, textos, Map/Set y promesas no: `.then` corre después). */
export const LLAMAN_AL_INSTANTE = new Set([
  "find", "findIndex", "findLast", "findLastIndex", "filter", "map", "flatMap", "forEach", "some", "every",
  "reduce", "reduceRight", "sort", "toSorted", "replace", "replaceAll",
]);

/** Ganchos de React que corren su PRIMERA función durante el render. */
const GANCHOS_AL_INSTANTE = new Set(["useMemo", "useState", "useSyncExternalStore"]);

/** Nombre de lo que se llama: `useMemo(…)`, `React.useMemo(…)`, `lista.find(…)`. */
function nombreLlamado(ts, expr) {
  if (ts.isIdentifier(expr)) return { nombre: expr.text, metodo: false };
  if (ts.isPropertyAccessExpression(expr)) return { nombre: expr.name.text, metodo: true, objeto: expr.expression };
  return null;
}

/** ¿Esta función (flecha o `function`) corre en el mismo momento en que se evalúa la expresión que la contiene? */
function correAlInstante(ts, fn) {
  let hijo = fn;
  let padre = fn.parent;
  while (padre && ts.isParenthesizedExpression(padre)) {
    hijo = padre;
    padre = padre.parent;
  }
  if (!padre || !ts.isCallExpression(padre)) return false;
  // `(() => …)()`: se llama donde se escribe.
  if (padre.expression === hijo) return true;
  const llamado = nombreLlamado(ts, padre.expression);
  if (!llamado) return false;
  const pos = padre.arguments.indexOf(hijo);
  if (llamado.metodo && LLAMAN_AL_INSTANTE.has(llamado.nombre)) return pos === 0;
  // `Array.from(x, fn)`: la función de mapeo corre al instante.
  if (llamado.metodo && llamado.nombre === "from" && pos === 1) return true;
  if (GANCHOS_AL_INSTANTE.has(llamado.nombre)) return pos === 0;
  // `useReducer(reducer, inicial, init)`: `init` corre en el primer render (el reductor, después).
  if (llamado.nombre === "useReducer") return pos === 2;
  return false;
}

const esFuncion = (ts, n) =>
  ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) ||
  ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);

/** Los nombres que declara un patrón (`x`, `{ a, b: c }`, `[d, ...e]`). */
function nombresDe(ts, nombre, salida = []) {
  if (ts.isIdentifier(nombre)) salida.push(nombre);
  else for (const el of nombre.elements) if (!ts.isOmittedExpression(el)) nombresDe(ts, el.name, salida);
  return salida;
}

/** ¿Este identificador está en una posición de TIPO (no se evalúa)? */
function enUnTipo(ts, n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isTypeNode(p) || ts.isTypeAliasDeclaration(p) || ts.isInterfaceDeclaration(p) || ts.isExpressionWithTypeArguments(p)) return true;
    if (ts.isExpression(p) && !ts.isIdentifier(p) || ts.isStatement(p)) return false;
  }
  return false;
}

/** ¿Este identificador es una LECTURA (no un nombre de propiedad, ni el nombre que se declara)? */
function esLectura(ts, n) {
  const p = n.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === n) return false;
  if (ts.isQualifiedName(p) && p.right === n) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p) ||
    ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isEnumMember(p)) && p.name === n) return false;
  if (ts.isBindingElement(p) && (p.name === n || p.propertyName === n)) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
    ts.isClassDeclaration(p) || ts.isClassExpression(p)) && p.name === n) return false;
  if (ts.isJsxAttribute(p) && p.name === n) return false;
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p)) return false;
  if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isExportSpecifier(p)) return false;
  // `<div>` es una etiqueta del navegador, no una variable.
  if ((ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxClosingElement(p)) && p.tagName === n && /^[a-z]/.test(n.text)) return false;
  return true;
}

/** ¿El nodo `n` está dentro de `dentroDe`? */
const dentro = (n, dentroDe) => n.pos >= dentroDe.pos && n.end <= dentroDe.end;

/**
 * Las lecturas antes de declarar de UN archivo (pura). Devuelve `[{ nombre, linea, declarada }]`.
 */
export function analizarArchivo(texto, nombreArchivo = "x.tsx") {
  const ts = cargarTS();
  const sf = parsear(texto, nombreArchivo);
  const lineas = texto.split("\n");

  // 1) Cada ámbito (archivo, bloque, función…) y lo que declara: nombre → { tdz, fin, nodo, decl }.
  const ambitos = new Map();
  const declarar = (ambito, id, info) => {
    if (!ambitos.has(ambito)) ambitos.set(ambito, new Map());
    ambitos.get(ambito).set(id.text, { ...info, id });
  };
  /** El ámbito de bloque más cercano (donde vive un `const`/`let`). */
  const bloqueDe = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p) || ts.isCaseBlock(p) || ts.isForStatement(p) ||
        ts.isForInStatement(p) || ts.isForOfStatement(p) || ts.isCatchClause(p)) return p;
      if (esFuncion(ts, p)) return p;
    }
    return sf;
  };
  /** El ámbito de función más cercano (donde vive un `var` o un parámetro). */
  const funcionDe = (n) => {
    for (let p = n.parent; p; p = p.parent) if (esFuncion(ts, p) || ts.isSourceFile(p)) return p;
    return sf;
  };

  const recorrerDeclaraciones = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isVariableDeclarationList(n.parent)) {
      const tdz = (n.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;
      const ambito = tdz ? bloqueDe(n.parent) : funcionDe(n.parent);
      // En `for (const x of xs)` la variable vive en el `for`; en el resto, en el bloque que contiene la sentencia.
      for (const id of nombresDe(ts, n.name)) declarar(ambito, id, { tdz, fin: n.end, decl: n });
    } else if (ts.isParameter(n)) {
      for (const id of nombresDe(ts, n.name)) declarar(n.parent, id, { tdz: false });
    } else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) {
      declarar(bloqueDe(n), n.name, { tdz: false });
    } else if ((ts.isFunctionExpression(n) || ts.isClassExpression(n)) && n.name) {
      declarar(n, n.name, { tdz: false });
    } else if (ts.isCatchClause(n) && n.variableDeclaration) {
      for (const id of nombresDe(ts, n.variableDeclaration.name)) declarar(n, id, { tdz: false });
    } else if (ts.isImportDeclaration(n) && n.importClause) {
      const c = n.importClause;
      if (c.name) declarar(sf, c.name, { tdz: false });
      const nb = c.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) declarar(sf, nb.name, { tdz: false });
      if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) declarar(sf, e.name, { tdz: false });
    } else if ((ts.isEnumDeclaration(n) || ts.isModuleDeclaration(n)) && ts.isIdentifier(n.name)) {
      declarar(bloqueDe(n), n.name, { tdz: false });
    }
    ts.forEachChild(n, recorrerDeclaraciones);
  };
  recorrerDeclaraciones(sf);

  // 2) Cada lectura: se busca su declaración subiendo de ámbito en ámbito (la más cercana gana, como en JavaScript).
  const hallazgos = [];
  const marcado = (linea) => MARCA.test(lineas[linea - 1] ?? "") || MARCA.test(lineas[linea - 2] ?? "");

  const revisar = (id) => {
    let decl = null;
    let ambito = null;
    for (let p = id.parent; p; p = p.parent) {
      const m = ambitos.get(p);
      if (m?.has(id.text)) {
        decl = m.get(id.text);
        ambito = p;
        break;
      }
    }
    if (!decl || !decl.tdz) return;
    if (id.getStart(sf) >= decl.fin) return;
    if (dentro(id, decl.decl.name)) return;
    // ¿Corre en el momento? Toda función que haya entre la lectura y el ámbito de la variable tiene que correr al instante.
    for (let p = id.parent; p && p !== ambito; p = p.parent) {
      if (esFuncion(ts, p) && !correAlInstante(ts, p)) return;
      if (ts.isClassDeclaration(p) || ts.isClassExpression(p)) return;
    }
    const linea = lineaDe(sf, id);
    if (marcado(linea)) return;
    hallazgos.push({ nombre: id.text, linea, declarada: lineaDe(sf, decl.id) });
  };

  const recorrerLecturas = (n) => {
    // `{ destino }` también es una lectura: su identificador llega por aquí (el padre es el atajo, que `esLectura` no excluye).
    if (ts.isIdentifier(n) && esLectura(ts, n) && !enUnTipo(ts, n)) revisar(n);
    ts.forEachChild(n, recorrerLecturas);
  };
  recorrerLecturas(sf);
  return hallazgos;
}

/** Los archivos que se revisan (rutas absolutas). */
export const fuentes = () => CARPETAS.flatMap((c) => listarFuentes(join(RAIZ, c)));

/** Todas las lecturas antes de declarar del repo: ruta relativa a la raíz → hallazgos. */
export function lecturasAntesDeDeclarar() {
  const salida = {};
  for (const ruta of fuentes()) {
    const h = analizarArchivo(leer(ruta), ruta);
    if (h.length) salida[rel(ruta)] = h;
  }
  return salida;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const todo = lecturasAntesDeDeclarar();
  if (process.argv.includes("--json")) console.log(JSON.stringify(todo, null, 2));
  else {
    const n = Object.values(todo).reduce((s, h) => s + h.length, 0);
    for (const [archivo, hs] of Object.entries(todo))
      for (const h of hs) console.log(`${archivo}:${h.linea}  «${h.nombre}» se lee antes de su línea ${h.declarada}`);
    console.log(n ? `\n✗ ${n} lectura(s) antes de declarar.` : "✓ Ninguna lectura antes de declarar.");
    process.exitCode = n ? 1 : 0;
  }
}
