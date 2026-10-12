#!/usr/bin/env node
/**
 * SQL en producción — ¿producción ya tiene lo que dejan las migraciones de este PR? La casilla, comprobada.
 *
 * EL PROBLEMA QUE RESUELVE. «SQL pegado en producción» era una casilla que nadie comprobaba al fusionar: marcada sin
 * pegar (o pegando una versión vieja del archivo), Vercel publicaba la web nueva contra una base sin sus funciones, y lo
 * avisaba la revisión diaria al día siguiente (ADR-0251). Desde el 2026-10-12, cuando un PR marca la casilla, el check
 * «SQL pegado» compara con producción lo que el CI vio cambiar a cada migración (`huellas-del-pr.mjs`).
 *
 * QUÉ PROMETE. Por cada migración del PR dice:
 *   ✓ pegada      — cada objeto que la migración deja (función, permiso, política, columna, candado, índice, vista…) está
 *                   en producción con la misma huella, y lo que borra ya no está;
 *   ✗ falta       — algo no está, o está con otra versión (sin pegar, pegada a medias, una versión vieja del archivo, o
 *                   producción tiene otro cambio sobre lo mismo que esta migración toca);
 *   ? sin huella  — solo cambia DATOS (un `insert`, un `update`): el catálogo no lo muestra y vale lo que dice la casilla.
 * Sale con 0 si ninguna falta, 1 si alguna falta y 2 si no pudo comparar (un archivo que falta o está mal formado, una
 * respuesta vacía de producción, huellas que no son de este PR): «no pude mirar» nunca se dice como «pegado».
 *
 * LO QUE PUBLICA. El repo es público y el registro del check lo ve cualquiera: dice solo el NOMBRE de cada archivo del
 * PR (que ya está en el PR) y si está o no, nunca qué objeto falta ni cuántos. «Este revoke todavía no está en
 * producción» diría qué puerta sigue abierta (el mismo criterio de la deriva, ADR-0251). El detalle se mira en privado:
 * `node scripts/migraciones/sql-en-produccion.mjs <huellas-del-pr.json> <produccion> --detalle`.
 *
 * USO (lo corre `scripts/migraciones/sql-en-produccion.sh`, desde `.github/workflows/sql-pegado.yml`)
 *   node scripts/migraciones/sql-en-produccion.mjs <huellas-del-pr.json> <produccion.json|tsv> [<nuevas.txt>] [--detalle]
 *   nuevas.txt = las migraciones que el PR agrega según GitHub (una por línea): si el JSON no habla de las mismas, no es
 *   de este commit y no se compara.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { ALIAS_PRODUCCION, CONOCIDAS, conNombresDeMain, leerHuellas } from "./deriva.mjs";
import { nuevasDelPr } from "./huellas-del-pr.mjs";

/** Lee el JSON de `huellas-del-pr.mjs aplicar`. Lanza si no tiene la forma esperada. */
export function leerHuellasDelPr(texto) {
  const datos = JSON.parse(texto);
  if (!Array.isArray(datos?.archivos)) throw new Error("Las huellas del PR no traen la lista de archivos.");
  for (const a of datos.archivos) {
    if (typeof a?.archivo !== "string" || !a.objetos || typeof a.objetos !== "object") throw new Error("Las huellas del PR tienen un archivo mal formado.");
  }
  return datos.archivos;
}

/**
 * `delPr` = `[{ archivo, objetos: { clave: huella | null } }]`; `produccion` = Map de `leerHuellas`.
 * Devuelve `[{ archivo, estado: "pegada" | "falta" | "sin-huella", faltan: [clave] }]`, en el orden del PR.
 */
export function comprobar(delPr, produccion, { conocidas = CONOCIDAS, alias = ALIAS_PRODUCCION } = {}) {
  // El mismo objeto con otro nombre en producción se mira con el nombre del repo (la deriva hace lo mismo).
  const enProduccion = conNombresDeMain(produccion, new Map(), alias);
  return delPr.map(({ archivo, objetos }) => {
    const claves = Object.keys(objetos).filter((clave) => !conocidas.some((c) => c.patron.test(clave)));
    if (claves.length === 0) return { archivo, estado: "sin-huella", faltan: [] };
    const faltan = claves.filter((clave) => (enProduccion.get(clave) ?? null) !== objetos[clave]);
    return { archivo, estado: faltan.length ? "falta" : "pegada", faltan };
  });
}

