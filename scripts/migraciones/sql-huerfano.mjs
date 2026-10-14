#!/usr/bin/env node
/**
 * SQL huérfano — un PR que se cierra sin fusionar, con su SQL ya pegado en producción, no deja a producción por delante
 * del repo en silencio.
 *
 * EL PROBLEMA QUE RESUELVE. El SQL se pega en producción ANTES de fusionar (ADR-0251). Si después el PR se cierra sin
 * fusionar, ese SQL sigue vivo allá y no está en ningún archivo de `main`: la próxima migración que rehaga la misma función
 * desde el repo lo borra sin que nadie se entere. Pasó con #978 (ADR-0382): se cerró el 2026-10-12, sin comentario, con
 * `aprobar_devolucion` ya cambiada en producción, y nada avisó hasta que el check «SQL pegado» de #1054, que cambia la
 * misma función, salió rojo el 2026-10-14 sin una causa a la vista (lo arregló #1062). La revisión diaria no lo nombró:
 * dice solo «producción ≠ main», y está así casi todos los días porque producción va por delante con los PR abiertos.
 *
 * QUÉ PROMETE. Cada vez que corre (al cerrarse un PR, al llegar migraciones a `main` y una vez al día):
 *   - abre el aviso «SQL en producción que main no tiene: PR #N», y lo comenta en el PR, por cada PR cerrado sin
 *     fusionar, de este repo (no de un fork), que marcó «SQL pegado en producción» y agrega migraciones que `main` no
 *     tiene. Uno por PR: si ese PR ya tiene aviso, abierto o cerrado a mano, no abre otro ni vuelve a comentar;
 *   - cierra solo el aviso cuyos archivos ya están TODOS en `main` (el PR se reabrió y se fusionó, o sus migraciones
 *     viajaron en otro PR con el mismo nombre de archivo).
 * Lo que asume: `<raíz>/supabase/migrations` es `main` (el workflow baja `main`, nunca el código del PR) y la casilla dice
 * la verdad. No mira producción: ver el ADR-0251, actualización 2026-10-14.
 *
 * LO QUE PUBLICA. El repo es público y el aviso lo ve cualquiera: nombra el PR y sus archivos de migración, que ya están
 * en el PR (y el PR ya dice que se pegaron); nunca qué objeto de la base cambia, y nunca lee el contenido de un archivo.
 * Y solo dice que producción tiene algo DE MÁS, nunca que le falta algo de `main`: eso diría qué puerta sigue abierta (el
 * criterio de la deriva y de `sql-en-produccion.mjs`).
 *
 * SI ALGO FALLA. Si GitHub no responde, sale con 1 y la corrida queda roja. No se pierde nada: cada corrida decide de
 * nuevo con lo que hay, y el barrido diario lo repite. Si el aviso se abrió y falló el comentario en el PR, queda el aviso
 * (lo que importa) y la corrida en rojo.
 *
 * USO (lo corre `.github/workflows/sql-huerfano.yml`; necesita `gh` con GH_TOKEN, y GITHUB_REPOSITORY)
 *   node scripts/migraciones/sql-huerfano.mjs [--pr <n>] [--simular]
 *   --pr       el PR que se acaba de cerrar: el buscador de GitHub tarda en verlo cerrado, así que se pide directo.
 *   --simular  dice qué haría, sin escribir nada en GitHub (para mirarlo en local).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { revisarSqlPegado } from "./sql-pegado.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TITULO = "SQL en producción que main no tiene: PR #";
const MARCA = /<!-- sql-huerfano pr=(\d+) -->/;
/** Una línea de archivo del aviso: `supabase/migrations/<archivo>.sql`, sin barras en el nombre (ni subcarpetas ni `../`). */
const LINEA_ARCHIVO = /^- `(supabase\/migrations\/[^/`]+\.sql)`$/gm;

/** Un PR de la API REST (`gh api repos/<repo>/pulls/<n>`), con la forma que usa el resto del script. */
export function desdeRest(pr, repo) {
  return {
    numero: pr.number,
    cerradoSinFusionar: pr.state === "closed" && !pr.merged && !pr.merged_at,
    propio: pr.head?.repo?.full_name === repo, // `null` si el fork ya no existe: tampoco es propio.
    cuerpo: pr.body ?? "",
  };
}

/** Un PR de `gh pr list --json number,state,mergedAt,isCrossRepository,body`. */
export function desdeLista(pr) {
  return { numero: pr.number, cerradoSinFusionar: pr.state === "CLOSED" && !pr.mergedAt, propio: pr.isCrossRepository === false, cuerpo: pr.body ?? "" };
}

/** El PR de un aviso: la marca del cuerpo (sobrevive a que alguien cambie el título) o, si la borraron, el título. */
export function prDelAviso({ title, body }) {
  const marca = (body ?? "").match(MARCA);
  if (marca) return Number(marca[1]);
  const titulo = (title ?? "").startsWith(TITULO) ? title.slice(TITULO.length).match(/^(\d+)\s*$/) : null;
  return titulo ? Number(titulo[1]) : null;
}

/** Los archivos que lista el cuerpo de un aviso. Una línea que no tiene la forma exacta no cuenta. */
export function archivosDelAviso(body) {
  return [...(body ?? "").matchAll(LINEA_ARCHIVO)].map((m) => m[1]);
}

/** Las migraciones que un PR agregó, marcó como pegadas en producción y `main` no tiene. Vacío = nada que avisar. */
export function huerfanas({ archivos, cuerpo, enMain }) {
  const { nuevas, casilla } = revisarSqlPegado(archivos, cuerpo);
  if (casilla !== "pegado") return [];
  return nuevas.filter((ruta) => !enMain(ruta));
}

/** Los avisos abiertos cuyos archivos ya están todos en `main`. Uno sin archivos legibles no se cierra solo. */
export function porCerrar(avisos, enMain) {
  return avisos.filter((a) => a.abierto && a.archivos.length > 0 && a.archivos.every(enMain));
}

/**
 * Los PR que vale la pena mirar (bajar sus archivos): cerrados sin fusionar, de este repo, con «SQL pegado en producción»
 * marcada y sin aviso todavía. La casilla se lee primero porque es gratis; los archivos cuestan una llamada por PR.
 */
export function porRevisar(prs, avisos) {
  const conAviso = new Set(avisos.map((a) => a.pr));
  return prs.filter((p) => p.cerradoSinFusionar && p.propio && !conAviso.has(p.numero) && revisarSqlPegado([], p.cuerpo).casilla === "pegado");
}

const lista = (archivos) => archivos.map((r) => `\`${basename(r)}\``).join(", ");

