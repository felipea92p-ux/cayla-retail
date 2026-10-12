#!/usr/bin/env node
/**
 * Huellas del PR — qué deja en la base cada migración nueva de un PR, para comprobar después que producción lo tiene.
 *
 * EL PROBLEMA QUE RESUELVE. El check «SQL pegado» le creía a una casilla: si alguien la marcaba sin pegar (o pegaba una
 * versión vieja del archivo), Vercel publicaba la web nueva contra una base que no tenía sus funciones. Para mirar
 * producción hace falta saber QUÉ tendría que encontrar, y eso no se lee del texto del SQL (un `create or replace`, un
 * reemplazo anclado o un `revoke` solo se entienden aplicándolos): se aplica cada archivo sobre la base de main y se mira
 * qué cambió en el catálogo, con la misma huella que la deriva (`deriva.sql`, ADR-0251).
 *
 * QUÉ PROMETE. Tres órdenes, que el CI corre alrededor de `supabase start` (job «Pruebas de RPC contra Postgres», solo
 * en un PR):
 *   apartar <carpeta>        Mueve a <carpeta> las migraciones que el PR agrega (contra `HEAD^1`: en un PR el checkout es el
 *                            merge sobre main), para que `supabase start` levante solo la base de main. Sin migraciones
 *                            nuevas no crea la carpeta.
 *   aplicar <carpeta> [<json>]
 *                            Con la base de main arriba, aplica cada migración apartada en orden de versión —cada una en
 *                            su propia sesión y transacción, como el SQL Editor de producción— y la anota en el historial
 *                            de Supabase. Con <json> (la tanda 1 del CI) toma huellas antes y después de cada una y escribe
 *                            por archivo cada objeto que cambió y la huella que tiene que tener en producción (la del
 *                            final). Sin <json> (las otras tandas, que solo necesitan la base) no toma huellas.
 *   devolver <carpeta>       Las vuelve a poner en `supabase/migrations/`: hay pruebas que leen el archivo de su migración
 *                            (42 scripts de `scripts/pruebas/` lo hacen), y sin él fallarían por algo que no es suyo.
 * Lo que asume: el contenedor `supabase_db_cayla-retail` está arriba y `deriva.sql` es la única definición de huella (la
 * misma que `retail.huellas_catalogo` en producción).
 *
 * SI ALGO FALLA. Una migración que no se aplica hace fallar el paso, igual que antes fallaba `supabase start`: las pruebas
 * no corren sobre una base a medias. Si lo que falla es TOMAR huellas, las migraciones se aplican igual (las pruebas las
 * necesitan) y el JSON no se escribe: el check «SQL pegado» dirá que no pudo comprobar, nunca que está pegado.
 *
 * QUÉ CAMBIA PARA LAS PRUEBAS. Las migraciones del PR corren DESPUÉS de todas las de main, aunque su versión sea anterior
 * a la última de main. Es el orden real de producción (lo de main ya está pegado; lo del PR se pega ahora).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { leerHuellas } from "./deriva.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** El repo donde se apartan y devuelven las migraciones. Solo la prueba lo cambia (un repo de juguete). */
const repo = () => process.env.HUELLAS_RAIZ ?? RAIZ;
const CARPETA = "supabase/migrations";
/** Lo que Supabase aplica: `<versión>_<nombre>.sql`. Los demás `.sql` de la carpeta (los «pegar-en-produccion-…») los salta. */
const MIGRACION = /^supabase\/migrations\/(\d+)_[^/]+\.sql$/;
const CONTENEDOR = "supabase_db_cayla-retail";

/** De lo que el PR agrega (`git diff --name-only --diff-filter=A`), las que Supabase aplicaría, en orden de versión. */
export function nuevasDelPr(agregados) {
  return agregados
    .filter((ruta) => MIGRACION.test(ruta))
    .sort((a, b) => basename(a).localeCompare(basename(b)));
}

/**
 * Qué cambió cada archivo. `antes` = huellas de la base de main; `pasos` = `[{ archivo, despues }]` en el orden en que se
 * aplicaron, con las huellas después de cada uno (Maps «grupo<TAB>clave» → huella, como los da `leerHuellas`).
 * Devuelve `[{ archivo, objetos: { clave: huellaFinal | null } }]`: `null` = el objeto no tiene que existir (lo borró).
 * Se exige la huella FINAL, no la que dejó ese archivo: si otro archivo del mismo PR vuelve a cambiar la función, lo que
 * importa es la última versión. Un archivo que no cambió nada del catálogo (solo datos) queda con `objetos` vacío.
 */
export function deltaPorArchivo(antes, pasos) {
  const final = pasos.length ? pasos.at(-1).despues : antes;
  const r = [];
  let previo = antes;
  for (const { archivo, despues } of pasos) {
    const objetos = {};
    for (const clave of new Set([...previo.keys(), ...despues.keys()])) {
      if (previo.get(clave) !== despues.get(clave)) objetos[clave] = final.get(clave) ?? null;
    }
    r.push({ archivo, objetos });
    previo = despues;
  }
  return r;
}

