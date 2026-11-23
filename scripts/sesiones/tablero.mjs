#!/usr/bin/env node
/**
 * `pnpm sesiones`: el tablero de quién trabaja en qué en el repo (ADR-0697). Reemplaza las filas a mano de
 * `docs/SESIONES-ACTIVAS.md`. La lógica vive en `reglas.mjs`; aquí solo se lee.
 *
 * QUÉ LEE (y nada más; no escribe en el repo ni guarda nada):
 *   · las worktrees de ESTE equipo (`git worktree list`) y sus archivos cambiados: los commits propios contra `origin/main` y
 *     lo que todavía no tiene commit. Con `--no-optional-locks`: leer no le toma el índice a otra sesión;
 *   · las ramas `claude/*` del remoto con un commit en las últimas 48 h (las de otra máquina o de la nube solo se ven así);
 *   · los PR abiertos (`gh pr list`, con el mismo lector de `pnpm abrir-pr:choques`);
 *   · las reservas de números (`pnpm reservar`, ADR-0381).
 *
 * Nunca falla por una fuente (principio 9): si no hay red, usa las ramas que ya tenía; si `gh` no responde, el tablero sale
 * sin los PR y lo dice al final. Solo sale con 1 si no está dentro de un repo git.
 *
 * USO
 *   pnpm sesiones              → el tablero legible
 *   pnpm sesiones --json       → lo mismo, para otra herramienta (el hook de inicio de sesión, `al-abrir.mjs`)
 *   pnpm sesiones --al-abrir   → no trae `main` (lo trae el aviso de la carpeta principal en paralelo: no se pisan)
 */
import { spawn } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { funcionesQueToca, leerMain, leerOtros, MIGRACION } from "../abrir-pr/choques.mjs";
import { leerReservas, PREFIJO } from "../reservar/reservas.mjs";
import { armarSesiones, choquesEntreSesiones, informe, parsearCambios, parsearStatus, parsearWorktrees, puedeLlegarAMain, VENTANA_ACTIVA_S } from "./reglas.mjs";

/** Un comando sin bloquear: devuelve su salida, o `null` si falla o pasa de `tope` ms. */
function correr(cmd, args, cwd, tope = 15000) {
  return new Promise((resolver) => {
    let salida = "";
    let hijo;
    try {
      hijo = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return resolver(null);
    }
    const reloj = setTimeout(() => hijo.kill(), tope);
    hijo.stdout.setEncoding("utf8");
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.on("error", () => {
      clearTimeout(reloj);
      resolver(null);
    });
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      resolver(codigo === 0 ? salida : null);
    });
  });
}

/** `fn` sobre cada elemento, de a `n` a la vez: 40 worktrees a la vez serían 120 procesos de git juntos. */
async function enTandas(items, n, fn) {
  const salida = new Array(items.length);
  let siguiente = 0;
  const obrero = async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      salida[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, obrero));
  return salida;
}

/** El archivo sin commit más reciente de una worktree (segundos), o `null`. */
async function ultimaEdicion(raiz, rutas) {
  let ultimo = null;
  for (const ruta of rutas) {
    try {
      const { mtimeMs } = await lstat(join(raiz, ruta));
      ultimo = Math.max(ultimo ?? 0, Math.floor(mtimeMs / 1000));
    } catch {
      // borrado: no tiene fecha
    }
  }
  return ultimo;
}

/** Las funciones de `retail` que tocan las migraciones de una lista de cambios (`leer` da el SQL de una ruta, o falla). */
async function funcionesDe(cambios, leer) {
  const nombres = new Set();
  for (const { ruta } of cambios.filter((c) => MIGRACION.test(c.ruta))) {
    const sql = await leer(ruta).catch(() => null); // borrada: no toca nada
    if (sql) for (const f of funcionesQueToca(sql)) nombres.add(f);
  }
  return [...nombres];
}

async function leerWorktree(w) {
  const git = (...args) => correr("git", ["--no-optional-locks", ...args], w.ruta);
  const [cambios, estado, fecha] = await Promise.all([
    git("diff", "--name-status", "-z", "origin/main...HEAD"),
    git("status", "--porcelain=v1", "-z", "-uall"),
    git("log", "-1", "--format=%ct", "HEAD"),
  ]);
  const enCommits = cambios ? parsearCambios(cambios) : [];
  const sinCommit = estado ? parsearStatus(estado) : [];
  const ultimo = Math.max(enCommits.length && fecha ? Number(fecha) : 0, (await ultimaEdicion(w.ruta, sinCommit.map((c) => c.ruta))) ?? 0) || null;
  const funciones = await funcionesDe([...enCommits, ...sinCommit], (ruta) => readFile(join(w.ruta, ruta), "utf8"));
  return { ...w, enCommits, sinCommit, ultimo, funciones };
}

