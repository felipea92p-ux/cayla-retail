#!/usr/bin/env node
/**
 * Escáner de OBSERVABILIDAD (skill `skill-evaluacion-observabilidad`).
 *
 * Dos niveles. (1) INFRAESTRUCTURA del repo: ¿existe algo que mida, registre y una peticiones? (2) HIGIENE por archivo, con AST:
 *   · rpc-descartada / rpc-ignora-error   una `.rpc(…)` cuyo resultado se descarta, o se lee `{ data }` sin `error` (la falla se vuelve «sin datos»);
 *   · catch-mudo        un `catch` vacío, o que solo hace `console.*` (se traga el error: no lo registra bien ni lo relanza);
 *   · relleno-silencioso   `.catch(() => null)` (o `[]`, `{}`, `() => {}`…) o un `catch { return [] }`: pone un valor en lugar del error y
 *                       nadie se entera; el historial «vacío» que en verdad no cargó. ES UN CANDADO DEL CI (ADR-0693): el que es a propósito
 *                       lo dice en su línea con `// relleno-a-proposito: <motivo>`, y lo de antes es deuda en `apps/web/lib/relleno-silencioso-archivos.ts`;
 *   · console-suelto    `console.log/warn/error` en código de servidor: sin nivel ni campos ni correlación;
 *   · fetch-sin-tope    `fetch(` sin `signal` (si el proveedor se cuelga, la petición también);
 *   · dato-personal-en-log   un `console.*` cuyos argumentos nombran dni, ruc, teléfono, correo, nombre o dirección;
 *   · accion-sin-rastro una Server Action (`"use server"`) sin ninguna señal de registro (ni log ni `throw` ni retorno de error).
 *
 * QUÉ ASUME. «Observabilidad» es poder responder desde fuera «¿qué pasó y cuánto tardó?». La AUDITORÍA DE NEGOCIO (`movimientos`,
 * Actividad) ya existe y NO cuenta como observabilidad técnica. Este escáner no sabe qué datos son sensibles de verdad: el nombre de
 * una variable es una pista. NO mide nada en producción (no hay con qué): lo dice la sección de infraestructura.
 *
 * USO   node scripts/rendimiento/observabilidad.mjs [--top 25] [--json] [--estricto]
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { RAIZ, WEB, cargarTS, leer, leerArgs, lineaDe, listarFuentes, parsear, rel, tabla } from "./comun.mjs";

const PERSONAL = /\b(dni|ruc|tel[eé]fono|celular|correo|email|nombres?|apellidos?|direcci[oó]n|documento)\b/i;

/**
 * La marca de un relleno a propósito (ADR-0693): `relleno-a-proposito: <motivo de 10 caracteres o más>`. Se llama así y no
 * `relleno-fijo` como `tema-fijo` o `sugerir-fijo` porque aquí nada queda «fijo»: lo que se declara es la intención («si falla, la
 * ficha se pinta sin el historial»), y la marca se lee como la frase que es. Sin tilde, como todas las marcas del repo.
 */
export const MARCA_RELLENO = /relleno-a-proposito:\s*\S.{9,}/;

/** Lo que se lee del cuerpo de una respuesta: si no es JSON, la falla de la petición ya se ve en `res.ok` (no es un relleno). */
const CUERPO_DE_RESPUESTA = /^(json|text|blob|arrayBuffer|formData)$/;

