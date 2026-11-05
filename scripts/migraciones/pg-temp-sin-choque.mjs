#!/usr/bin/env node
/**
 * Candado de migraciones — dos ayudantes `pg_temp.<nombre>` con la misma firma no cambian el nombre de sus parámetros.
 *
 * EL PROBLEMA QUE RESUELVE. Un ayudante de migración (`pg_temp.reemplazar_una_vez`, `pg_temp.reemplazar`…) vive solo en
 * la sesión que lo crea, y en producción cada pegada es su propia sesión: nunca choca con otra. Pero el CLI de Supabase
 * (`supabase start`, `db reset`) aplica TODAS las migraciones en UNA sola sesión, y `pg_temp` se arrastra de una a otra.
 * Si una migración define `pg_temp.f(p_firma text, p_ancla text, …)` y otra anterior ya dejó
 * `pg_temp.f(p_firma text, p_viejo text, …)`, el `create or replace` falla con
 * `42P13 cannot change name of input parameter "p_viejo"` y la base no se arma. El 2026-10-23 pasó con
 * `20261023212000_caja_registra_gastos_sin_finanzas.sql` (#1298): su CI pasó porque una migración nueva de un PR se aparta
 * y se aplica aparte, así que el choque solo se vio en los PR siguientes, cuando la 212000 ya estaba en `main` (#1300, #1301).
 *
 * QUÉ PROMETE. Sale con código 1 y nombra los dos archivos si, recorridas las migraciones en orden de versión, un
 * `create [or replace] function pg_temp.<nombre>(…)` repite nombre y tipos de argumento de uno anterior con otro nombre
 * de parámetro (el único cambio que el motor rechaza y que se escribe sin darse cuenta). Un `drop function pg_temp.<nombre>(…)`
 * entre los dos suelta la firma y deja de contar. No toca base de datos ni necesita node_modules.
 *
 * QUÉ NO PUEDE DECIR. Mira nombres de parámetros y tipos, no el tipo de retorno ni los valores por defecto (el motor
 * también rechaza cambiarlos). Es un análisis de texto: una función creada con `execute '…'` no se ve. La prueba real es
 * armar la base desde cero con el CLI, que es lo que hace el CI.
 *
 * QUÉ HACER SI SALE ROJO. Dale un nombre propio al ayudante de la migración nueva (`reemplazar_una_vez_ancla`), o suelta el
 * viejo antes con `drop function if exists pg_temp.<nombre>(<tipos>);`. Si la que choca ya está en `main`, mira la nota
 * de scripts/migraciones/README.md («Ayudantes pg_temp»): una migración de `main` no se edita sin que Felipe lo decida.
 *
 * USO
 *   pnpm migraciones:pg-temp
 *   node scripts/migraciones/pg-temp-sin-choque.mjs <carpeta>   → otra carpeta (para probarlo)
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { sinComentarios } from "./sin-drop-trigger.mjs";

// Misma regla que el CLI de Supabase: dígitos, guion bajo, resto, `.sql`. Los `pegar-en-produccion-*.sql` y demás no
// se aplican por el CLI (se pegan a mano, cada uno en su sesión), así que aquí tampoco cuentan.
const MIGRACION = /^\d+_.*\.sql$/;

/** Tipos que se escriben de dos formas: el motor los trata como uno solo. */
const ALIAS = new Map([
  ["int", "integer"],
  ["int4", "integer"],
  ["int2", "smallint"],
  ["int8", "bigint"],
  ["bool", "boolean"],
  ["float8", "double precision"],
  ["float4", "real"],
  ["varchar", "character varying"],
  ["timestamptz", "timestamp with time zone"],
  ["timetz", "time with time zone"],
]);

/** Tipos de más de una palabra: un argumento sin nombre como `double precision` no es «nombre = double». */
const TIPO_DE_VARIAS_PALABRAS =
  /^(?:double precision|character varying|bit varying|timestamp(?:\(\d+\))? with(?:out)? time zone|time(?:\(\d+\))? with(?:out)? time zone)(?:\(\d+\))?(?:\[\])*$/i;

function normalizarTipo(tipo) {
  let t = tipo.toLowerCase().replace(/^pg_catalog\./, "").replace(/\s+/g, " ").trim();
  const matriz = (t.match(/(\[\])+$/) ?? [""])[0];
  t = t.slice(0, t.length - matriz.length);
  t = t.replace(/\(\s*[\d\s,]*\)/g, ""); // numeric(12,2) y numeric son el mismo tipo para la firma
  return (ALIAS.get(t) ?? t) + matriz;
}

/** Corta `a, b(1,2), c default 'x,y'` por las comas de primer nivel. */
function partirPorComas(texto) {
  const partes = [];
  let profundidad = 0;
  let enTexto = false;
  let actual = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enTexto) {
      actual += c;
      if (c === "'") enTexto = false;
      continue;
    }
    if (c === "'") enTexto = true;
    else if (c === "(" || c === "[") profundidad++;
    else if (c === ")" || c === "]") profundidad--;
    else if (c === "," && profundidad === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  if (actual.trim() !== "") partes.push(actual);
  return partes;
}

