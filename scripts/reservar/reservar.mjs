#!/usr/bin/env node
/**
 * Reservar un número de ADR o una versión de migración al EMPEZAR un trabajo, no al final (ADR-0380).
 *
 * EL PROBLEMA. Cada sesión elegía «el siguiente» número mirando el `main` que tenía delante, y varias trabajan a la vez:
 * dos elegían el mismo sin que nadie hiciera nada mal. Git no lo marca como conflicto (son archivos con nombres
 * distintos) y el choque salía recién en el CI de la segunda: `schema_migrations_pkey` con 20261010190000, 20261010200000
 * y 20261010210000 (Liquidación contra Plan de campaña y Abrir producción), y ADR-0371, 0375 y 0378 tomados dos veces.
 *
 * QUÉ PROMETE. Una reserva es una etiqueta git en el remoto: `reserva/adr-0380` o `reserva/migracion-20261012153000`.
 * GitHub rechaza crear una etiqueta que ya existe, así que si dos sesiones reservan a la vez, el primer push gana y el
 * segundo prueba con el número siguiente: dos sesiones nunca se llevan el mismo. El número elegido es mayor que todo lo
 * que ya existe en `main`, en cualquier rama remota y en las reservas. La etiqueta guarda en su mensaje la rama dueña
 * (`rama: claude/…`), que es lo que leen los candados del CI (`scripts/reservar/reservas.mjs`).
 *
 * QUÉ NO PROMETE. Que el número se use: una reserva que nadie usa queda como un hueco en la numeración, y eso no rompe
 * nada (decisión de Felipe, 2026-10-12: las reservas no se liberan; liberar reabre la carrera que esto cierra). Sin red
 * no reserva: lo dice y sale con 1, nunca inventa un número «probablemente libre».
 *
 * USO
 *   pnpm reservar adr                → reserva el siguiente ADR libre para la rama actual e imprime el número
 *   pnpm reservar migracion          → reserva la siguiente versión de migración libre (AAAAMMDDHHMMSS, UTC)
 *   pnpm reservar adr --cuantos 2    → dos seguidos
 *   pnpm reservar --listar           → todas las reservas del remoto, con su rama
 *   pnpm reservar --mias             → las de la rama actual
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { leerReservas, PREFIJO } from "./reservas.mjs";

const ADR = /^docs\/adr\/(\d{4})-.+\.md$/;
const MIGRACION = /^supabase\/migrations\/(\d{14})_.+\.sql$/;

/** El siguiente ADR libre: uno más que el mayor usado. Los huecos de abajo no se rellenan (pueden ser de una rama sin subir). */
export function siguienteAdr(usados) {
  const mayor = Math.max(0, ...[...usados].map(Number));
  return String(mayor + 1).padStart(4, "0");
}

/** `20261012153000` → Date (UTC). */
function aFecha(version) {
  const [a, m, d, h, mi, s] = [0, 4, 6, 8, 10, 12].map((i, k) => Number(version.slice(i, i + (k === 0 ? 4 : 2))));
  return new Date(Date.UTC(a, m - 1, d, h, mi, s));
}

/** Date → `20261012153000` (UTC). */
function aVersion(fecha) {
  return fecha.toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

/**
 * La siguiente versión libre: el próximo múltiplo de 10 minutos desde `ahora` (UTC), o 10 minutos después de la mayor
 * usada si esa es posterior. Así una migración nueva siempre queda DESPUÉS de todas las que existen, en orden.
 */
export function siguienteMigracion(usadas, ahora = new Date()) {
  const diez = 10 * 60 * 1000;
  const desdeAhora = Math.ceil(ahora.getTime() / diez) * diez;
  const mayor = [...usadas].sort().at(-1);
  const desdeMayor = mayor ? aFecha(mayor).getTime() + diez : 0;
  return aVersion(new Date(Math.max(desdeAhora, desdeMayor)));
}

/** La versión que sigue a `version` si esa ya la tomó otro: 10 minutos después. */
export function despuesDe(version) {
  return aVersion(new Date(aFecha(version).getTime() + 10 * 60 * 1000));
}

function git(args, cwd, opciones = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opciones }).trim();
}

/** Los números ya usados en `main` y en cada rama remota (lo que está en un PR abierto, aunque no esté fusionado). */
function usadosEnRamas(cwd, tipo) {
  const carpeta = tipo === "adr" ? "docs/adr/" : "supabase/migrations/";
  const patron = tipo === "adr" ? ADR : MIGRACION;
  const refs = git(["for-each-ref", "--format=%(refname)", "refs/remotes/origin"], cwd).split("\n").filter(Boolean);
  const usados = new Set();
  for (const ref of refs) {
    let lista = "";
    try {
      lista = git(["ls-tree", "--name-only", ref, carpeta], cwd);
    } catch {
      continue; // una ref sin esa carpeta (o un HEAD simbólico raro) no aporta números
    }
    for (const ruta of lista.split("\n")) {
      const m = patron.exec(ruta);
      if (m) usados.add(m[1]);
    }
  }
  return usados;
}