/** El aviso. Nombra el PR y sus archivos de migración; nada de lo que hay adentro. */
export function aviso(pr, archivos) {
  const cuerpo = [
    `<!-- sql-huerfano pr=${pr} -->`,
    `**#${pr} se cerró sin fusionar, y había marcado «SQL pegado en producción».** Su SQL quedó en producción, y \`main\` no tiene ${archivos.length === 1 ? "este archivo" : "estos archivos"}:`,
    "",
    ...archivos.map((r) => `- \`${r}\``),
    "",
    "**Por qué importa.** Producción corre algo que el repo no tiene. La próxima migración que rehaga lo mismo desde `main` lo borra sin que nadie se entere, y el check «SQL pegado» de cualquier PR que toque lo mismo sale rojo sin una causa a la vista.",
    "",
    "**Qué hacer, una de dos:**",
    `1. **Si el cambio vale:** reabre #${pr} y fusiónalo, o lleva sus migraciones a otro PR con el mismo nombre de archivo. Este aviso se cierra solo cuando ${archivos.length === 1 ? "ese archivo llega" : "esos archivos llegan"} a \`main\` (si cambiaron de nombre en el camino, ciérralo a mano cuando lleguen).`,
    "2. **Si no vale:** devuelve producción a lo que dice `main` (una migración nueva que rehaga, con el texto de `main`, lo que estas cambiaron) y cierra este aviso a mano diciendo con qué PR.",
    "",
    `Si la casilla se marcó por error y ese SQL nunca se pegó, ciérralo a mano. Qué cambia en la base no se escribe aquí, porque el repo es público: pídele a Claude «¿el SQL de #${pr} está en producción?». Ver ADR-0251 (actualización 2026-10-14).`,
  ].join("\n");
  return { titulo: `${TITULO}${pr}`, cuerpo };
}

export function comentarioDelPr(pr, archivos, issue) {
  const sigue = issue ? `#${issue}` : `el aviso «${TITULO}${pr}»`;
  return (
    `⚠ **Este PR se cerró sin fusionar y había marcado «SQL pegado en producción»:** su SQL quedó en producción y \`main\` no tiene ${lista(archivos)}. ` +
    `Lo sigue ${sigue} hasta que ${archivos.length === 1 ? "ese archivo llegue" : "esos archivos lleguen"} a \`main\` (reabre este PR, o lleva sus migraciones a otro), o hasta que producción vuelva a lo que dice \`main\`.`
  );
}

