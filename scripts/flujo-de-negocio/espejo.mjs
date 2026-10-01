#!/usr/bin/env node
/**
 * ¿Este árbol es un ESPEJO de una foto de `main`? — el instrumento de `/flujo-de-negocio`, no el razonamiento.
 *
 * EL PROBLEMA QUE RESUELVE. Un caso corrido contra un ERP distinto del que se publica no prueba nada. «Espejo» tiene DOS
 * mitades y las dos se desvían sin avisar: el CÓDIGO (la rama debe ser idéntica a `main`) y la BASE LOCAL (debe tener
 * aplicadas las migraciones de ese código). Pero `main` no se detiene: cada día trae commits y migraciones, y una skill que
 * exigiera «igual a lo último» cambiaría la base compartida a mitad de un trabajo.
 *
 * LA DECISIÓN (Felipe, 2026-09-30). El espejo es de una FOTO de `main`, la de la última actualización, y solo Felipe ordena
 * actualizar. Entre actualizaciones se trabaja con lo que hay: lo que `main` trajo después se INFORMA (`ℹ`) y no bloquea. Ni
 * yo ni la skill aplican migraciones nuevas por su cuenta.
 *
 * QUÉ REGISTRA. `.flujo-de-negocio/actualizacion.json`: el SHA de `main` de la foto, la rama de corrida, de dónde salió la
 * skill y las migraciones que Felipe aceptó dejar sin aplicar. Todo informe cita ese SHA.
 *
 * MODOS
 *   verificar [--json]    Solo LEE. Compara el árbol y la base con la foto registrada. Sale con 1 si algo no cuadra.
 *   aceptar               No cambia git ni la base: registra el estado ACTUAL como la foto de trabajo (exige que el código ya
 *                         sea idéntico a `origin/main`) y deja como «aceptadas» las migraciones que la base no tiene.
 *   actualizar            SOLO cuando Felipe lo ordena. Con el árbol limpio: respalda la base, aplica las migraciones
 *                         pendientes de `origin/main` (en orden; si una falla, se detiene y NO toca git), crea la rama
 *                         `flujo/AAAAMMDD-HHMM` idéntica a `origin/main`, le copia SOLO los archivos de la skill y registra la foto.
 *        --simular          muestra el plan y no cambia nada.
 *        --sin-migraciones  actualiza el código y deja las migraciones pendientes como aceptadas (actualización parcial).
 *        --fuente <rama>    de dónde copiar la skill (por defecto, la rama actual; después, la registrada).
 *
 * QUÉ NO PROMETE. Que la base tenga los mismos DATOS que producción (son de prueba, a propósito), ni que producción tenga
 * aplicado todo lo de `main` (eso lo mide `pnpm migraciones:deriva`).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const PUERTO_API = "54421";
const HOSTS_LOCALES = ["localhost", "127.0.0.1", "[::1]"];
const CUENTAS_SEED = ["felipe@cayla.local", "micaela@cayla.local", "sandra@cayla.local"];
const ARCHIVO_FOTO = join(RAIZ, ".flujo-de-negocio/actualizacion.json");

/** Lo que es de la skill: se copia a la rama de corrida. NO incluye `CLAUDE.md` ni `.gitignore`: copiarlos pisaría lo más nuevo de `main`. */
const DE_LA_SKILL = [".claude/skills/flujo-de-negocio", ".claude/skills/actualizar-flujo", "scripts/flujo-de-negocio", "docs/flujos"];
/**
 * Lo que puede diferir de `main` sin que el ERP deje de ser espejo: la skill, su documentación y sus resultados. Sin esta
 * excepción, una rama que lleva la skill jamás sería «idéntica a main». Sigue exigiendo que NADA de la aplicación difiera.
 */
const HERRAMIENTAS = [...DE_LA_SKILL.map((p) => `${p}/`), ".flujo-de-negocio/", "docs/bitacora/", "docs/backlog/", "CLAUDE.md", ".gitignore"];
const esHerramienta = (f) => HERRAMIENTAS.some((p) => f === p || f.startsWith(p));

const git = (...args) => execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
const psql = (sql) =>
  execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "psql", "-U", "postgres", "-At", "-c", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const rutasCambiadas = (a, b) => git("diff", "--name-only", a, b).split("\n").filter(Boolean);
const sinCommitFueraDeLaSkill = () =>
  git("status", "--porcelain").split("\n").filter(Boolean).map((l) => l.replace(/^\s*\S+\s+/, "")).filter((f) => !esHerramienta(f));

