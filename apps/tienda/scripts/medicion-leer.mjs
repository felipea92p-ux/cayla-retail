#!/usr/bin/env node
/**
 * Lee la medición de la tienda (ADR-0447): cuánto tardó cada página en el aparato de los clientes reales. La tienda la escribe en el
 * registro de Vercel, que en el plan Pro guarda UN día; por eso este script baja lo último, lo guarda en `apps/tienda/.medicion/` (fuera
 * de git) y resume todo lo guardado de los últimos días. Corrido una vez al día, junta semanas aunque Vercel guarde un día.
 *
 * USO
 *   pnpm --filter tienda medicion:leer                      # baja las últimas 24 h de producción y resume los últimos 7 días
 *   pnpm --filter tienda medicion:leer -- --dias 14         # resume dos semanas de lo guardado
 *   pnpm --filter tienda medicion:leer -- --horas 6         # baja solo las últimas 6 h
 *   pnpm --filter tienda medicion:leer -- --sin-bajar       # solo resume lo ya guardado
 *   pnpm --filter tienda medicion:leer -- --archivo <ruta>  # lee un registro guardado (el de `next start`, en local), sin Vercel
 *   pnpm --filter tienda medicion:leer -- --scope <equipo>  # otro equipo de Vercel (por defecto, `cayla`)
 *
 * Necesita la CLI de Vercel 64 o más nueva (`vercel logs` con `--since` y `--json`) y haber entrado con `vercel login`.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ETIQUETA, formatear, leerEnvios, resumir } from "./medicion-resumen.mjs";

const argumento = (nombre, otro) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : otro;
};
const HORAS = Number(argumento("--horas", "24"));
const DIAS = Number(argumento("--dias", "7"));
const ARCHIVO = argumento("--archivo", null);
// El equipo de CAYLA en Vercel (plan Pro), donde vive el proyecto de la tienda: sin él, la CLI pide un proyecto «enlazado».
const SCOPE = argumento("--scope", "cayla");
const PROYECTO = argumento("--proyecto", "cayla-tienda");
const SIN_BAJAR = process.argv.includes("--sin-bajar") || ARCHIVO !== null;
const GUARDADO = fileURLToPath(new URL("../.medicion/", import.meta.url));
const VERSION_MINIMA = 64;

if (!(HORAS > 0 && HORAS <= 24 * 30) || !(DIAS > 0 && DIAS <= 365)) {
  console.error("--horas va de 1 a 720 y --dias de 1 a 365.");
  process.exit(2);
}

function vercel(args) {
  return execFileSync("vercel", [...args, "--scope", SCOPE], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

/** Lo de las últimas `HORAS` en producción, página a página (`vercel logs` devuelve hasta 10.000 registros por vez). */
function bajarDeVercel() {
  let version = "";
  try {
    version = vercel(["--version"]);
  } catch {
    console.error("No encuentro la CLI de Vercel. Instálala con: npm i -g vercel@latest  (y entra con: vercel login)");
    process.exit(1);
  }
  const mayor = Number(version.match(/(\d+)\.\d+\.\d+/)?.[1] ?? 0);
  if (mayor < VERSION_MINIMA) {
    console.error(`La CLI de Vercel es la ${mayor}; hace falta la ${VERSION_MINIMA} o más nueva para leer horas pasadas. Actualízala con: npm i -g vercel@latest`);
    process.exit(1);
  }
  const salida = [];
  let siguiente = null;
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const args = siguiente
      ? ["logs", "--next", siguiente, "--limit", "10000", "--json"]
      : ["logs", "--project", PROYECTO, "--environment", "production", "--query", ETIQUETA, "--since", `${HORAS}h`, "--limit", "10000", "--json"];
    const texto = vercel(args);
    salida.push(texto);
    const resumen = texto
      .trim()
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .find((o) => o?.type === "summary" || o?.pagination);
    siguiente = resumen?.pagination?.hasMore ? resumen.pagination.next : null;
    if (!siguiente) break;
  }
  return salida.join("\n");
}

function guardados() {
  try {
    return readdirSync(GUARDADO)
      .filter((n) => n.endsWith(".jsonl"))
      .map((n) => readFileSync(join(GUARDADO, n), "utf8"));
  } catch {
    return [];
  }
}

let nuevos = [];
if (ARCHIVO) {
  nuevos = leerEnvios(readFileSync(ARCHIVO, "utf8"));
  console.log(`${nuevos.length} envíos en ${ARCHIVO}.`);
} else if (!SIN_BAJAR) {
  nuevos = leerEnvios(bajarDeVercel());
  if (nuevos.length > 0) {
    mkdirSync(GUARDADO, { recursive: true });
    const nombre = `${new Date().toISOString().slice(0, 16).replace(/:/g, "-")}.jsonl`;
    // Cada envío en una línea, con su etiqueta: el mismo formato del registro, así `leerEnvios` lo vuelve a leer igual.
    writeFileSync(join(GUARDADO, nombre), nuevos.map((e) => `${ETIQUETA} ${JSON.stringify(e)}`).join("\n") + "\n");
    console.log(`${nuevos.length} envíos de las últimas ${HORAS} h, guardados en apps/tienda/.medicion/${nombre}.`);
  } else {
    console.log(`Vercel no tiene envíos de las últimas ${HORAS} h.`);
  }
}

// Lo guardado de días anteriores más lo recién leído: `resumir` cuenta cada envío una sola vez.
const todos = [...guardados().flatMap(leerEnvios), ...(ARCHIVO ? nuevos : [])];
console.log(`\n${formatear(resumir(todos, Date.now() - DIAS * 24 * 60 * 60 * 1000))}`);