/** Higiene de UN archivo (pura). */
export function analizarArchivo(texto, nombre = "x.ts") {
  const ts = cargarTS();
  const sf = parsear(texto, nombre);
  const hallazgos = [];
  const marca = (n, tipo, detalle = "") => hallazgos.push({ tipo, linea: lineaDe(sf, n), detalle });
  const esServidor = /^\s*["']use server["']/m.test(texto) || !/^\s*["']use client["']/m.test(texto);
  let usaLog = false;
  let hayThrowOError = false;

  /**
   * ¿Qué pasa con el resultado de una `.rpc(…)`? Devuelve `null` si el error se trata, o el tipo de hallazgo:
   *   rpc-descartada   `await supabase.rpc(…);` suelto: el resultado ni se mira (la falla es invisible);
   *   rpc-ignora-error `const { data } = await supabase.rpc(…)` sin `error`: una falla se confunde con «no hay datos».
   * Se da por tratado lo que el repo ya hace a propósito: pasarla como argumento a un envoltorio (`exigir(…)`, `firmar(…)`,
   * `guardar(…)`), devolverla, o leer `.error` / `throwOnError`.
   */
  const veredictoRpc = (llamada) => {
    // Sube por `.setHeader(…)`, `await`, paréntesis y `as`.
    let nodo = llamada;
    for (;;) {
      const p = nodo.parent;
      if (!p) return null;
      if (ts.isAwaitExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p)) { nodo = p; continue; }
      if (ts.isPropertyAccessExpression(p) && p.expression === nodo) {
        if (/^(throwOnError|error|then|catch)$/.test(p.name.text)) return null; // `.then(({ error }) => …)` lo trata quien lo escribe
        if (p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) { nodo = p.parent; continue; }
        return null;
      }
      break;
    }
    const p = nodo.parent;
    if (ts.isCallExpression(p)) return null; // argumento de un envoltorio o de Promise.all([...]): lo trata quien lo recibe
    if (ts.isArrayLiteralExpression(p)) {
      // Elemento de `Promise.all([...])`: el patrón de desestructuración de la izquierda debe traer `error` en esa posición.
      const idx = p.elements.indexOf(nodo);
      const llamadaPadre = p.parent && ts.isCallExpression(p.parent) ? p.parent : null;
      let decl = llamadaPadre?.parent;
      while (decl && ts.isAwaitExpression(decl)) decl = decl.parent;
      if (decl && ts.isVariableDeclaration(decl) && ts.isArrayBindingPattern(decl.name)) {
        const el = decl.name.elements[idx];
        if (el && ts.isBindingElement(el) && ts.isObjectBindingPattern(el.name) && !el.name.elements.some((e) => (e.propertyName ?? e.name).getText(sf) === "error")) return "rpc-ignora-error";
      }
      return null;
    }
    if (ts.isExpressionStatement(p)) return "rpc-descartada";
    if (ts.isReturnStatement(p) || ts.isArrowFunction(p)) return null; // se devuelve tal cual: decide quien llama
    if (ts.isVariableDeclaration(p)) {
      if (ts.isObjectBindingPattern(p.name)) return p.name.elements.some((e) => (e.propertyName ?? e.name).getText(sf) === "error") ? null : "rpc-ignora-error";
      if (ts.isIdentifier(p.name)) return new RegExp(`\\b${p.name.text}\\.error\\b|\\bexigir\\(\\s*${p.name.text}\\b`).test(texto) ? null : "rpc-ignora-error";
    }
    return null;
  };

  /**
   * RELLENO SILENCIOSO (ADR-0693). Un relleno es un manejador que SOLO pone un valor en lugar del error: `() => null`, `() => []`,
   * `() => ({ data: null })`, `() => fallback`, `() => {}` o `catch { return [] }`. Lo que hace algo más ya no es silencioso y no se
   * marca: avisar o registrar (`console.error`, `capturarError`, `avisar.*`), relanzar, usar el error (`({ error: String(e) })`) o
   * dejar una señal que la pantalla lee (`incompleto = true`, `setFallo(true)`). Una referencia (`.catch(manejar)`) tampoco: lo
   * decide quien la escribe. `unstable_rethrow(e)` no cuenta como tratar el error: solo deja pasar los avisos internos de Next.
   */
  const lineas = texto.split("\n");
  const sinEnvoltorio = (e) => {
    while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || (ts.isSatisfiesExpression?.(e) ?? false)) e = e.expression;
    return e;
  };
  /**
   * ¿Es un valor puesto en lugar del error? Literales, vacíos, `new Map()`, objetos o arreglos de eso, o un nombre (el respaldo ya
   * calculado: `() => fallback`). NO lo es lo que lleva el aviso dentro: un texto con algo escrito («No se pudo hablar con el
   * servidor») o un objeto con su `error`/`fallo`/`mensaje` puesto (`{ datos: null, fallo: TEXTO }`): eso ya se lo dice a la persona.
   */
  const LLEVA_EL_AVISO = /^(error|errores|fallo|mensaje|aviso|motivo)$/i;
  const esVacio = (e) => {
    e = sinEnvoltorio(e);
    return e.kind === ts.SyntaxKind.NullKeyword || e.kind === ts.SyntaxKind.FalseKeyword || ts.isVoidExpression(e) || (ts.isIdentifier(e) && e.text === "undefined");
  };
  const esValorDeRelleno = (e) => {
    e = sinEnvoltorio(e);
    const k = e.kind;
    if (k === ts.SyntaxKind.NullKeyword || k === ts.SyntaxKind.TrueKeyword || k === ts.SyntaxKind.FalseKeyword) return true;
    if (ts.isIdentifier(e) || ts.isNumericLiteral(e) || ts.isVoidExpression(e)) return true;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text.trim() === "";
    if (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) return true;
    if (ts.isArrayLiteralExpression(e)) return e.elements.every(esValorDeRelleno);
    if (ts.isObjectLiteralExpression(e))
      return e.properties.every(
        (p) => ts.isPropertyAssignment(p) && esValorDeRelleno(p.initializer) && !(LLEVA_EL_AVISO.test(p.name.getText(sf)) && !esVacio(p.initializer))
      );
    if (ts.isNewExpression(e)) return ts.isIdentifier(e.expression) && /^(Map|Set|Array|WeakMap|WeakSet)$/.test(e.expression.text) && !(e.arguments?.length);
    return false;
  };
  const corto = (s) => (s.length > 40 ? `${s.slice(0, 40)}…` : s).replace(/\s+/g, " ");
  /** Lo que el bloque hace de verdad: sin los `unstable_rethrow(…)`. */
  const sentenciasReales = (bloque) =>
    bloque.statements.filter((s) => !(ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && s.expression.expression.getText(sf) === "unstable_rethrow"));
  /** ¿Un bloque que solo devuelve un relleno? Devuelve lo que pone (para el detalle) o `null`. */
  const rellenoDeBloque = (bloque, vacioCuenta) => {
    const st = sentenciasReales(bloque);
    if (st.length === 0) return vacioCuenta ? "vacío" : null;
    if (st.length !== 1 || !ts.isReturnStatement(st[0])) return null;
    if (!st[0].expression) return "return;";
    return esValorDeRelleno(st[0].expression) ? corto(st[0].expression.getText(sf)) : null;
  };
  /** ¿Se usa el error dentro? (fuera de `unstable_rethrow`). Un patrón `{ message }` cuenta como usado. */
  const usaElError = (decl, cuerpo) => {
    if (!decl) return false;
    if (!ts.isIdentifier(decl.name)) return true;
    const nombre = decl.name.text;
    let usa = false;
    const mira = (n) => {
      if (usa) return;
      if (ts.isCallExpression(n) && n.expression.getText(sf) === "unstable_rethrow") return;
      if (ts.isIdentifier(n) && n.text === nombre && n !== decl.name) usa = true;
      ts.forEachChild(n, mira);
    };
    mira(cuerpo);
    return usa;
  };
  /** La marca vale en la línea del `catch`, en el comentario pegado arriba o en cualquier línea del manejador. */
  const tieneMarca = (desde, hasta) => {
    for (let i = desde; i <= hasta; i++) if (MARCA_RELLENO.test(lineas[i - 1] ?? "")) return true;
    for (let i = desde - 1; i >= 1; i--) {
      const l = (lineas[i - 1] ?? "").trim();
      if (!/^(\/\/|\/\*|\*|\{\/\*)/.test(l) && !/\*\/\}?$/.test(l)) break;
      if (MARCA_RELLENO.test(l)) return true;
    }
    return false;
  };
  const lineaDePos = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const relleno = (lineaCatch, fin, detalle) => {
    if (!tieneMarca(lineaCatch, lineaDePos(fin))) hallazgos.push({ tipo: "relleno-silencioso", linea: lineaCatch, detalle });
  };

  const lee = (n) => {
    if (ts.isThrowStatement(n)) hayThrowOError = true;
    // `.catch(() => …)`, salvo sobre el cuerpo de una respuesta (`res.json().catch(() => null)`).
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "catch" && n.arguments.length === 1) {
      const h = n.arguments[0];
      const sobre = n.expression.expression;
      const esCuerpo = ts.isCallExpression(sobre) && ts.isPropertyAccessExpression(sobre.expression) && CUERPO_DE_RESPUESTA.test(sobre.expression.name.text);
      if (!esCuerpo && (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) && !usaElError(h.parameters[0], h.body)) {
        const pone = ts.isBlock(h.body) ? rellenoDeBloque(h.body, true) : esValorDeRelleno(h.body) ? corto(h.body.getText(sf)) : null;
        if (pone) relleno(lineaDePos(n.expression.name.getStart(sf)), h.getEnd(), pone);
      }
    }
    if (ts.isCallExpression(n)) {
      const f = n.expression.getText(sf);
      if (/^console\.(log|warn|error|info|debug)$/.test(f)) {
        usaLog = true;
        if (esServidor) marca(n, "console-suelto", f);
        const args = n.arguments.map((a) => a.getText(sf)).join(" ");
        if (PERSONAL.test(args)) marca(n, "dato-personal-en-log", args.slice(0, 50));
      }
      if (/(^|\.)logger\.|(^|\.)registrar(Evento|Error)\(/.test(f)) usaLog = true;
      if (f === "fetch" || /\.fetch$/.test(f)) {
        const opts = n.arguments[1];
        const conSignal = opts && ts.isObjectLiteralExpression(opts) && opts.properties.some((p) => p.name && p.name.getText(sf) === "signal");
        const url = n.arguments[0]?.getText(sf) ?? "";
        if (!conSignal && /https?:\/\//.test(url + (texto.includes("process.env") ? "" : ""))) marca(n, "fetch-sin-tope", url.slice(0, 50));
        else if (!conSignal && !/["'`]\//.test(url)) marca(n, "fetch-sin-tope", url.slice(0, 50)); // URL calculada: externa o interna, no se sabe
      }
      if (/\.rpc$/.test(f)) {
        const v = veredictoRpc(n);
        if (v) marca(n, v, f);
      }
    }
    if (ts.isCatchClause(n)) {
      const st = n.block.statements;
      const soloLog = st.length > 0 && st.every((s) => ts.isExpressionStatement(s) && /^console\./.test(s.expression.getText(sf)));
      const relanza = st.some((s) => ts.isThrowStatement(s) || ts.isReturnStatement(s));
      if (st.length === 0 || (soloLog && !relanza)) marca(n, "catch-mudo", st.length === 0 ? "vacío" : "solo console");
      // Un `catch { return [] }` devuelve, pero no trata nada: es un relleno (el vacío ya es `catch-mudo`).
      else if (!usaElError(n.variableDeclaration, n.block)) {
        const pone = rellenoDeBloque(n.block, false);
        if (pone) relleno(lineaDe(sf, n), n.getEnd(), pone);
      }
    }
    ts.forEachChild(n, lee);
  };
  lee(sf);

  if (/^\s*["']use server["']/m.test(texto) && !usaLog && !hayThrowOError && !/\berror\b/.test(texto)) marca(sf, "accion-sin-rastro");
  return hallazgos;
}

/** Nivel 1: ¿hay algo instalado que mida? Lectura de archivos y package.json. */
export function infraestructura() {
  const pkg = JSON.parse(readFileSync(join(WEB, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const tiene = (re) => Object.keys(deps).filter((d) => re.test(d));
  const archivos = listarFuentes(join(WEB, "app")).concat(listarFuentes(join(WEB, "lib")));
  const hay = (re) => archivos.some((f) => re.test(rel(f)));
  const segmentos = listarFuentes(join(WEB, "app", "(app)")).filter((f) => f.endsWith("/page.tsx")).length;
  const errorTsx = listarFuentes(join(WEB, "app")).filter((f) => f.endsWith("/error.tsx") || f.endsWith("/global-error.tsx")).length;
  const items = [
    ["Logger estructurado (`capturarError` en lib/errores.ts o un logger propio)", hay(/(^|\/)(logger|log|registro-eventos|observabilidad|errores)\.ts$/) ],
    ["APM / errores (Sentry, OpenTelemetry, Datadog…)", tiene(/sentry|opentelemetry|datadog|newrelic|highlight/).length > 0],
    ["`instrumentation.ts` (hook de Next para trazas)", existsSync(join(WEB, "instrumentation.ts")) || existsSync(join(WEB, "src", "instrumentation.ts"))],
    ["Core Web Vitals (web-vitals / Speed Insights / Analytics)", tiene(/web-vitals|speed-insights|@vercel\/analytics/).length > 0 || texto_contiene("useReportWebVitals")],
    ["`request_id` / correlación en peticiones", texto_contiene("x-request-id") || texto_contiene("request_id") && texto_contiene("proxy")],
    ["Límites de error por segmento", errorTsx >= Math.ceil(segmentos / 10)],
  ];
  function texto_contiene(s) { return archivos.some((f) => leer(f).includes(s)); }
  return { items: items.map(([que, ok]) => ({ que, ok })), segmentos, errorTsx };
}

/**
 * Los rellenos SIN marca de la web, por archivo (ruta relativa a `apps/web/` → líneas). Es la única definición de qué se mira: la usa
 * el candado del CI, `apps/web/lib/relleno-silencioso.test.ts`, contra la deuda de `apps/web/lib/relleno-silencioso-archivos.ts`.
 */
export function rellenosSinMarca() {
  const por = {};
  for (const f of [...listarFuentes(join(WEB, "app")), ...listarFuentes(join(WEB, "lib")), ...listarFuentes(join(WEB, "components"))]) {
    const lineas = analizarArchivo(leer(f), f).filter((h) => h.tipo === "relleno-silencioso").map((h) => h.linea);
    if (lineas.length) por[relative(WEB, f).split("\\").join("/")] = lineas;
  }
  return por;
}

export function escanear() {
  const archivos = [...listarFuentes(join(WEB, "app")), ...listarFuentes(join(WEB, "lib"))].filter((f) => !/\.(tsx)$/.test(f) || /actions|route/.test(f) || /\/page\.tsx$/.test(f));
  const todo = [];
  let rpcs = 0;
  for (const f of listarFuentes(join(WEB, "app")).concat(listarFuentes(join(WEB, "lib")), listarFuentes(join(WEB, "components")))) {
    const t = leer(f);
    rpcs += (t.match(/\.rpc\(/g) ?? []).length;
    for (const h of analizarArchivo(t, f)) todo.push({ archivo: rel(f), ...h });
  }
  void archivos;
  const porTipo = {};
  for (const h of todo) porTipo[h.tipo] = (porTipo[h.tipo] ?? 0) + 1;
  const porArchivo = {};
  for (const h of todo) porArchivo[h.archivo] = (porArchivo[h.archivo] ?? 0) + 1;
  return { infra: infraestructura(), llamadasRpc: rpcs, porTipo, hallazgos: todo, archivosConMasHallazgos: Object.entries(porArchivo).sort((a, b) => b[1] - a[1]) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = leerArgs(process.argv.slice(2));
  const r = escanear();
  const top = Number(a.top ?? 15);
  if (a.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log("Observabilidad — infraestructura\n");
    console.log(tabla(["capacidad", "¿existe?"], r.infra.items.map((i) => [i.que, i.ok ? "sí" : "**NO**"])));
    console.log(`\n${r.llamadasRpc} llamadas \`.rpc(\`; ${r.infra.errorTsx} límites de error para ${r.infra.segmentos} pantallas\n\nHigiene por tipo:\n`);
    console.log(tabla(["tipo", "cantidad"], Object.entries(r.porTipo).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, v])));
    console.log("\nArchivos con más hallazgos:\n");
    console.log(tabla(["archivo", "hallazgos"], r.archivosConMasHallazgos.slice(0, top)));
  }
  if (a.estricto && r.hallazgos.length) process.exit(1);
}