/** Versiones (`AAAAMMDDhhmmss`) de las migraciones que tiene un commit; dos archivos pueden compartir versión. */
const migracionesEn = (ref) =>
  [...new Set(git("ls-tree", "-r", "--name-only", ref, "supabase/migrations/").split("\n").map((f) => f.split("/").pop().match(/^(\d{8,})_/)?.[1]).filter(Boolean))].sort();
const archivosDeMigracion = (ref, version) =>
  git("ls-tree", "-r", "--name-only", ref, "supabase/migrations/").split("\n").filter((f) => f.split("/").pop().startsWith(`${version}_`)).sort();
const migracionesEnBase = () => new Set(psql("select version from supabase_migrations.schema_migrations;").split("\n"));

const leerFoto = () => (existsSync(ARCHIVO_FOTO) ? JSON.parse(readFileSync(ARCHIVO_FOTO, "utf8")) : null);
function guardarFoto(foto) {
  mkdirSync(join(RAIZ, ".flujo-de-negocio"), { recursive: true });
  writeFileSync(ARCHIVO_FOTO, JSON.stringify(foto, null, 2));
}
const traerMain = () => { try { git("fetch", "origin", "main", "--quiet"); return true; } catch { return false; } };

/** Cada chequeo devuelve { ok, titulo, detalle } y nunca lanza: un chequeo que no se pudo hacer es un ✗, no un silencio. */
function intentar(titulo, fn) {
  try {
    const r = fn();
    return { titulo, ok: r.ok, detalle: r.detalle };
  } catch (e) {
    return { titulo, ok: false, detalle: `no pude comprobarlo: ${String(e.message ?? e).split("\n")[0]}` };
  }
}

