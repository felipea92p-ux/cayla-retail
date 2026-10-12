#!/usr/bin/env node
/**
 * Choques que git NO marca como conflicto, entre esta rama y `main` y entre esta rama y cada PR abierto (ADR-0381).
 *
 * EL PROBLEMA. Git solo ve dos cambios a las mismas líneas. Los choques que más costaron al fusionar Liquidación (PR #940,
 * 2026-10-10 a 10-12) eran otros, y salieron recién en el CI, 10 minutos después y con la rama ya atrasada otra vez:
 *   · dos migraciones con la MISMA versión en archivos distintos → `schema_migrations_pkey`;
 *   · dos ADR con el mismo número → `scripts/adr/numeros.mjs`;
 *   · dos parches distintos a la MISMA función de la base (`retail.registrar_venta`): cada uno pasa solo, juntos el segundo
 *     pisa al primero, o su prueba no sabe deshacerlo (`DESHACER_POSTERIORES` en registrar-venta-antes-de-precio-sede.mjs);
 *   · archivos de registro que todos tocan al final (el menú, los módulos, la guía de foco, la lista de pruebas del CI).
 *
 * QUÉ PROMETE. Lista lo que esta rama comparte con `main` y con cada PR abierto, de peor a menos malo:
 *   · SEGURO   — el mismo número de ADR o de migración, o un número que reservó otra rama: uno de los dos se renumera.
 *   · PROBABLE — la misma función de la base cambiada por migración, o el mismo archivo de registro: el segundo en fusionar
 *                tiene que contar con el primero.
 *   · y cuántos archivos más comparte con cada PR (solo para saber con quién hablar).
 * No bloquea (sale con 0 aunque encuentre choques, decisión de Felipe 2026-10-12): el otro PR puede no fusionarse nunca.
 * Con `--estricto` sale con 1 si hay un choque SEGURO.
 *
 * QUÉ NO PUEDE DECIR. Si dos parches a la misma función se pisan de verdad (eso lo dicen las pruebas de la base), ni los
 * choques con ramas que todavía no tienen PR. Un PR de un fork no trae su rama al remoto: sus funciones no se leen.
 *
 * USO
 *   pnpm abrir-pr:choques           → informe legible
 *   pnpm abrir-pr:choques --json    → lo mismo, para otra herramienta
 *   pnpm abrir-pr:choques --entre-prs → cada PR abierto contra los demás (el tablero de la fila de fusión)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leerReservas, revisarReservas } from "../reservar/reservas.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADR = /^docs\/adr\/(\d{4})-.+\.md$/;
const MIGRACION = /^supabase\/migrations\/(\d{14})_.+\.sql$/;

/**
 * Archivos que casi toda pantalla o módulo nuevo toca, y donde dos PR chocan aunque git los mezcle: dos entradas en el
 * mismo lugar del menú, dos `orden` iguales en los módulos, una prueba nueva en la misma línea de la lista del CI.
 */
export const DE_REGISTRO = [
  /^apps\/web\/lib\/menu\.ts$/,
  /^apps\/web\/lib\/modulos\.ts$/,
  /^apps\/web\/lib\/guia-de-foco-pantallas\.ts$/,
  /^apps\/web\/lib\/menu-hoy\.golden\.json$/,
  /^apps\/web\/lib\/sugerir-archivos\.ts$/,
  /^apps\/web\/unificar\/familias\.mjs$/,
  /^scripts\/ci\/pruebas-postgres\.mjs$/,
  /^package\.json$/,
  /^\.github\/workflows\//,
  /^docs\/ARQUITECTURA\.md$/,
];

/**
 * Las funciones de `retail` que una migración crea, reemplaza, altera o parcha por reemplazo anclado (ADR-0377:
 * `pg_temp.reemplazar_anclado('retail.fn(...)', …)`). Sin comentarios `--` (una mención no es un cambio) y sin `pg_temp`.
 */
