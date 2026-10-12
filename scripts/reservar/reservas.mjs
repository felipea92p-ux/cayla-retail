/**
 * Leer las reservas de números (ADR-0380) y decidir si una rama usa uno que es de otra.
 *
 * Una reserva es una etiqueta anotada `reserva/<tipo>-<número>` cuyo mensaje dice `rama: <rama dueña>` (la crea
 * `reservar.mjs`). Este módulo la leen el propio `reservar.mjs` y los candados del CI (`scripts/adr/numeros.mjs`,
 * `scripts/migraciones/versiones.mjs`), que con esto saben, además de «¿se repite en esta rama?», «¿este número nuevo es
 * de otra rama?».
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export const PREFIJO = "reserva/";
const ETIQUETA = /^reserva\/(adr|migracion)-(\d{4}|\d{14})$/;

/**
 * El texto de `git for-each-ref --format='%(refname:strip=2)%1f%(contents)%1e' refs/tags/reserva` →
 * `[{ tipo, numero, rama, etiqueta }]`. Una etiqueta con otro formato se ignora; una sin `rama:` queda con `rama: ""`.
 */
export function parsearReservas(texto) {
  const salida = [];
  for (const registro of texto.split("\x1e")) {
    const [etiqueta, contenido = ""] = registro.replace(/^\s+/, "").split("\x1f");
    const m = ETIQUETA.exec(etiqueta ?? "");
    if (!m) continue;
    const rama = /^rama: (.+)$/m.exec(contenido)?.[1]?.trim() ?? "";
    salida.push({ tipo: m[1], numero: m[2], rama, etiqueta });
  }
  return salida;
}

/**
 * Las reservas del remoto. Con `traer` (por defecto), las baja primero (`+` las pisa: el remoto manda). Si no hay red,
 * usa las que ya estaban bajadas y lo avisa por stderr: el candado del CI no debe ponerse rojo por un corte de red.
 */
export function leerReservas({ cwd = process.cwd(), remoto = "origin", traer = true } = {}) {
  if (traer) {
    try {
      execFileSync("git", ["fetch", "--quiet", "--no-tags", remoto, `+refs/tags/${PREFIJO}*:refs/tags/${PREFIJO}*`], {
        cwd,
        stdio: ["ignore", "ignore", "pipe"],
      });
    } catch (e) {
      console.error(`(aviso) No pude bajar las reservas de «${remoto}»; uso las que ya tenía: ${String(e.stderr ?? e.message).trim()}`);
    }
  }
  const texto = execFileSync("git", ["for-each-ref", "--format=%(refname:strip=2)%1f%(contents)%1e", `refs/tags/${PREFIJO}`], {
    cwd,
    encoding: "utf8",
  });
  return parsearReservas(texto);
}

/**
 * Para los números NUEVOS de una rama (los que no están en `main`): `errores` si alguno está reservado por OTRA rama
 * (choca seguro: el dueño lo va a usar), `avisos` si alguno no tiene reserva (puede chocar con alguien que no se ve).
 * Un número sin reserva no es error todavía (decisión de Felipe, 2026-10-12): habría puesto rojos de golpe los PR abiertos.
 */
export function revisarReservas({ tipo, nuevos, reservas, rama }) {
  const porNumero = new Map(reservas.filter((r) => r.tipo === tipo).map((r) => [r.numero, r]));
  const errores = [];
  const avisos = [];
  const nombre = tipo === "adr" ? "ADR" : "la migración";
  for (const numero of [...new Set(nuevos)].sort()) {
    const r = porNumero.get(numero);
    if (!r) avisos.push(`${nombre} ${numero} no está reservado: resérvalo con \`pnpm reservar ${tipo}\` (o usa el que te dé).`);
    else if (rama && r.rama && r.rama !== rama)
      errores.push(
        `${nombre} ${numero} lo reservó la rama «${r.rama}», no esta («${rama}»): renumera el tuyo con \`pnpm reservar ${tipo}\`. Si «${r.rama}» era esta misma rama con otro nombre, reserva uno nuevo igual: las reservas no se mueven.`,
      );
  }
  return { errores, avisos };
}

/**
 * Los números de `carpeta` que esta rama agrega: los que hay en el árbol y no en `main`. En un PR del CI el checkout es
 * el merge del PR sobre `main`, así que `main` es `HEAD^1`; en local, `origin/main`. Devuelve `null` si no puede saberlo
 * (sin esa ref): el candado avisa y no juzga, nunca falla por no saber.
 */
export function nuevosDeLaRama({ cwd, carpeta, patron }) {
  const base = process.env.GITHUB_BASE_REF ? "HEAD^1" : "origin/main";
  let enBase;
  try {
    enBase = execFileSync("git", ["ls-tree", "--name-only", base, `${carpeta}/`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
  const numeros = (texto) =>
    new Set(
      texto
        .split("\n")
        .map((ruta) => patron.exec(ruta.split("/").pop())?.[1])
        .filter(Boolean),
    );
  const deMain = numeros(enBase);
  const delArbol = numeros(readdirSync(join(cwd, carpeta)).join("\n"));
  return [...delArbol].filter((n) => !deMain.has(n)).sort();
}

/** La rama que se revisa: la del PR en el CI, la actual en local. Vacía en un push a `main` (ahí no se juzga nada). */
export function ramaQueSeRevisa(cwd) {
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_EVENT_NAME === "push") return "";
  try {
    const rama = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return rama === "main" || rama === "HEAD" ? "" : rama;
  } catch {
    return "";
  }
}

/**
 * Lo que agregan los candados `scripts/adr/numeros.mjs` y `scripts/migraciones/versiones.mjs`: imprime los avisos y los
 * errores de reserva de los números nuevos de esta rama y devuelve cuántos errores hubo.
 */
export function revisarLaRama({ tipo, carpeta, patron, cwd }) {
  const rama = ramaQueSeRevisa(cwd);
  if (!rama) return 0;
  const nuevos = nuevosDeLaRama({ cwd, carpeta, patron });
  if (nuevos === null) {
    console.log(`ℹ No encontré \`main\` para comparar (¿sin origin/main?): no reviso las reservas.`);
    return 0;
  }
  if (nuevos.length === 0) return 0;
  const { errores, avisos } = revisarReservas({ tipo, nuevos, reservas: leerReservas({ cwd }), rama });
  for (const a of avisos) console.log(`⚠ ${a}`);
  for (const e of errores) console.error(`✗ ${e}`);
  if (errores.length === 0 && avisos.length === 0) console.log(`✓ Reservas: ${nuevos.join(", ")} son de «${rama}».`);
  return errores.length;
}
