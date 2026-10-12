#!/usr/bin/env node
/**
 * Qué toca el PR — decide cuánto del job «Pruebas de RPC contra Postgres» hace falta correr (ADR-0259).
 *
 * EL PROBLEMA. El job tarda ~6 min (1 min 30 s en levantar Postgres, ~4 min 50 s en las ~110 pruebas) y corría entero
 * en cada push de cada PR, aunque el PR solo cambiara una pantalla o un documento. Con seis personas fusionando a `main`
 * a la vez, esa espera se repetía cada vez que un PR tenía que ponerse al día.
 *
 * QUÉ PROMETE. Mira los archivos que el PR cambia contra el `main` de hoy (en `pull_request` el checkout es el merge
 * del PR sobre `main`: `HEAD^1` es `main`) y escribe `alcance=<valor>` en $GITHUB_OUTPUT:
 *   · `nada`     — solo documentos (`docs/`, cualquier `.md`, `.claude/`, `.agents/`, `graphify-out/`): la base y la web
 *                  quedan idénticas a las de `main`, que ya pasó el job entero. El job no corre.
 *   · `web`      — además, solo `apps/web/`: la base es la de `main`. Corren solo las pruebas que leen la web
 *                  (`scripts/ci/pruebas-web.mjs`), sobre un Postgres igual al de siempre.
 *   · `completo` — cualquier otro archivo (migraciones, scripts, paquetes, package.json, el propio CI…), un push a
 *                  `main`, o cualquier duda: corre todo.
 * Ante la duda, siempre `completo`: si este script se equivoca, se equivoca hacia correr de más, nunca hacia saltarse
 * una prueba. Si falla del todo, el job de Postgres lo toma como `completo` (ver `ci.yml`).
 *
 * EL PUSH A `main` (ADR-0345). Antes corría todo, siempre: ~1.860 de los ~6.770 minutos de Actions del 1 al 5 de octubre
 * de 2026, a $0,008 el minuto. Pero el ruleset `main-protegida` exige `strict_required_status_checks_policy`: un PR solo
 * se fusiona si su rama estaba al día con `main`, así que el CI del PR corrió sobre el MISMO árbol que ahora queda en
 * `main`. Repetirlo no agrega señal. Un push que llega de un PR (asunto `… (#123)` o `Merge pull request #123 …`) se
 * mide con el mismo diff contra su padre, y:
 *   · el PR era `completo` o `nada` → nada que repetir: ni `verificar` ni Postgres.
 *   · el PR era `web`              → `verificar` ya corrió entero en el PR, pero Postgres corrió solo 3 pruebas: aquí
 *                                    corre ENTERO. Es la red de «SE ROMPE SI» del ADR-0259 (una prueba que lee la web por
 *                                    un camino que el detector no ve).
 *   · el push NO viene de un PR (commit directo) → `completo` y `verificar`: nadie lo revisó antes.
 * Escribe además `verificar=si|no` (si el job «Tipos, lint y pruebas» hace falta). Ante la duda, `si`.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SOLO_DOCUMENTOS = [/^docs\//, /\.md$/, /^\.claude\//, /^\.agents\//, /^graphify-out\//];
const WEB = /^apps\/web\//;

/** `archivos` = rutas relativas a la raíz del repo, como las da `git diff --name-only`. */
export function clasificar(archivos) {
  let alcance = "nada";
  for (const archivo of archivos) {
    if (SOLO_DOCUMENTOS.some((r) => r.test(archivo))) continue;
    if (WEB.test(archivo)) {
      alcance = "web";
      continue;
    }
    return "completo";
  }
  return alcance;
}

/**
 * ¿El commit que llegó a `main` salió de un PR? GitHub escribe el asunto así según cómo se fusione: «título (#123)»
 * (squash) o «Merge pull request #123 from …» (merge). Un commit directo no lo lleva.
 */
export function vieneDeUnPr(asunto) {
  return /\(#\d+\)\s*$/.test(asunto) || /^Merge pull request #\d+ /.test(asunto);
}

/**
 * Qué corre en un push a `main`. `archivos` = lo que ese commit cambia contra su padre (`git diff HEAD^1 HEAD`).
 * Devuelve `{ alcance, verificar, motivo }`; `alcance` usa los mismos valores que en un PR (`nada` = Postgres no corre).
 */
export function clasificarPush(asunto, archivos) {
  if (!vieneDeUnPr(asunto)) {
    return { alcance: "completo", verificar: "si", motivo: "commit directo a main (sin PR): nadie lo verificó antes" };
  }
  const delPr = clasificar(archivos);
  if (delPr === "web") {
    return {
      alcance: "completo",
      verificar: "no",
      motivo: "el PR solo corrió las pruebas que leen la web: aquí corre la base entera (red del ADR-0259); tipos, lint y pruebas ya corrieron en el PR sobre este mismo árbol",
    };
  }
  return {
    alcance: "nada",
    verificar: "no",
    motivo: `el PR (${delPr}) ya corrió todo sobre este mismo árbol: el ruleset exige la rama al día (strict), no hay nada que repetir`,
  };
}

function archivosDelPr() {
  const salida = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD"], { encoding: "utf8" });
  return salida.split("\n").filter(Boolean);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  let alcance = "completo";
  let verificar = "si";
  let ultimoMotivo = "";
  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    const archivos = archivosDelPr();
    alcance = clasificar(archivos);
    console.log(`${archivos.length} archivo(s) cambiados contra main → alcance «${alcance}»`);
    if (alcance === "completo") {
      const motivo = archivos.find((a) => !SOLO_DOCUMENTOS.some((r) => r.test(a)) && !WEB.test(a));
      console.log(`  corre todo por: ${motivo}`);
    }
  } else if (process.env.GITHUB_EVENT_NAME === "push") {
    // Si algo falla al leer git (clon corto, sin padre), se queda en `completo` + `si`: nunca se salta por no saber.
    try {
      const asunto = git("log", "-1", "--format=%s").trim();
      const archivos = git("diff", "--name-only", "HEAD^1", "HEAD").split("\n").filter(Boolean);
      ({ alcance, verificar, motivo: ultimoMotivo } = clasificarPush(asunto, archivos));
      console.log(`push a main «${asunto}» (${archivos.length} archivo(s)) → alcance «${alcance}», verificar «${verificar}»`);
      console.log(`  ${ultimoMotivo}`);
    } catch (e) {
      console.log(`push a main: no se pudo leer git (${e.message}) → alcance «completo», verificar «si»`);
    }
  } else {
    console.log(`evento «${process.env.GITHUB_EVENT_NAME ?? "local"}» → alcance «completo»`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `alcance=${alcance}\nverificar=${verificar}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
