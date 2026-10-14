#!/usr/bin/env node
/**
 * Deriva con lo pegado — la revisión diaria compara producción con `main` MÁS el SQL que los PR abiertos declaran ya
 * pegado, para que su rojo quiera decir «producción tiene algo que nadie declara» (ADR-0402, sobre el ADR-0251).
 *
 * EL PROBLEMA QUE RESUELVE. El SQL se pega en producción ANTES de fusionar (el check «SQL pegado» lo exige), así que
 * producción va casi siempre por delante de `main` con el SQL de los PR abiertos. La revisión diaria comparaba producción
 * con `main` a secas y salía roja casi todos los días desde el 2026-10-03: el 2026-10-14 eran 302 diferencias y 239 las
 * explicaba exacto un PR abierto con la casilla marcada. Un aviso que siempre está rojo no se lee, y debajo quedaban 4 que
 * no venían de ningún PR (SQL pegado desde una rama que nunca se empujó, o sin commit en ninguna parte).
 *
 * QUÉ PROMETE. Tres órdenes, que `deriva-diaria.yml` corre con la base de `main` ya arriba:
 *   reunir <carpeta>   Lista los PR abiertos de este repo (nunca de un fork) que marcaron «SQL pegado en producción» y
 *                      agregan migraciones —la regla de `revisarSqlPegado`, la misma del check «SQL pegado» y del aviso de
 *                      SQL huérfano—, baja cada migración tal como está en la cabeza del PR y escribe `<carpeta>/plan.json`
 *                      con el orden en que se aplicarán. Sale con 2 si GitHub no responde: sin la lista no se sabe qué restar.
 *   aplicar <carpeta>  Aplica el plan sobre la base de main, cada archivo en su sesión y su transacción (como el SQL Editor),
 *                      en orden de versión y con todos los PR juntos: un PR pegado encima de otro queda como en producción.
 *                      Si un archivo no se aplica, salta los que le siguen de ESE PR y sigue con los demás. Escribe
 *                      `<carpeta>/resultado.json`. Un PR que no arma no hace fallar el paso: lo dice el aviso.
 *   resumen <carpeta>  Las líneas públicas del aviso: qué PR se sumaron y cuáles no se pudieron armar. Sale con 1 si alguno
 *                      no se pudo armar (no se puede decir que producción tenga lo que ese PR declara) y con 2 si no puede
 *                      leer la carpeta.
 * Lo que asume: la casilla dice la verdad cuando se marca (si no, la comparación sale roja: es lo que tiene que pasar), y el
 * contenedor `supabase_db_cayla-retail` tiene la base de main recién armada.
 *
 * LO QUE PUBLICA. El repo es público y el registro de la revisión lo ve cualquiera. Este script nombra solo PR y archivos de
 * migración, que ya están en los PR, y nunca lee producción: lo que producción tiene o no lo dice `deriva.mjs --resumen`,
 * con un sí o un no. Nada de lo que imprime viene de producción.
 *
 * POR QUÉ APLICAR Y NO USAR LAS HUELLAS QUE GUARDA EL CI (`huellas-del-pr`). Esas huellas duran 7 días y se calcularon
 * sobre el main del día de su corrida: un reemplazo anclado o un permiso de una tabla que main cambió después ya no
 * calzan, y dos PR pegados uno encima del otro no calzan con ninguno. Aplicar cada mañana sobre el main de ese día no
 * depende de cuánto duran ni de cuándo se calcularon. Ver ADR-0402.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { nuevasDelPr, psql } from "./huellas-del-pr.mjs";
import { revisarSqlPegado } from "./sql-pegado.mjs";

/**
 * De los PR abiertos, los que declaran su SQL pegado: de este repo, con «SQL pegado en producción» marcada y con alguna
 * migración que Supabase aplicaría (`<versión>_<nombre>.sql`). `prs` = `[{ numero, propio, cuerpo, archivos }]`, con
 * `archivos` como los da la API de GitHub. Devuelve `[{ numero, nuevas: [nombre de archivo] }]`, por número de PR.
 */