function ramaActual(cwd) {
  return git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

/**
 * Reserva `cuantos` números de `tipo` para la rama actual. Devuelve los números reservados.
 * `remoto` es el nombre del remoto (por defecto `origin`); `ahora`, para las pruebas.
 */
export function reservar({ tipo, cuantos = 1, cwd = process.cwd(), remoto = "origin", ahora = new Date(), intentos = 30 }) {
  if (tipo !== "adr" && tipo !== "migracion") throw new Error(`Tipo «${tipo}»: se reserva «adr» o «migracion».`);
  const rama = ramaActual(cwd);
  if (rama === "HEAD" || rama === "main") throw new Error(`Estás en «${rama}»: reserva desde la rama de tu trabajo (las reservas son de una rama).`);
  try {
    git(["fetch", "--quiet", "--prune", remoto], cwd);
  } catch (e) {
    throw new Error(`Sin conexión con «${remoto}», no reservé nada (no invento un número «probablemente libre»): ${e.stderr || e.message}`);
  }
  const reservas = leerReservas({ cwd, remoto });
  const usados = usadosEnRamas(cwd, tipo);
  for (const r of reservas) if (r.tipo === tipo) usados.add(r.numero);

  const quien = (() => {
    try {
      return git(["config", "user.name"], cwd);
    } catch {
      return "";
    }
  })();
  // La etiqueta apunta al archivo vacío, no a un commit: así bajar las reservas trae solo las etiquetas. Si apuntara a
  // un commit, un checkout corto (el CI usa `fetch-depth: 2`) se bajaría toda la historia que hay detrás para leerlas.
  const base = git(["hash-object", "-w", "--stdin"], cwd, { input: "", stdio: ["pipe", "pipe", "pipe"] });
  const mias = [];
  let candidato = tipo === "adr" ? siguienteAdr(usados) : siguienteMigracion(usados, ahora);
  for (let i = 0; mias.length < cuantos; i++) {
    if (i >= intentos) throw new Error(`Probé ${intentos} números y todos estaban tomados: algo raro pasa en «${remoto}».`);
    const etiqueta = `${PREFIJO}${tipo}-${candidato}`;
    const mensaje = `rama: ${rama}\nquien: ${quien}\nfecha: ${ahora.toISOString()}\n`;
    git(["tag", "-a", "-f", etiqueta, base, "-m", mensaje], cwd);
    try {
      // Sin --force: si la etiqueta ya existe en el remoto, GitHub la rechaza y probamos con la siguiente.
      git(["push", "--quiet", remoto, `refs/tags/${etiqueta}`], cwd);
      mias.push(candidato);
    } catch (e) {
      const texto = `${e.stderr ?? ""}${e.message ?? ""}`;
      git(["tag", "-d", etiqueta], cwd);
      if (!/already exists|rejected|ya existe/i.test(texto)) throw new Error(`No pude subir ${etiqueta}: ${texto}`);
    }
    candidato = tipo === "adr" ? String(Number(candidato) + 1).padStart(4, "0") : despuesDe(candidato);
  }
  return mias;
}

function main() {
  const args = process.argv.slice(2);
  const valor = (bandera) => (args.includes(bandera) ? args[args.indexOf(bandera) + 1] : undefined);
  if (args.includes("--listar") || args.includes("--mias")) {
    const rama = ramaActual(process.cwd());
    const todas = leerReservas({ cwd: process.cwd(), traer: true });
    const filas = args.includes("--mias") ? todas.filter((r) => r.rama === rama) : todas;
    for (const r of filas) console.log(`${r.tipo.padEnd(9)} ${r.numero}  ${r.rama}`);
    if (filas.length === 0) console.log(args.includes("--mias") ? `La rama «${rama}» no tiene reservas.` : "No hay reservas.");
    return;
  }
  const tipo = args.find((a) => !a.startsWith("--") && a !== valor("--cuantos"));
  try {
    const numeros = reservar({ tipo, cuantos: Number(valor("--cuantos") ?? 1) });
    for (const n of numeros) console.log(tipo === "adr" ? `ADR-${n}` : n);
    console.error(`✓ Reservado${numeros.length > 1 ? "s" : ""} para la rama «${ramaActual(process.cwd())}».`);
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