export function funcionesQueToca(sql) {
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  const nombres = new Set();
  const patrones = [
    /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:"?retail"?\.)?"?(\w+)"?\s*\(/gi,
    /\balter\s+function\s+"?retail"?\."?(\w+)"?/gi,
    /\bdrop\s+function\s+(?:if\s+exists\s+)?"?retail"?\."?(\w+)"?/gi,
    /\breemplazar\w*\s*\(\s*'retail\.(\w+)\s*\(/gi,
  ];
  for (const patron of patrones) for (const m of sinComentarios.matchAll(patron)) nombres.add(m[1].toLowerCase());
  // `create function pg_temp.x` calza el primer patrón con «pg_temp» fuera del grupo: se descarta por el prefijo.
  for (const m of sinComentarios.matchAll(/\bfunction\s+pg_temp\.(\w+)/gi)) nombres.delete(m[1].toLowerCase());
  return [...nombres].sort();
}

/** Los números de un patrón (`ADR` o `MIGRACION`) en una lista de rutas. */
function numeros(rutas, patron) {
  return [...new Set(rutas.map((r) => patron.exec(r)?.[1]).filter(Boolean))].sort();
}

const comunes = (a, b) => a.filter((x) => b.includes(x));

/**
 * El corazón, sin git ni red. `mio` y cada `otro` = `{ archivos, adrs, migraciones, funciones }` (lo que AGREGAN o tocan);
 * `main` = `{ adrs, migraciones }` (lo que ya existe); `reservas` y `rama`, para los números reservados por otra rama.
 * Devuelve `{ seguros, probables, compartidos }`, cada uno una lista de `{ con, que, detalle }`.
 */
export function detectarChoques({ mio, otros, main, reservas = [], rama = "" }) {
  const seguros = [];
  const probables = [];
  const compartidos = [];
  for (const [tipo, clave, nombre] of [
    ["adr", "adrs", "ADR"],
    ["migracion", "migraciones", "migración"],
  ]) {
    for (const n of comunes(mio[clave], main[clave]))
      seguros.push({ con: "main", que: `${nombre} ${n}`, detalle: `ya existe en main: renumera el tuyo con \`pnpm reservar ${tipo}\`` });
    for (const e of revisarReservas({ tipo, nuevos: mio[clave], reservas, rama }).errores) seguros.push({ con: "reservas", que: `${nombre}`, detalle: e });
  }
  for (const otro of otros) {
    const con = `#${otro.numero} ${otro.titulo}`.trim();
    for (const n of comunes(mio.adrs, otro.adrs))
      seguros.push({ con, que: `ADR ${n}`, detalle: "los dos PR lo agregan: renumera el que no tenga la reserva (`pnpm reservar --listar`)" });
    for (const n of comunes(mio.migraciones, otro.migraciones))
      seguros.push({ con, que: `migración ${n}`, detalle: "los dos PR la agregan: `supabase start` fallará con schema_migrations_pkey al fusionar el segundo" });
    for (const f of comunes(mio.funciones, otro.funciones ?? []))
      probables.push({
        con,
        que: `retail.${f}`,
        detalle:
          "los dos PR cambian esta función por migración: el segundo en fusionar se aplica encima del primero; si es un reemplazo anclado, su ancla puede no estar ya, y las pruebas que lo deshacen (DESHACER_*) tienen que conocer los dos",
      });
    const deRegistro = comunes(mio.archivos, otro.archivos).filter((a) => DE_REGISTRO.some((r) => r.test(a)));
    for (const a of deRegistro) probables.push({ con, que: a, detalle: "archivo de registro: revisa que las dos entradas no pidan el mismo lugar, orden o clave" });
    const otrosComunes = comunes(mio.archivos, otro.archivos).filter((a) => !deRegistro.includes(a) && !ADR.test(a) && !MIGRACION.test(a));
    if (otrosComunes.length > 0) compartidos.push({ con, que: `${otrosComunes.length} archivo(s)`, detalle: otrosComunes.slice(0, 8).join(", ") + (otrosComunes.length > 8 ? ", …" : "") });
  }
  return { seguros, probables, compartidos };
}

function sh(cmd, args, opciones = {}) {
  return execFileSync(cmd, args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "pipe"], ...opciones }).trim();
}

function leerMio() {
  const archivos = sh("git", ["diff", "--name-only", "origin/main...HEAD"]).split("\n").filter(Boolean);
  const nuevos = archivos.filter((a) => !existeEn("origin/main", a));
  const migraciones = archivos.filter((a) => MIGRACION.test(a) && existsSync(join(RAIZ, a)));
  return {
    archivos,
    adrs: numeros(nuevos, ADR),
    migraciones: numeros(nuevos, MIGRACION),
    funciones: [...new Set(migraciones.flatMap((a) => funcionesQueToca(readFileSync(join(RAIZ, a), "utf8"))))].sort(),
  };
}

