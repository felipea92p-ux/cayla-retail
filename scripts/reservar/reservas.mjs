/**
 * Leer las reservas de números (ADR-0380) y decidir si una rama usa uno que es de otra.
 *
 * Una reserva es una etiqueta anotada `reserva/<tipo>-<número>` cuyo mensaje dice `rama: <rama dueña>` (la crea
 * `reservar.mjs`). Este módulo la leen el propio `reservar.mjs` y los candados del CI (`scripts/adr/numeros.mjs`,
 * `scripts/migraciones/versiones.mjs`), que con esto saben, además de «¿se repite en esta rama?», «¿este número nuevo es
 * de otra rama?».
 */
import { execFileSync } from "node:child_process";

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