/** Rama → fecha del último commit en el remoto, de todas las ramas que hay bajadas. */
async function leerFechasDelRemoto(raiz) {
  const texto = await correr("git", ["for-each-ref", "refs/remotes/origin", "--format=%(refname:strip=3)%09%(committerdate:unix)"], raiz);
  const fechas = new Map();
  for (const linea of (texto ?? "").split("\n")) {
    const [rama, fecha] = linea.split("\t");
    if (rama && rama !== "HEAD" && fecha) fechas.set(rama, Number(fecha));
  }
  return fechas;
}

async function leerRamasRecientes(raiz, fechas, ahora) {
  const recientes = [...fechas].filter(([rama, fecha]) => rama.startsWith("claude/") && ahora - fecha <= VENTANA_ACTIVA_S);
  return enTandas(recientes, 8, async ([rama, ultimo]) => {
    const cambios = await correr("git", ["diff", "--name-status", "-z", `origin/main...origin/${rama}`], raiz);
    const lista = cambios ? parsearCambios(cambios) : [];
    const funciones = await funcionesDe(lista, async (ruta) => (await correr("git", ["show", `origin/${rama}:${ruta}`], raiz)) ?? Promise.reject());
    return { rama, ultimo, cambios: lista, funciones };
  });
}

/** Lee las cuatro fuentes y arma el tablero. `alAbrir`: no trae `main` (ver USO). */
export async function leerTablero({ cwd = process.cwd(), alAbrir = false, ahora = Math.floor(Date.now() / 1000) } = {}) {
  const raiz = (await correr("git", ["rev-parse", "--show-toplevel"], cwd))?.trim();
  const listado = raiz ? await correr("git", ["worktree", "list", "--porcelain"], raiz) : null;
  if (!raiz || listado === null) return null;
  const faltan = [];

  // Lo lento va en paralelo: traer las ramas y las reservas mientras se leen las worktrees.
  const ramasRemotas = alAbrir ? ["+refs/heads/claude/*:refs/remotes/origin/claude/*"] : ["+refs/heads/*:refs/remotes/origin/*"];
  const traerRamas = correr("git", ["fetch", "--quiet", "--prune", "origin", ...ramasRemotas], raiz, 8000);
  const traerReservas = correr("git", ["fetch", "--quiet", "--no-tags", "origin", `+refs/tags/${PREFIJO}*:refs/tags/${PREFIJO}*`], raiz, 8000);
  const worktrees = enTandas(parsearWorktrees(listado), 10, leerWorktree);
  const actual = (await correr("git", ["symbolic-ref", "--short", "-q", "HEAD"], cwd))?.trim() || null;

  if ((await traerRamas) === null) faltan.push("ramas");
  const fechas = await leerFechasDelRemoto(raiz);
  const ramas = await leerRamasRecientes(raiz, fechas, ahora);

  // `leerOtros` y `leerReservas` son síncronos: corren mientras las worktrees siguen leyéndose en sus propios procesos.
  let main = { adrs: [], migraciones: [], rutas: new Set() };
  let prs = [];
  try {
    main = leerMain();
    prs = leerOtros("", main.rutas);
  } catch {
    faltan.push("prs");
  }
  await traerReservas;
  let reservas = [];
  try {
    reservas = leerReservas({ cwd: raiz, traer: false });
  } catch {
    faltan.push("reservas");
  }

  const tablero = armarSesiones({ worktrees: await worktrees, ramas, prs, fechas, reservas, rutasDeMain: main.rutas, actual, ahora });
  const choques = choquesEntreSesiones({ sesiones: puedeLlegarAMain(tablero), main, reservas });
  return { ...tablero, choques, faltan, ahora };
}

async function principal() {
  const args = process.argv.slice(2);
  const tablero = await leerTablero({ alAbrir: args.includes("--al-abrir") });
  if (!tablero) {
    console.error("No estoy dentro de un repo git: no hay sesiones que mirar.");
    process.exit(1);
  }
  console.log(args.includes("--json") || args.includes("--al-abrir") ? JSON.stringify(tablero) : informe(tablero, tablero.ahora));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