/**
 * ¿Las huellas cubren las migraciones que el PR agrega? `nuevas` = rutas o nombres según GitHub. Solo cuentan las que
 * Supabase aplica (`<versión>_<nombre>.sql`): las demás no tienen huellas. Las huellas pueden traer DE MÁS (una migración
 * de main renombrada en el PR, que git ve como nueva y GitHub como renombrada): esa se comprueba igual, ya está en
 * producción. Devuelve el motivo si alguna del PR no tiene huellas, o null.
 */
export function noCoinciden(delPr, nuevas) {
  const tenemos = new Set(delPr.map((a) => a.archivo));
  const sinHuellas = nuevasDelPr(nuevas.map((n) => `supabase/migrations/${basename(n)}`))
    .map((r) => basename(r))
    .filter((archivo) => !tenemos.has(archivo));
  if (sinHuellas.length === 0) return null;
  return `El CI de este commit no dejó huellas de ${sinHuellas.join(", ")}: no son las migraciones de este PR.`;
}

const MARCA = { pegada: "✓", falta: "✗", "sin-huella": "?" };
const DICE = {
  pegada: "en producción",
  falta: "FALTA en producción, o allá está con otra versión",
  "sin-huella": "solo cambia datos: el catálogo no lo muestra, vale lo que dice la casilla",
};

/** El texto del check. Solo nombres de archivo; con `detalle` (en privado), también las claves que faltan. */
export function informe(resultado, { detalle = false } = {}) {
  const lineas = resultado.map((r) => {
    const base = `${MARCA[r.estado]} ${r.archivo} — ${DICE[r.estado]}`;
    return detalle && r.faltan.length ? `${base}\n${r.faltan.map((c) => `    · ${c.replace("\t", " ")}`).join("\n")}` : base;
  });
  const faltan = resultado.filter((r) => r.estado === "falta").length;
  if (faltan === 0) {
    lineas.push("", "✓ Producción tiene lo que dejan las migraciones de este PR: se puede fusionar.");
  } else {
    lineas.push(
      "",
      `✗ ${faltan === 1 ? "Una migración de este PR no está" : `${faltan} migraciones de este PR no están`} en producción tal como la${faltan === 1 ? "" : "s"} deja el CI.`,
      "  Pégala(s) en el SQL Editor de producción, en su orden, y vuelve a correr este check (o edita el cuerpo del PR).",
      "  Si ya la(s) pegaste: producción tiene otra versión de algo que tocan (un arreglo que vive solo allá, u otro PR",
      "  pegado encima). El detalle no se publica (el repo es público): pídele a Claude «¿qué le falta a producción del",
      "  PR?» o corre sql-en-produccion.mjs con --detalle en privado. Ver ADR-0251.",
    );
  }
  return lineas.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const detalle = args.includes("--detalle");
  const [rutaPr, rutaProduccion, rutaNuevas] = args.filter((a) => a !== "--detalle");
  let delPr;
  let produccion;
  try {
    if (!rutaPr || !rutaProduccion) throw new Error("Uso: sql-en-produccion.mjs <huellas-del-pr.json> <produccion> [<nuevas.txt>] [--detalle]");
    for (const ruta of [rutaPr, rutaProduccion, rutaNuevas].filter(Boolean)) if (!existsSync(ruta)) throw new Error(`No existe ${ruta}.`);
    delPr = leerHuellasDelPr(readFileSync(rutaPr, "utf8"));
    produccion = leerHuellas(readFileSync(rutaProduccion, "utf8"));
    if (rutaNuevas) {
      const motivo = noCoinciden(delPr, readFileSync(rutaNuevas, "utf8").split("\n").map((l) => l.trim()).filter(Boolean));
      if (motivo) throw new Error(motivo);
    }
  } catch (e) {
    console.error(`✗ No se pudo comprobar producción: ${String(e.message ?? e).split("\n")[0]}`);
    process.exit(2);
  }
  const resultado = comprobar(delPr, produccion);
  const texto = informe(resultado, { detalle });
  if (resultado.some((r) => r.estado === "falta")) {
    console.error(texto);
    process.exit(1);
  }
  console.log(texto);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