export function seleccionar(prs) {
  return prs
    .filter((p) => p.propio)
    .map((p) => {
      const { nuevas, casilla } = revisarSqlPegado(p.archivos ?? [], p.cuerpo ?? "");
      return { numero: p.numero, casilla, nuevas: nuevasDelPr(nuevas).map((r) => basename(r)) };
    })
    .filter((p) => p.casilla === "pegado" && p.nuevas.length > 0)
    .map(({ numero, nuevas }) => ({ numero, nuevas }))
    .sort((a, b) => a.numero - b.numero);
}

/**
 * El orden en que se aplican: TODAS las migraciones de todos los PR juntas, por versión, como se van pegando en
 * producción. Un archivo con el mismo nombre en dos PR (uno trajo la rama del otro) se aplica una sola vez: el del PR de
 * número mayor, que suele ser el que se armó encima. Devuelve `{ orden: [{ pr, archivo }], repetidos: [{ archivo, prs, usado }] }`.
 */
export function ordenar(seleccionados) {
  const duenos = new Map();
  for (const { numero, nuevas } of seleccionados) for (const archivo of nuevas) duenos.set(archivo, [...(duenos.get(archivo) ?? []), numero]);
  const orden = [];
  const repetidos = [];
  for (const archivo of [...duenos.keys()].sort((a, b) => a.localeCompare(b))) {
    const prs = duenos.get(archivo).sort((a, b) => a - b);
    const usado = prs.at(-1);
    if (prs.length > 1) repetidos.push({ archivo, prs, usado });
    orden.push({ pr: usado, archivo });
  }
  return { orden, repetidos };
}

/**
 * Aplica `orden` con `aplicarUno(pr, archivo)` (lanza si el archivo no se aplica). El primer archivo que falla deja a su
 * PR «sin armar»: los que le siguen de ese PR se saltan (suelen depender de él) y los de los demás PR se aplican igual.
 * Devuelve `{ aplicados, fallidos: [{ pr, archivo, motivo }], saltados }`.
 */
export function aplicarEnOrden(orden, aplicarUno) {
  const r = { aplicados: [], fallidos: [], saltados: [] };
  const caidos = new Set();
  for (const { pr, archivo } of orden) {
    if (caidos.has(pr)) {
      r.saltados.push({ pr, archivo });
      continue;
    }
    try {
      aplicarUno(pr, archivo);
      r.aplicados.push({ pr, archivo });
    } catch (e) {
      caidos.add(pr);
      r.fallidos.push({ pr, archivo, motivo: String(e?.stderr || e?.message || e).trim().split("\n")[0].slice(0, 200) });
    }
  }
  return r;
}

const lista = (numeros) => numeros.map((n) => `#${n}`).join(", ");

/** Las líneas del aviso. Solo números de PR y nombres de archivo (públicos), nunca el motivo del error ni nada de producción. */
export function lineasPublicas(plan, resultado) {
  const sumados = plan.prs.map((p) => p.numero).filter((n) => !resultado.fallidos.some((f) => f.pr === n));
  const lineas = [
    sumados.length
      ? `Se sumó a main el SQL que estos PR abiertos declaran pegado en producción: ${lista(sumados)}.`
      : "Ningún PR abierto declara SQL pegado en producción que se pudiera sumar: se comparó con main a secas.",
  ];
  for (const f of resultado.fallidos) {
    lineas.push(
      `⚠ #${f.pr} no se pudo armar sobre el main de hoy (falló \`${f.archivo}\`): no se puede decir que producción tenga lo que declara. Trae main a esa rama y corrige la migración, o desmarca la casilla si su SQL no está pegado.`,
    );
  }
  return lineas;
}