function existeEn(ref, ruta) {
  try {
    sh("git", ["cat-file", "-e", `${ref}:${ruta}`]);
    return true;
  } catch {
    return false;
  }
}

/** `rutasDeMain`: un ADR o una migración que el PR «agrega» pero que ya está en main con ESE MISMO archivo (un PR viejo cuyo
 * contenido ya entró por otro camino) no es un número nuevo: no cuenta. */
function leerOtros(miRama, rutasDeMain = new Set()) {
  const prs = JSON.parse(sh("gh", ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName,isCrossRepository,files"]));
  return prs
    .filter((pr) => pr.headRefName !== miRama)
    .map((pr) => {
      const archivos = pr.files.map((f) => f.path);
      const agregados = pr.files
        .filter((f) => f.changeType === "ADDED" || f.changeType === "RENAMED")
        .map((f) => f.path)
        .filter((ruta) => !rutasDeMain.has(ruta));
      const ref = `origin/${pr.headRefName}`;
      const funciones = pr.isCrossRepository
        ? []
        : archivos
            .filter((a) => MIGRACION.test(a))
            .flatMap((a) => {
              try {
                return funcionesQueToca(sh("git", ["show", `${ref}:${a}`]));
              } catch {
                return []; // la borró, o la rama ya no está en el remoto
              }
            });
      return { numero: pr.number, titulo: pr.title, archivos, adrs: numeros(agregados, ADR), migraciones: numeros(agregados, MIGRACION), funciones: [...new Set(funciones)] };
    });
}

function leerMain() {
  const rutas = sh("git", ["ls-tree", "-r", "--name-only", "origin/main", "docs/adr/", "supabase/migrations/"]).split("\n");
  return { adrs: numeros(rutas, ADR), migraciones: numeros(rutas, MIGRACION), rutas: new Set(rutas) };
}

function informe({ seguros, probables, compartidos }, rama) {
  const linea = (c) => `  · ${c.que} — con ${c.con}\n      ${c.detalle}`;
  const partes = [`Choques de «${rama}» con main y con los PR abiertos:\n`];
  partes.push(seguros.length ? `🔴 SEGUROS (${seguros.length}): uno de los dos tiene que cambiar\n${seguros.map(linea).join("\n")}\n` : "✓ Ningún choque seguro (números de ADR, de migración, reservas).\n");
  partes.push(probables.length ? `🟠 PROBABLES (${probables.length}): el segundo en fusionar tiene que contar con el primero\n${probables.map(linea).join("\n")}\n` : "✓ Ninguna función de la base ni archivo de registro en común.\n");
  if (compartidos.length) partes.push(`ℹ Otros archivos en común (solo para saber con quién hablar):\n${compartidos.map(linea).join("\n")}\n`);
  return partes.join("\n");
}

/** Cada PR abierto contra los demás: solo los choques SEGUROS y PROBABLES, cada par una vez. */
function entrePrs(reservas) {
  const main = leerMain();
  const prs = leerOtros("", main.rutas);
  const ramas = new Map(JSON.parse(sh("gh", ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,headRefName"])).map((p) => [p.number, p.headRefName]));
  let hubo = false;
  prs.forEach((pr, i) => {
    const { seguros, probables } = detectarChoques({ mio: pr, otros: prs.slice(i + 1), main, reservas, rama: ramas.get(pr.numero) ?? "" });
    if (seguros.length + probables.length === 0) return;
    hubo = true;
    console.log(`#${pr.numero} ${pr.titulo}`);
    for (const c of seguros) console.log(`  🔴 ${c.que} — con ${c.con}`);
    for (const c of probables) console.log(`  🟠 ${c.que} — con ${c.con}`);
  });
  if (!hubo) console.log(`✓ Ningún choque seguro ni probable entre los ${prs.length} PR abiertos.`);
}

function main() {
  const args = process.argv.slice(2);
  sh("git", ["fetch", "--quiet", "--prune", "origin"]);
  if (args.includes("--entre-prs")) return entrePrs(leerReservas({ cwd: RAIZ }));
  const rama = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const main = leerMain();
  const resultado = detectarChoques({ mio: leerMio(), otros: leerOtros(rama, main.rutas), main, reservas: leerReservas({ cwd: RAIZ }), rama });
  console.log(args.includes("--json") ? JSON.stringify(resultado, null, 2) : informe(resultado, rama));
  if (args.includes("--estricto") && resultado.seguros.length > 0) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
