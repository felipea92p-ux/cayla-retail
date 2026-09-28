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

function archivosDelPr() {
  const salida = execFileSync("git", ["diff", "--name-only", "HEAD^1", "HEAD"], { encoding: "utf8" });
  return salida.split("\n").filter(Boolean);
}

function main() {
  let alcance = "completo";
  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    const archivos = archivosDelPr();
    alcance = clasificar(archivos);
    console.log(`${archivos.length} archivo(s) cambiados contra main → alcance «${alcance}»`);
    if (alcance === "completo") {
      const motivo = archivos.find((a) => !SOLO_DOCUMENTOS.some((r) => r.test(a)) && !WEB.test(a));
      console.log(`  corre todo por: ${motivo}`);
    }
  } else {
    console.log(`evento «${process.env.GITHUB_EVENT_NAME ?? "local"}» → alcance «completo» (main siempre se prueba entero)`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `alcance=${alcance}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