export function comentarioDeCierre({ pr, archivos }) {
  return `${archivos.length === 1 ? "El archivo" : "Los archivos"} de #${pr} ya ${archivos.length === 1 ? "está" : "están"} en \`main\` (${lista(archivos)}): el repo vuelve a tener ese SQL. Se cierra solo (ADR-0251).`;
}

/**
 * Una pasada. `gh(args, entrada?)` devuelve lo que imprime `gh` (o lanza si falla); `enMain(ruta)` dice si el archivo está
 * en `main`. Devuelve lo que hizo (o, con `simular`, lo que haría), una línea por acción.
 */
export function correr({ gh, repo, pr = null, enMain, simular = false }) {
  const json = (args) => JSON.parse(gh(args));
  const hechos = [];

  const avisos = json(["issue", "list", "--repo", repo, "--state", "all", "--limit", "1000", "--json", "number,title,state,body"])
    .map((i) => ({ numero: i.number, abierto: i.state === "OPEN", pr: prDelAviso(i), archivos: archivosDelAviso(i.body) }))
    .filter((a) => a.pr !== null);

  for (const a of porCerrar(avisos, enMain)) {
    if (!simular) gh(["issue", "close", String(a.numero), "--repo", repo, "--comment", comentarioDeCierre(a)]);
    hechos.push(`${simular ? "cerraría" : "cerré"} el aviso #${a.numero}: los archivos de #${a.pr} ya están en main`);
  }

  // El buscador de GitHub tarda en ver cerrado un PR recién cerrado: ese se pide directo y reemplaza al de la lista.
  let prs = json(["pr", "list", "--repo", repo, "--state", "closed", "--search", "is:unmerged", "--limit", "1000", "--json", "number,state,mergedAt,isCrossRepository,body"]).map(desdeLista);
  if (pr !== null) prs = [desdeRest(json(["api", `repos/${repo}/pulls/${pr}`]), repo), ...prs.filter((p) => p.numero !== pr)];

  for (const p of porRevisar(prs, avisos)) {
    // `--slurp` junta las páginas en un arreglo de arreglos.
    const archivos = json(["api", `repos/${repo}/pulls/${p.numero}/files`, "--paginate", "--slurp"]).flat();
    const sueltas = huerfanas({ archivos, cuerpo: p.cuerpo, enMain });
    if (sueltas.length === 0) continue;
    const { titulo, cuerpo } = aviso(p.numero, sueltas);
    if (simular) {
      hechos.push(`abriría «${titulo}» por ${lista(sueltas)}`);
      continue;
    }
    const url = gh(["issue", "create", "--repo", repo, "--title", titulo, "--body-file", "-"], cuerpo);
    const issue = url.trim().match(/\/issues\/(\d+)$/)?.[1] ?? null;
    hechos.push(`abrí ${issue ? `#${issue}` : `«${titulo}»`} por ${lista(sueltas)}`);
    gh(["pr", "comment", String(p.numero), "--repo", repo, "--body-file", "-"], comentarioDelPr(p.numero, sueltas, issue));
  }
  return hechos;
}

function main() {
  const args = process.argv.slice(2);
  const simular = args.includes("--simular");
  const iPr = args.indexOf("--pr");
  const prTexto = iPr >= 0 ? args[iPr + 1] : null;
  const repo = process.env.GITHUB_REPOSITORY ?? "";
  try {
    if (prTexto !== null && !/^\d+$/.test(prTexto ?? "")) throw new Error(`--pr tiene que ser un número (llegó «${prTexto}»).`);
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Falta GITHUB_REPOSITORY (dueño/repo).");
    const raiz = process.env.SQL_HUERFANO_RAIZ ?? RAIZ;
    if (!existsSync(join(raiz, "supabase", "migrations"))) throw new Error("No está supabase/migrations de main: sin eso no se sabe qué tiene main.");
    const gh = (argumentos, entrada) =>
      execFileSync("gh", argumentos, { encoding: "utf8", input: entrada, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    const hechos = correr({ gh, repo, pr: prTexto === null ? null : Number(prTexto), enMain: (ruta) => existsSync(join(raiz, ruta)), simular });
    console.log(hechos.length ? hechos.join("\n") : "✓ Ningún PR cerrado sin fusionar dejó SQL en producción que main no tenga (y ningún aviso por cerrar).");
  } catch (e) {
    // Solo la primera línea: el error de `gh` no trae nada de la base, pero una respuesta entera no tiene por qué ir al registro.
    console.error(`::error::No se pudo revisar el SQL de los PR cerrados: ${String(e.stderr || e.message || e).trim().split("\n")[0]}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