/** `{ nombre, tipo }` de un argumento de entrada; `null` si es de salida (`out`), que no entra en la firma. */
function argumento(texto) {
  let t = texto.trim().replace(/\s+/g, " ");
  t = t.replace(/\s+default\s.*$/i, "").replace(/\s*=\s.*$/, "");
  const modo = /^(in out|inout|in|out|variadic)\s+/i.exec(t);
  if (modo) {
    if (modo[1].toLowerCase() === "out") return null;
    t = t.slice(modo[0].length);
  }
  if (TIPO_DE_VARIAS_PALABRAS.test(t)) return { nombre: "", tipo: normalizarTipo(t) };
  const i = t.indexOf(" ");
  if (i === -1) return { nombre: "", tipo: normalizarTipo(t) };
  return { nombre: t.slice(0, i).replace(/^"|"$/g, "").toLowerCase(), tipo: normalizarTipo(t.slice(i + 1)) };
}

/** Texto entre el paréntesis que abre en `desde` y su pareja, sin contar los de dentro de un texto entre comillas. */
function dentroDelParentesis(sql, desde) {
  let profundidad = 0;
  let enTexto = false;
  for (let i = desde; i < sql.length; i++) {
    const c = sql[i];
    if (enTexto) {
      if (c === "'") enTexto = false;
      continue;
    }
    if (c === "'") enTexto = true;
    else if (c === "(") profundidad++;
    else if (c === ")" && --profundidad === 0) return { texto: sql.slice(desde + 1, i), fin: i + 1 };
  }
  return null;
}

/**
 * Cada `create [or replace] function pg_temp.<nombre>(…)` y `drop function [if exists] pg_temp.<nombre>[(…)]` de un
 * archivo, en el orden en que aparecen: `{ accion: 'crear'|'soltar', nombre, tipos, nombres, linea }`.
 * `tipos` es null en un `drop` sin paréntesis (suelta todas las firmas de ese nombre).
 */
export function ayudantesPgTemp(sql) {
  const limpio = sinComentarios(sql);
  const encabezado = /\b(create\s+(?:or\s+replace\s+)?function|drop\s+function(?:\s+if\s+exists)?)\s+pg_temp\.("?)([A-Za-z_][\w$]*)\2\s*/gi;
  const encontrados = [];
  for (const m of limpio.matchAll(encabezado)) {
    const accion = /^create/i.test(m[1]) ? "crear" : "soltar";
    const nombre = m[3].toLowerCase();
    const linea = limpio.slice(0, m.index).split("\n").length;
    const abre = m.index + m[0].length;
    if (limpio[abre] !== "(") {
      if (accion === "soltar") encontrados.push({ accion, nombre, tipos: null, nombres: [], linea });
      continue;
    }
    const args = dentroDelParentesis(limpio, abre);
    if (!args) continue;
    const entrada = partirPorComas(args.texto).map(argumento).filter(Boolean);
    encontrados.push({ accion, nombre, tipos: entrada.map((a) => a.tipo), nombres: entrada.map((a) => a.nombre), linea });
  }
  return encontrados;
}

/**
 * Recibe `[[nombre, contenido], …]` EN ORDEN DE APLICACIÓN y devuelve los choques:
 * `[{ funcion, antes: { archivo, linea, nombres }, despues: { archivo, linea, nombres } }]`.
 * Hay choque si una firma ya viva se vuelve a crear con otro nombre de parámetro en alguna posición donde tenía uno
 * (a un parámetro sin nombre sí se le puede poner). Un `drop` suelta la firma; la sesión sigue con la del último `create`.
 */
export function choquesDePgTemp(archivos) {
  const vivas = new Map(); // «nombre(tipos)» → { archivo, linea, nombres }
  const choques = [];
  for (const [archivo, contenido] of archivos) {
    for (const f of ayudantesPgTemp(contenido)) {
      if (f.accion === "soltar") {
        if (f.tipos === null) {
          for (const clave of [...vivas.keys()]) if (clave.startsWith(`${f.nombre}(`)) vivas.delete(clave);
        } else vivas.delete(`${f.nombre}(${f.tipos.join(",")})`);
        continue;
      }
      const firma = `${f.nombre}(${f.tipos.join(",")})`;
      const previa = vivas.get(firma);
      if (previa && previa.nombres.some((n, i) => n !== "" && n !== f.nombres[i])) {
        choques.push({
          funcion: `pg_temp.${f.nombre}(${f.tipos.join(", ")})`,
          antes: previa,
          despues: { archivo, linea: f.linea, nombres: f.nombres },
        });
      }
      vivas.set(firma, { archivo, linea: f.linea, nombres: f.nombres.map((n, i) => n || previa?.nombres[i] || "") });
    }
  }
  return choques;
}

function main() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const carpeta = resolve(process.argv[2] ?? join(raiz, "supabase", "migrations"));
  const nombres = readdirSync(carpeta).filter((n) => MIGRACION.test(n)).sort();
  const choques = choquesDePgTemp(nombres.map((n) => [n, readFileSync(join(carpeta, n), "utf8")]));

  if (choques.length === 0) {
    console.log(`✓ ${nombres.length} migraciones en ${carpeta}: ningún ayudante pg_temp cambia el nombre de sus parámetros.`);
    return;
  }

  console.error("✗ Ayudantes pg_temp que cambian el nombre de un parámetro (el CLI aplica todas las migraciones en UNA sesión: 42P13):");
  for (const { funcion, antes, despues } of choques) {
    console.error(`  - ${funcion}`);
    console.error(`      ${antes.archivo}:${antes.linea} → (${antes.nombres.join(", ")})`);
    console.error(`      ${despues.archivo}:${despues.linea} → (${despues.nombres.join(", ")})`);
  }
  console.error("\nDale otro nombre al ayudante de la migración nueva, o suelta el viejo antes con `drop function if exists pg_temp.<nombre>(<tipos>);`.");
  console.error("Detalle: encabezado de scripts/migraciones/pg-temp-sin-choque.mjs.");
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
