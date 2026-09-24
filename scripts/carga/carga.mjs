#!/usr/bin/env node
/**
 * Prueba de carga del ERP (ADR-0194): muchas personas a la vez sobre una base con un año de datos.
 *
 *   pnpm carga:preparar            → base aparte `cayla_carga` = copia del Postgres local + un año sintético
 *   pnpm carga:correr [15 30 50]   → un día de tienda con N personas a la vez (60 s por nivel)
 *
 * QUÉ SIMULA. Cada «persona» es una colaboradora sintética con su cuenta, su rol, su tienda y su entrada marcada en
 * Dynamic, que entra como `authenticated` (RLS activa) con los límites de PostgREST de producción (8 s por consulta y
 * por espera). Mezcla de un día: cobrar (40 %), mirar la caja (20 %), abrir Vender (15 %), «ventas de hoy» (15 %),
 * Existencias (10 %). Sin pausas entre acciones: es el peor caso, no el promedio.
 *
 * DÓNDE. Nunca en la base `postgres` (la comparten las otras sesiones) ni en producción: la copia se llama
 * `cayla_carga` y los scripts SQL se niegan a correr en otra. ANTES de preparar, el local tiene que estar igual a
 * producción (huellas por función, ADR-0194 «Cómo se armó la base»): si no, se mide otra cosa.
 *
 * CÓMO LEER EL RESULTADO. En una Mac con otras sesiones y contenedores los milisegundos varían mucho entre corridas
 * (ver la carga de la máquina que se imprime). Para comparar un antes y un después, correr las dos bases INTERCALADAS
 * en la misma sesión; y para una consulta sola, contar bloques leídos (`explain (analyze, buffers)`), que no depende de
 * la carga de la máquina.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR = "supabase_db_cayla-retail";
const BASE = process.env.BASE ?? "cayla_carga";
const AQUI = dirname(fileURLToPath(import.meta.url));
const ESCENARIOS = [
  ["vender", 40],
  ["caja", 20],
  ["ventas_del_dia", 15],
  ["existencias", 10],
  ["abrir_vender", 15],
];

function docker(args, input) {
  return execFileSync("docker", ["exec", ...(input ? ["-i"] : []), CONTENEDOR, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}
const psql = (base, sql) => docker(["psql", "-U", "supabase_admin", "-d", base, "-v", "ON_ERROR_STOP=1", "-q", "-At", "-f", "-"], sql);

function preparar() {
  if (BASE === "postgres") throw new Error("La base de carga no puede ser la compartida (postgres).");
  console.log(`1/4 Copiando el Postgres local a «${BASE}» (sin tocar la base «postgres»)…`);
  docker(["psql", "-U", "supabase_admin", "-d", "postgres", "-qc", `drop database if exists ${BASE}`]);
  docker(["psql", "-U", "supabase_admin", "-d", "postgres", "-qc", `create database ${BASE}`]);
  docker(["bash", "-c", `pg_dump -U supabase_admin -d postgres | psql -U supabase_admin -d ${BASE} -q > /dev/null 2>&1`]);
  console.log("2/4 Cargando un año de operación sintética (≈2 min)…");
  console.log(docker(["psql", "-U", "supabase_admin", "-d", BASE, "-q", "-f", "-"], readFileSync(join(AQUI, "01_volumen.sql"), "utf8")));
  console.log("3/4 Arnés (colaboradoras numeradas, registro de errores)…");
  psql(BASE, readFileSync(join(AQUI, "02_arnes.sql"), "utf8"));
  console.log("4/4 Escenarios al contenedor…");
  copiarEscenarios();
  console.log(`Listo. Corre: pnpm carga:correr`);
}

function copiarEscenarios() {
  docker(["mkdir", "-p", "/tmp/carga"]);
  for (const f of readdirSync(join(AQUI, "escenarios"))) {
    execFileSync("docker", ["cp", join(AQUI, "escenarios", f), `${CONTENEDOR}:/tmp/carga/${f}`]);
  }
}

function percentiles(lineas) {
  const porEscenario = new Map();
  for (const l of lineas) {
    const p = l.trim().split(/\s+/);
    if (p.length < 4) continue;
    const s = Number(p[3]);
    if (!porEscenario.has(s)) porEscenario.set(s, []);
    porEscenario.get(s).push(Number(p[2]) / 1000);
  }
  return [...porEscenario.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => {
    v.sort((a, b) => a - b);
    const q = (f) => Math.round(v[Math.min(v.length - 1, Math.floor(f * v.length))]);
    return { escenario: ESCENARIOS[s][0], n: v.length, p50: q(0.5), p95: q(0.95), p99: q(0.99) };
  });
}

function correr(niveles) {
  copiarEscenarios();
  for (const c of niveles) {
    psql(BASE, "truncate public._carga_errores;");
    const carga = execFileSync("uptime", { encoding: "utf8" }).split("averages:")[1]?.trim().split(/\s+/)[0];
    const salida = docker([
      "pgbench", "-U", "supabase_admin", "-d", BASE, "-n", "-c", String(c), "-j", "8", "-T", process.env.SEGUNDOS ?? "60",
      "-l", `--log-prefix=/tmp/carga/log_${c}`,
      ...ESCENARIOS.flatMap(([f, peso]) => ["-f", `/tmp/carga/${f}.sql@${peso}`]),
    ]);
    const tps = salida.match(/tps = ([\d.]+)/)?.[1];
    const log = docker(["bash", "-c", `cat /tmp/carga/log_${c}.*; rm -f /tmp/carga/log_${c}.*`]).split("\n");
    const errores = psql(BASE, "select escenario || ' ' || sqlstate || ' ×' || count(*) from public._carga_errores group by escenario, sqlstate order by 1;").trim();
    console.log(`\n== ${c} personas a la vez · ${Math.round(Number(tps))} operaciones/s · carga de la Mac ${carga}`);
    console.table(percentiles(log));
    console.log(errores ? `Errores (57014 = pasó los 8 s; 40P01 = bloqueo mutuo; 55P03 = esperó más de 8 s):\n${errores}` : "Sin errores.");
  }
}

const [orden, ...resto] = process.argv.slice(2);
if (orden === "preparar") preparar();
else if (orden === "correr") correr(resto.length ? resto.map(Number) : [15, 30, 50]);
else {
  console.log("Uso: node scripts/carga/carga.mjs preparar | correr [15 30 50]");
  process.exit(1);
}