function psql(args, entrada) {
  return execFileSync("docker", ["exec", "-i", CONTENEDOR, "psql", "-U", "postgres", "-d", "postgres", ...args], {
    input: entrada,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["pipe", "pipe", "inherit"],
  });
}

const huellas = () => leerHuellas(psql(["-At", "-q", "-v", "ON_ERROR_STOP=1"], readFileSync(join(RAIZ, "scripts/migraciones/deriva.sql"), "utf8")));

/** Toma huellas; si no puede, avisa y devuelve null (las migraciones se siguen aplicando). */
function huellasOAviso(momento) {
  try {
    return huellas();
  } catch (e) {
    console.log(`::warning::No se pudieron tomar las huellas ${momento}: ${String(e.message ?? e).split("\n")[0]}`);
    return null;
  }
}

function apartar(destino) {
  // `--no-renames`: un archivo que llega a la carpeta movido desde otra cuenta como nuevo (GitHub también lo cuenta así).
  const agregados = execFileSync("git", ["diff", "--name-only", "--no-renames", "--diff-filter=A", "HEAD^1", "HEAD", "--", CARPETA], { cwd: repo(), encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const nuevas = nuevasDelPr(agregados);
  if (nuevas.length === 0) {
    console.log("El PR no agrega migraciones: nada que apartar.");
    return;
  }
  mkdirSync(destino, { recursive: true });
  // Copiar y borrar, no `rename`: la carpeta temporal del runner puede estar en otro disco (EXDEV).
  for (const ruta of nuevas) {
    copyFileSync(join(repo(), ruta), join(destino, basename(ruta)));
    rmSync(join(repo(), ruta));
  }
  console.log(`Apartadas ${nuevas.length} migraciones del PR: ${nuevas.map((r) => basename(r)).join(", ")}`);
}

function aplicar(carpeta, salida) {
  const archivos = nuevasDelPr(readdirSync(carpeta).map((n) => `${CARPETA}/${n}`)).map((r) => basename(r));
  let antes = salida ? huellasOAviso("de la base de main") : null;
  const pasos = [];
  for (const archivo of archivos) {
    const sql = readFileSync(join(carpeta, archivo), "utf8");
    console.log(`Aplicando ${archivo}`);
    // Una sesión y una transacción por archivo, como el SQL Editor: un `set` de un archivo no le llega al siguiente.
    psql(["-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", "-"], sql);
    // El historial de Supabase, como lo deja `supabase start` (y espejo.mjs): sin el texto, que nadie lee de aquí.
    const [, version, nombre] = archivo.match(/^(\d+)_(.+)\.sql$/);
    psql(["-q", "-v", "ON_ERROR_STOP=1", "-v", `v=${version}`, "-v", `n=${nombre}`],
      "insert into supabase_migrations.schema_migrations (version, name, statements) values (:'v', :'n', '{}') on conflict (version) do nothing;\n");
    if (antes) {
      const despues = huellasOAviso(`después de ${archivo}`);
      if (despues) pasos.push({ archivo, despues });
      else antes = null; // Sin el paso intermedio no se sabe qué cambió cada archivo: no se escribe nada a medias.
    }
  }
  if (!salida) {
    console.log(`Aplicadas ${archivos.length} migraciones del PR (sin huellas: no se pidieron).`);
    return;
  }
  if (!antes) {
    console.log("::warning::Sin huellas del PR: el check «SQL pegado» no podrá comprobar producción en este commit.");
    return;
  }
  const delta = deltaPorArchivo(antes, pasos);
  writeFileSync(salida, `${JSON.stringify({ archivos: delta }, null, 1)}\n`);
  const cambios = delta.reduce((n, a) => n + Object.keys(a.objetos).length, 0);
  console.log(`Huellas del PR: ${archivos.length} migraciones, ${cambios} cambios en el catálogo → ${salida}`);
}

function devolver(carpeta) {
  const archivos = readdirSync(carpeta).filter((n) => n.endsWith(".sql"));
  for (const nombre of archivos) copyFileSync(join(carpeta, nombre), join(repo(), CARPETA, nombre));
  console.log(`Devueltas ${archivos.length} migraciones del PR a ${CARPETA}/.`);
}

function main() {
  const [orden, ...args] = process.argv.slice(2);
  if (orden === "apartar" && args.length === 1) return apartar(args[0]);
  if (orden === "aplicar" && (args.length === 1 || args.length === 2)) return aplicar(args[0], args[1]);
  if (orden === "devolver" && args.length === 1) return devolver(args[0]);
  console.error("Uso: huellas-del-pr.mjs apartar <carpeta> | aplicar <carpeta> [<salida.json>] | devolver <carpeta>");
  process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
