#!/usr/bin/env node
/**
 * Pruebas de mutación de `comparar.mjs` y `comparar-lectura.mjs`: rompe el código A PROPÓSITO, una cosa a la vez, y
 * comprueba que alguna prueba se ponga en rojo. Una prueba que no muerde a un «mutante» no está probando lo que dice.
 *
 * NO corre en el CI (tarda unos minutos y toca los dos archivos): se corre a mano al cambiar la lectura —
 *   node scripts/datos/comparar-mutaciones.mjs            # todas
 *   node scripts/datos/comparar-mutaciones.mjs L06 C04    # solo esas
 * Sale con código 1 si un mutante NO equivalente sobrevive. Al terminar deja los dos archivos como estaban (también si se
 * interrumpe con Ctrl-C). Un mutante «equivalente» cambia el código sin cambiar lo que hace en esta máquina (p. ej. quitar el
 * `.sort()` de un directorio que macOS ya devuelve ordenado): se anota con su razón y no cuenta.
 *
 * Nació de la tercera revisión del PR #454: la cifra «19 mutaciones muerden» vivía solo en un mensaje de commit, no se podía
 * comprobar, y una batería independiente encontró 17 mutantes que sobrevivían.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const LECTURA = join(AQUI, "comparar-lectura.mjs");
const INFORME = join(AQUI, "comparar.mjs");
const PRUEBAS = [join(AQUI, "comparar-lectura.test.mjs"), join(AQUI, "comparar.test.mjs")];

// [clave, archivo, texto que se cambia (debe aparecer UNA sola vez), texto nuevo, razón si es equivalente]
const M = (clave, archivo, desde, hasta, equivalente) => ({ clave, archivo, desde, hasta, equivalente });
const MUTANTES = [
  // ── comparar-lectura.mjs
  M("L01", LECTURA, 'return /\\.test\\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(ruta);', "return false;"),
  M("L02", LECTURA, "while (ts.isAsExpression(e) || ", "while ("),
  M("L03", LECTURA, "ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)", "ts.isNonNullExpression(e)"),
  M("L04", LECTURA, "ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)", "ts.isSatisfiesExpression(e)"),
  M("L05", LECTURA, "ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e))", "ts.isTypeAssertionExpression(e))"),
  M("L06", LECTURA, "|| ts.isTypeAssertionExpression(e)) e = e.expression;", ") e = e.expression;"),
  M("L07", LECTURA, "if (ts.isConditionalExpression(e)) return [...nombresPosibles(e.whenTrue), ...nombresPosibles(e.whenFalse)];", "if (false) return [];"),
  M("L08", LECTURA, "[ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken]", "[]"),
  M("L09", LECTURA, 'if (ts.isSpreadAssignment(p)) llamada.argumentos = "objeto con spread";', 'if (false) llamada.argumentos = "objeto con spread";'),
  M("L10", LECTURA, 'else if (llamada.argumentos === "objeto") llamada.argumentos = "objeto con clave calculada";', "else {}"),
  M("L11", LECTURA, "ts.isStringLiteralLike(p.name) || ts.isNumericLiteral(p.name)", "ts.isNumericLiteral(p.name)"),
  M("L12", LECTURA, 'n.expression.name.text === "rpc" && n.arguments.length > 0', 'n.expression.name.text.startsWith("rpc") && n.arguments.length > 0'),
  M("L13", LECTURA, "nombre: ts.isStringLiteralLike(nombreDelTexto) ? nombreDelTexto.text : null,", "nombre: ts.isStringLiteral(nombreDelTexto) ? nombreDelTexto.text : null,"),
  M("L14", LECTURA, '["bind", "call", "apply"].includes(padre.name.text)', "false"),
  M("L15", LECTURA, "else if (ts.isVariableDeclaration(padre) && padre.initializer === n)", "else if (false)"),
  M("L16", LECTURA, 'ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent) && (n.propertyName ?? n.name).getText(sf) === "rpc"', "false"),
  M("L17", LECTURA, 'ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression) && n.argumentExpression.text === "rpc"', "false"),
  M("L18", LECTURA, "if (ts.isCallExpression(sube.parent) && sube.parent.expression === sube) usos.push", "if (false) usos.push"),
  M("L19", LECTURA, "return parsear(texto, ruta).parseDiagnostics.length;", "return 0;"),
  M("L20", LECTURA, "ts.isStringLiteralLike(nodo) && conocidos.has(nodo.text) && !vistos.has(nodo.text)", "ts.isStringLiteralLike(nodo) && !vistos.has(nodo.text)"),
  M("L21", LECTURA, "ts.isStringLiteralLike(nodo) && conocidos.has(nodo.text) && !vistos.has(nodo.text)", "ts.isStringLiteralLike(nodo) && conocidos.has(nodo.text)"),
  M("L22", LECTURA, 'return `${t.toISOString().slice(0, 16).replace("T", " ")} UTC`;', "return null;"),
  M("L23", LECTURA, "/\\.jsx$/.test(ruta) ? ts.ScriptKind.JSX", "false ? ts.ScriptKind.JSX"),
  M("L24", LECTURA, "export const EXTENSIONES_DE_CODIGO = /\\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;", "export const EXTENSIONES_DE_CODIGO = /\\.(ts|tsx)$/;"),
  // ── comparar.mjs
  M("C01", INFORME, "process.exit(rotas.length ? 1 : 0);", "process.exit(0);"),
  M("C02", INFORME, '!llamadasUnicas.has(n) && !n.startsWith("fn_"));', "!llamadasUnicas.has(n));"),
  M("C03", INFORME, "if (!n.directa) continue;", "continue;"),
  M("C04", INFORME, "if (sobran.length) rotas.push({ ...n, envia: n.claves,", "if (false) rotas.push({ ...n, envia: n.claves,"),
  M("C05", INFORME, "} else if (faltan.length) {", "} else if (false) {"),
  M("C06", INFORME, "  if (sobran.length) {\n    rotas.push", "  if (false) {\n    rotas.push"),
  M("C07", INFORME, "/^([a-z0-9_]+)\\((.*?)\\)\\s*->/i", "/^([a-z_]+)\\((.*?)\\)\\s*->/i"),
  M("C08", INFORME, 'entrada === "node_modules" || ', ""),
  M("C09", INFORME, '|| entrada.startsWith(".")) continue;', ") continue;"),
  M("C10", INFORME, "readdirSync(dir).sort()", "readdirSync(dir)", "macOS ya devuelve el directorio en orden alfabético; en Linux SÍ cambia"),
  M("C11", INFORME, "sobrecargas.set(nombre, [...previas, linea.trim()]);", "void previas;"),
  M("C12", INFORME, "const previas = sobrecargas.get(nombre) ?? [mapa.get(nombre).linea];", "const previas = [];"),
  M("C13", INFORME, "indice.set(m[1].toLowerCase(), f);", "if (!indice.has(m[1].toLowerCase())) indice.set(m[1].toLowerCase(), f);"),
  M("C14", INFORME, "([a-z0-9_]+)\\s*\\(/gi)) indice.set", "([a-z0-9_]+)\\s*\\(/g)) indice.set"),
  M("C15", INFORME, 'if (typeof foto?.funciones === "number" && foto.funciones !== firmas) {', "if (false) {"),
  M("C16", INFORME, "const TITULAR = `${total} llamadas", "const TITULAR = `${encontradas.length} llamadas"),
  M("C17", INFORME, "const porque = produccion.has(nombre)", "const porque = true"),
  M("C18", INFORME, "const textos = [...new Set(ll.nombresEnElNombre)];", "const textos = [];"),
  M("C19", INFORME, 'noAnalizadas.push({ ...contexto, nombre: "(nombre calculado)"', 'void ({ ...contexto, nombre: "(nombre calculado)"'),
  M("C20", INFORME, "p.prosrc ~ ('\\\\m' || '<nombre>' || '\\\\M')", "p.prosrc ~ ('<nombre>')"),
  M("C21", INFORME, '**Foto de producción: ${FOTO_FECHA ?? "sin fecha"}.**', "**Foto de producción: —.**"),
  M("C22", INFORME, "migracion: migracionQueDefine(ll.nombre) });\n    continue;", "migracion: null });\n    continue;"),
  M("C23", INFORME, "const llamadasUnicas = new Set([...encontradas, ...noAnalizadas].map(l => l.nombre));", "const llamadasUnicas = new Set([...encontradas].map(l => l.nombre));"),
  M("C24", INFORME, "if (!mencionadas.has(nombre)) mencionadas.set(nombre, { archivo, linea });", "mencionadas.set(nombre, { archivo, linea });"),
  M("C25", INFORME, "if (yaVistas.has(nombre)) continue;", ""),
  M("C26", INFORME, "for (const a of aliasesDeRpc(texto, ruta)) noAnalizadas.push(", "for (const a of []) noAnalizadas.push("),
  M("C27", INFORME, "if (errores) noAnalizadas.push(", "if (false) noAnalizadas.push("),
  M("C28", INFORME, "if (esDePrueba(ruta)) continue;", ""),
  M("C29", INFORME, 'console.log(`  Foto de producción: ${FOTO_FECHA ?? "SIN FECHA"}.', "console.log(`  Foto de producción: —."),
  M("C30", INFORME, "const fnSinPantalla = fnTodas.filter(n => !llamadasUnicas.has(n));", "const fnSinPantalla = fnTodas;"),
  M("C31", INFORME, 'if (ll.argumentos === "ninguno") encontradas.push({ ...c, envia: [] });', 'if (false) encontradas.push({ ...c, envia: [] });'),
];

const originales = new Map([LECTURA, INFORME].map((f) => [f, readFileSync(f, "utf8")]));
const restaurar = () => originales.forEach((texto, f) => writeFileSync(f, texto));
process.on("SIGINT", () => { restaurar(); process.exit(130); });
process.on("SIGTERM", () => { restaurar(); process.exit(143); });

const elegidos = process.argv.slice(2);
const lista = elegidos.length ? MUTANTES.filter((m) => elegidos.includes(m.clave)) : MUTANTES;
const sobreviven = [];
let muertos = 0;
let equivalentes = 0;

try {
  for (const m of lista) {
    const original = originales.get(m.archivo);
    const veces = original.split(m.desde).length - 1;
    if (veces !== 1) {
      console.log(`${m.clave}  ✗ NO SE PUDO APLICAR: el texto aparece ${veces} veces (debe ser 1). ¿Cambió el código? Actualiza esta lista.`);
      sobreviven.push(m.clave + " (sin aplicar)");
      continue;
    }
    writeFileSync(m.archivo, original.replace(m.desde, () => m.hasta));
    const r = spawnSync(process.execPath, ["--test", ...PRUEBAS], { encoding: "utf8" });
    restaurar();
    const cayo = r.status !== 0;
    if (cayo) { muertos++; console.log(`${m.clave}  ✓ muerde`); }
    else if (m.equivalente) { equivalentes++; console.log(`${m.clave}  = equivalente aquí (${m.equivalente})`); }
    else { sobreviven.push(m.clave); console.log(`${m.clave}  ✗ SOBREVIVE: ${m.desde.slice(0, 80)}  →  ${m.hasta.slice(0, 60)}`); }
  }
} finally {
  restaurar();
}

console.log(`\n${lista.length} mutantes: ${muertos} mueren, ${equivalentes} equivalentes, ${sobreviven.length} sobreviven${sobreviven.length ? ` (${sobreviven.join(", ")})` : ""}.`);
process.exit(sobreviven.length ? 1 : 0);