function gh(argumentos) {
  return execFileSync("gh", argumentos, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function reunir(carpeta) {
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Falta GITHUB_REPOSITORY (dueño/repo).");
  rmSync(carpeta, { recursive: true, force: true });
  mkdirSync(carpeta, { recursive: true });
  const abiertos = JSON.parse(gh(["pr", "list", "--repo", repo, "--state", "open", "--limit", "500", "--json", "number,isCrossRepository,body,headRefOid"]));
  // La casilla se lee primero porque es gratis; los archivos cuestan una llamada por PR.
  const candidatos = abiertos.filter((p) => p.isCrossRepository === false && revisarSqlPegado([], p.body ?? "").casilla === "pegado");
  const prs = candidatos.map((p) => ({
    numero: p.number,
    sha: p.headRefOid,
    propio: true,
    cuerpo: p.body ?? "",
    // `--slurp` junta las páginas en un arreglo de arreglos.
    archivos: JSON.parse(gh(["api", `repos/${repo}/pulls/${p.number}/files`, "--paginate", "--slurp"])).flat(),
  }));
  const elegidos = seleccionar(prs);
  const { orden, repetidos } = ordenar(elegidos);
  const shaDe = new Map(prs.map((p) => [p.numero, p.sha]));
  for (const { pr, archivo } of orden) {
    // El archivo tal como está en la cabeza del PR que se listó (no en la de ahora): todo el plan es de un mismo momento.
    const sql = gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/contents/supabase/migrations/${archivo}?ref=${shaDe.get(pr)}`]);
    mkdirSync(join(carpeta, String(pr)), { recursive: true });
    writeFileSync(join(carpeta, String(pr), archivo), sql);
  }
  const plan = { prs: elegidos.map(({ numero, nuevas }) => ({ numero, sha: shaDe.get(numero), archivos: nuevas })), orden, repetidos };
  writeFileSync(join(carpeta, "plan.json"), `${JSON.stringify(plan, null, 1)}\n`);
  console.log(
    elegidos.length
      ? `PR abiertos que declaran su SQL pegado: ${lista(elegidos.map((p) => p.numero))} (${orden.length} migraciones).`
      : "Ningún PR abierto declara SQL pegado en producción.",
  );
  for (const r of repetidos) console.log(`  ${r.archivo} está en ${lista(r.prs)}: se aplica el de #${r.usado}.`);
}

const leerJson = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));

function aplicar(carpeta) {
  const plan = leerJson(join(carpeta, "plan.json"));
  const resultado = aplicarEnOrden(plan.orden, (pr, archivo) => {
    console.log(`Aplicando ${archivo} (#${pr})`);
    psql(["-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", "-"], readFileSync(join(carpeta, String(pr), archivo), "utf8"));
  });
  writeFileSync(join(carpeta, "resultado.json"), `${JSON.stringify(resultado, null, 1)}\n`);
  console.log(`Aplicadas ${resultado.aplicados.length} de ${plan.orden.length} migraciones.`);
  for (const f of resultado.fallidos) console.log(`::warning::#${f.pr} no se pudo armar sobre el main de hoy: falló ${f.archivo}.`);
}

function resumen(carpeta) {
  const plan = leerJson(join(carpeta, "plan.json"));
  const resultado = leerJson(join(carpeta, "resultado.json"));
  if (!Array.isArray(plan?.prs) || !Array.isArray(resultado?.fallidos)) throw new Error("plan.json o resultado.json no tienen la forma esperada.");
  console.log(lineasPublicas(plan, resultado).join("\n"));
  if (resultado.fallidos.length) process.exit(1);
}

function main() {
  const [orden, carpeta, ...resto] = process.argv.slice(2);
  const ordenes = { reunir, aplicar, resumen };
  if (!ordenes[orden] || !carpeta || resto.length) {
    console.error("Uso: deriva-pegados.mjs reunir|aplicar|resumen <carpeta>");
    process.exit(2);
  }
  if (orden !== "reunir" && !existsSync(join(carpeta, "plan.json"))) {
    console.error(`✗ No está ${join(carpeta, "plan.json")}: primero «reunir».`);
    process.exit(2);
  }
  try {
    ordenes[orden](carpeta);
  } catch (e) {
    // Solo la primera línea: el error de `gh` no trae nada de la base, pero una respuesta entera no tiene por qué ir al registro.
    console.error(`::error::No se pudo ${orden === "reunir" ? "leer los PR abiertos" : orden === "aplicar" ? "aplicar el SQL de los PR" : "leer lo que se sumó de los PR"}: ${String(e?.stderr || e?.message || e).trim().split("\n")[0]}`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