function chequeos(foto) {
  const lista = [];
  lista.push(
    intentar("Hay una actualización registrada", () =>
      foto
        ? { ok: true, detalle: `foto de main ${foto.base_sha.slice(0, 8)} · registrada ${foto.registrada} · rama ${foto.rama_corrida}` }
        : { ok: false, detalle: "no hay `.flujo-de-negocio/actualizacion.json`: `aceptar` registra el estado actual; `actualizar` lo hace Felipe" },
    ),
  );
  lista.push(
    intentar("ERP idéntico a la foto de main (solo la skill y su documentación pueden diferir)", () => {
      if (!foto) return { ok: false, detalle: "sin foto registrada no hay contra qué comparar" };
      const distintos = rutasCambiadas(foto.base_sha, "HEAD").filter((f) => !esHerramienta(f));
      const sinCommit = sinCommitFueraDeLaSkill();
      return {
        ok: distintos.length === 0 && sinCommit.length === 0,
        detalle:
          `HEAD ${git("rev-parse", "--short", "HEAD")} contra main ${foto.base_sha.slice(0, 8)} · archivos distintos fuera de la skill: ${distintos.length}` +
          ` · sin commit fuera de la skill: ${sinCommit.length}` + (distintos.length ? ` — p. ej. ${distintos.slice(0, 3).join(", ")}` : ""),
      };
    }),
  );
  lista.push(
    intentar("La web habla con el Supabase local de este repo", () => {
      const ruta = join(RAIZ, "apps/web/.env.local");
      if (!existsSync(ruta)) return { ok: false, detalle: "falta apps/web/.env.local (cópialo desde el checkout principal)" };
      const linea = readFileSync(ruta, "utf8").split("\n").find((l) => l.startsWith("NEXT_PUBLIC_SUPABASE_URL="));
      if (!linea) return { ok: false, detalle: "el .env.local no define NEXT_PUBLIC_SUPABASE_URL" };
      const url = new URL(linea.split("=")[1].trim().replace(/^["']|["']$/g, ""));
      return { ok: HOSTS_LOCALES.includes(url.hostname) && url.port === PUERTO_API, detalle: `${url.hostname}:${url.port || "(sin puerto)"} — se espera un host local en el puerto ${PUERTO_API}` };
    }),
  );
  lista.push(intentar("Postgres local disponible", () => ({ ok: true, detalle: `contenedor ${CONTENEDOR_LOCAL} responde (${psql("select count(*) from retail.ubicaciones;")} ubicaciones)` })));
  lista.push(
    intentar("Base local con las migraciones de la foto (salvo las que Felipe aceptó dejar)", () => {
      if (!foto) return { ok: false, detalle: "sin foto registrada" };
      const enBase = migracionesEnBase();
      const faltan = migracionesEn(foto.base_sha).filter((v) => !enBase.has(v));
      const sinAceptar = faltan.filter((v) => !foto.migraciones_aceptadas.includes(v));
      const aceptadas = faltan.filter((v) => foto.migraciones_aceptadas.includes(v));
      return {
        ok: sinAceptar.length === 0,
        detalle: sinAceptar.length
          ? `faltan ${sinAceptar.length} sin aceptar (${sinAceptar.join(", ")}) — solo Felipe ordena actualizar`
          : `${migracionesEn(foto.base_sha).length} migraciones de la foto` + (aceptadas.length ? `; sin aplicar y aceptadas por Felipe: ${aceptadas.join(", ")}` : "; todas aplicadas"),
      };
    }),
  );
  lista.push(intentar("Cuentas de prueba del seed", () => {
    const hay = new Set(psql("select email from auth.users;").split("\n"));
    const faltan = CUENTAS_SEED.filter((c) => !hay.has(c));
    return { ok: faltan.length === 0, detalle: faltan.length ? `faltan: ${faltan.join(", ")}` : CUENTAS_SEED.join(", ") };
  }));
  return lista;
}

/** Lo que `main` trajo desde la foto. Se INFORMA; no bloquea: es lo que Felipe decide cuándo incorporar. */
function novedades(foto) {
  if (!foto) return null;
  if (!traerMain()) return { sin_red: true };
  const commits = Number(git("rev-list", "--count", `${foto.base_sha}..origin/main`));
  const nuevas = migracionesEn("origin/main").filter((v) => !migracionesEn(foto.base_sha).includes(v));
  return { commits, migraciones_nuevas: nuevas };
}

function verificar(comoJson) {
  const foto = leerFoto();
  const lista = chequeos(foto);
  const nov = novedades(foto);
  const espejo = lista.every((c) => c.ok);
  if (comoJson) return console.log(JSON.stringify({ espejo, chequeos: lista, novedades: nov, foto }, null, 2)), espejo;
  console.log("─".repeat(78));
  for (const c of lista) console.log(`${c.ok ? "✓" : "✗"} ${c.titulo}\n    ${c.detalle}`);
  if (nov) {
    console.log(
      nov.sin_red
        ? "ℹ No pude consultar origin/main (sin red): no sé qué trajo desde la foto."
        : `ℹ main desde la foto: ${nov.commits} commit(s)` + (nov.migraciones_nuevas.length ? `, migraciones nuevas ${nov.migraciones_nuevas.join(", ")}` : ", sin migraciones nuevas") +
          (nov.commits ? " — no bloquea; se incorpora cuando Felipe ordene actualizar (el informe lo anota como «no verificado»)." : "."),
    );
  }
  console.log("─".repeat(78));
  console.log(espejo ? "ESPEJO: SÍ — se puede correr un caso." : "ESPEJO: NO — no se corre ningún caso hasta resolver los ✗.");
  return espejo;
}

function aceptar() {
  if (!traerMain()) { console.error("Sin red: no puedo traer origin/main para registrar la foto."); process.exit(2); }
  const base = git("rev-parse", "origin/main");
  const distintos = rutasCambiadas(base, "HEAD").filter((f) => !esHerramienta(f));
  const sinCommit = sinCommitFueraDeLaSkill();
  if (distintos.length || sinCommit.length) {
    console.error(`No registro: el ERP de este árbol no es idéntico a origin/main (${distintos.length} archivo(s) distintos, ${sinCommit.length} sin commit). Eso es una actualización, no una aceptación: la ordena Felipe.`);
    process.exit(2);
  }
  const enBase = migracionesEnBase();
  const pendientes = migracionesEn(base).filter((v) => !enBase.has(v));
  const rama = git("branch", "--show-current");
  guardarFoto({
    registrada: new Date().toISOString(), base_sha: base, rama_corrida: rama, fuente: rama, migraciones_aceptadas: pendientes,
    nota: "Estado aceptado tal cual por Felipe: no se actualizó la base; las migraciones pendientes se dejan sin aplicar.",
  });
  console.log(`Foto registrada: main ${base.slice(0, 8)}, rama ${rama}. Migraciones sin aplicar y aceptadas: ${pendientes.join(", ") || "ninguna"}.`);
  return true;
}

function respaldar() {
  const dir = join(RAIZ, ".flujo-de-negocio/respaldos");
  mkdirSync(dir, { recursive: true });
  const archivo = join(dir, `local-antes-de-actualizar-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.dump`);
  writeFileSync(archivo, execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "pg_dump", "-U", "supabase_admin", "-d", "postgres", "-Fc"], { maxBuffer: 1024 * 1024 * 1024 }));
  return archivo;
}

/** Aplica UNA versión (todos sus archivos, cada uno en su transacción) tal como está en `ref`, y la registra una sola vez. */
function aplicarVersion(ref, version) {
  const archivos = archivosDeMigracion(ref, version);
  for (const [i, f] of archivos.entries()) {
    const sql = git("show", `${ref}:${f}`);
    const r = spawnSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-1", "-q", "-f", "-"], { input: sql, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${f}\n${String(r.stderr).split("\n").slice(0, 6).join("\n")}`);
    if (i === 0) {
      const nombre = f.split("/").pop().replace(/^\d+_/, "").replace(/\.sql$/, "");
      psql(`insert into supabase_migrations.schema_migrations(version,name,statements) values ('${version}','${nombre}','{}') on conflict (version) do nothing;`);
    }
  }
}

function actualizar(flags) {
  const simular = flags.includes("--simular");
  const sinMigraciones = flags.includes("--sin-migraciones");
  const iFuente = flags.indexOf("--fuente");
  const foto = leerFoto();
  const fuente = (iFuente >= 0 ? flags[iFuente + 1] : null) ?? foto?.fuente ?? git("branch", "--show-current");
  if (git("status", "--porcelain").length) { console.error("El árbol tiene cambios sin commit: no cambio de rama con trabajo a medias. Commit primero."); process.exit(2); }
  if (!traerMain()) { console.error("Sin red: no puedo traer origin/main."); process.exit(2); }
  const base = git("rev-parse", "origin/main");
  const enBase = migracionesEnBase();
  const pendientes = migracionesEn(base).filter((v) => !enBase.has(v));
  const yaEnMain = (() => { try { git("cat-file", "-e", `${base}:.claude/skills/flujo-de-negocio/SKILL.md`); return true; } catch { return false; } })();
  const rama = `flujo/${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12).replace(/^(\d{8})/, "$1-")}`;

  console.log(`Plan de actualización${simular ? " (SIMULACIÓN: no se cambia nada)" : ""}:`);
  console.log(`  · foto nueva: origin/main ${base.slice(0, 8)}${foto ? ` (antes ${foto.base_sha.slice(0, 8)})` : ""}`);
  console.log(`  · migraciones a aplicar a la base local: ${sinMigraciones ? `ninguna (--sin-migraciones); quedan aceptadas ${pendientes.join(", ") || "—"}` : pendientes.join(", ") || "ninguna, ya está al día"}`);
  console.log(`  · rama nueva: ${rama}, idéntica a origin/main${yaEnMain ? " (la skill ya está en main: no se copia nada)" : `; se copia SOLO la skill (${DE_LA_SKILL.join(", ")}) desde «${fuente}»`}`);
  if (simular) return true;

  let respaldo = null;
  if (!sinMigraciones && pendientes.length) {
    respaldo = respaldar();
    console.log(`Respaldo completo de la base local: ${respaldo}`);
    for (const v of pendientes) {
      try { aplicarVersion(base, v); console.log(`✓ migración ${v}`); }
      catch (e) {
        console.error(`\n✗ falló la migración ${v}:\n${e.message}\n\nMe detengo. La base quedó con las anteriores aplicadas y esta revertida; NO toqué git ni registré nada. Se decide con Felipe (respaldo: ${respaldo}).`);
        process.exit(1);
      }
    }
  }
  const origen = git("branch", "--show-current");
  git("switch", "-c", rama, base);
  if (!yaEnMain) {
    git("checkout", fuente, "--", ...DE_LA_SKILL);
    git("commit", "-q", "-m", `chore(plataforma): trae la skill /flujo-de-negocio a la rama de corrida\n\nCopia de «${fuente}». La rama de corrida es desechable: la skill se edita en su rama de origen.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`);
  }
  const excluir = join(RAIZ, git("rev-parse", "--git-path", "info/exclude"));
  if (!existsSync(excluir) || !readFileSync(excluir, "utf8").includes(".flujo-de-negocio/")) appendFileSync(excluir, "\n.flujo-de-negocio/\n");
  guardarFoto({
    registrada: new Date().toISOString(), base_sha: base, rama_corrida: rama, fuente: yaEnMain ? "main" : fuente,
    migraciones_aceptadas: sinMigraciones ? pendientes : [], migraciones_aplicadas_ahora: sinMigraciones ? [] : pendientes, respaldo,
    nota: `Actualización ordenada por Felipe desde «${origen}».`,
  });
  console.log(`\nRama ${rama} creada desde origin/main ${base.slice(0, 8)}. Se trabaja aquí; la skill se edita en «${fuente}».\n`);
  return verificar(false);
}

const [modo, ...resto] = process.argv.slice(2);
if (modo === "verificar") process.exit(verificar(resto.includes("--json")) ? 0 : 1);
else if (modo === "aceptar") process.exit(aceptar() ? 0 : 1);
else if (modo === "actualizar") process.exit(actualizar(resto) ? 0 : 1);
else {
  console.error("Uso: espejo.mjs verificar [--json] | aceptar | actualizar [--simular] [--sin-migraciones] [--fuente <rama>]");
  process.exit(2);
}
