// Simula `.github/workflows/deriva-diaria.yml` paso por paso, con la regla de GitHub (un paso sin `if` solo corre si
// ninguno anterior falló) y un `gh` falso que anota los avisos. Corre los scripts de verdad con bash; lo que necesita la
// nube (pnpm install, supabase start, docker) se finge. Sin dependencias:
//   node --test scripts/migraciones/deriva-diaria.test.mjs
// La promesa que vigila: la revisión diaria nunca queda sin aviso. Si hay diferencias, el aviso lo dice; si no se pudo
// comparar (producción no responde, falta la configuración, main no arma, el comparador no puede leer), también.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKFLOW = readFileSync(join(RAIZ, ".github", "workflows", "deriva-diaria.yml"), "utf8");

/** Los pasos del job, leídos con la sangría de este archivo (6 espacios el guion, 8 las claves, 10 env y run). */
function pasos(yml) {
  const lineas = yml.slice(yml.indexOf("\n    steps:\n") + 12).split("\n");
  const r = [];
  let paso = null;
  let bloque = null; // "env" | "with" | "run"
  for (let linea of lineas) {
    const nuevo = linea.match(/^ {6}- (\w[\w-]*):\s*(.*)$/);
    if (nuevo) {
      paso = { env: {} };
      r.push(paso);
      bloque = null;
      linea = `        ${nuevo[1]}: ${nuevo[2]}`;
    }
    if (!paso) continue;
    if (bloque === "run" && (linea.startsWith("          ") || linea.trim() === "")) {
      paso.run += `${linea.slice(10)}\n`;
      continue;
    }
    const clave = linea.match(/^ {8}(\w[\w-]*):\s*(.*)$/);
    if (clave) {
      const [, k, v] = clave;
      bloque = k === "env" || k === "with" ? k : k === "run" && v === "|" ? "run" : null;
      if (k === "run") paso.run = v === "|" ? "" : `${v}\n`;
      else if (k !== "env" && k !== "with") paso[k] = v;
      continue;
    }
    const entrada = linea.match(/^ {10}(\w+):\s*(.*)$/);
    if (entrada && bloque === "env") paso.env[entrada[1]] = entrada[2];
  }
  return r;
}

/** `${{ … }}` con lo que este workflow usa: vars, secrets, github.* y el resultado de cada paso. */
const resolver = (texto, ctx) => texto.replace(/\$\{\{\s*([\w.-]+)\s*\}\}/g, (_, expr) => ctx[expr] ?? "");

/** El `if:` de un paso. Solo las formas que este workflow usa: una nueva hace fallar la prueba en vez de adivinarla. */
function corre(si, { fallo, ctx }) {
  if (si === undefined) return !fallo;
  const expr = si.match(/^\$\{\{\s*(.+?)\s*\}\}$/)?.[1];
  if (expr === "always()") return true;
  if (expr === "failure()") return fallo;
  const m = expr?.match(/^failure\(\) && (steps\.\w+\.outputs\.\w+) != '(\w+)'$/);
  if (m) return fallo && (ctx[m[1]] ?? "") !== m[2];
  throw new Error(`if sin simular: ${si}`);
}

/**
 * Corre el job. `fingir`: nombre del paso (o su `run` si no tiene nombre) → código de salida, para lo que necesita la
 * nube. `archivos`: lo que ya está en RUNNER_TEMP (las huellas que dejaron los pasos fingidos).
 */
function simular({ vars = {}, secrets = {}, fingir = {}, archivos = {}, abierto = "" }) {
  const dir = mkdtempSync(join(tmpdir(), "deriva-diaria-"));
  const temp = join(dir, "runner");
  const bin = join(dir, "bin");
  mkdirSync(temp);
  mkdirSync(bin);
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  writeFileSync(
    join(bin, "gh"),
    [
      "#!/usr/bin/env bash",
      'echo "gh $*" >> "$GH_LOG"',
      'if [ "$1 $2" = "issue list" ]; then printf "%s" "$FAKE_ABIERTO"; exit 0; fi',
      'while [ $# -gt 0 ]; do if [ "$1" = "--body-file" ]; then cat "$2" >> "$GH_LOG"; fi; shift; done',
    ].join("\n"),
  );
  chmodSync(join(bin, "gh"), 0o755);
  for (const [nombre, contenido] of Object.entries(archivos)) writeFileSync(join(temp, nombre), contenido);

  const ctx = { "github.token": "token-falso", "github.server_url": "https://github.com", "github.repository": "cayla/retail", "github.run_id": "7" };
  for (const [k, v] of Object.entries(vars)) ctx[`vars.${k}`] = v;
  for (const [k, v] of Object.entries(secrets)) ctx[`secrets.${k}`] = v;
  let fallo = false;
  const resultado = [];
  for (const paso of pasos(WORKFLOW)) {
    const nombre = paso.name ?? paso.uses ?? paso.run?.trim();
    let outcome;
    if (!corre(paso.if, { fallo, ctx })) outcome = "skipped";
    else if (paso.uses) outcome = "success";
    else if (nombre in fingir) outcome = fingir[nombre] === 0 ? "success" : "failure";
    else {
      const salida = join(dir, `salida-${resultado.length}`);
      writeFileSync(salida, "");
      const script = join(dir, `paso-${resultado.length}.sh`);
      writeFileSync(script, paso.run);
      const env = { PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: dir, RUNNER_TEMP: temp, GITHUB_OUTPUT: salida, GH_LOG: log, FAKE_ABIERTO: abierto };
      for (const [k, v] of Object.entries(paso.env)) env[k] = resolver(v, ctx);
      // Como GitHub: bash -e -o pipefail.
      const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", script], { cwd: RAIZ, env, encoding: "utf8" });
      outcome = r.status === 0 ? "success" : "failure";
      for (const l of readFileSync(salida, "utf8").split("\n")) {
        const m = l.match(/^(\w+)=(.*)$/);
        if (m && paso.id) ctx[`steps.${paso.id}.outputs.${m[1]}`] = m[2];
      }
    }
    if (paso.id) ctx[`steps.${paso.id}.outcome`] = outcome;
    if (outcome === "failure") fallo = true;
    resultado.push({ nombre, outcome });
  }
  return { rojo: fallo, pasos: resultado, gh: readFileSync(log, "utf8") };
}

const avisos = (gh) => gh.split("\n").filter((l) => /^gh issue (create|comment)/.test(l));
const configurado = { vars: { SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_ANON_KEY: "anon-falsa" }, secrets: { DERIVA_LLAVE: "llave-falsa" } };
const nube = { "pnpm install --frozen-lockfile": 0, "Main, como el CI": 0, "Huellas de main": 0 };
const MAIN = "fn\tf()\taaaaaaaaaaaa\nfn\tg()\tbbbbbbbbbbbb\n";

test("el archivo se lee: los pasos que la simulación necesita están, con su id", () => {
  const ids = pasos(WORKFLOW).map((p) => p.id).filter(Boolean);
  for (const id of ["produccion", "main", "huellas_main", "comparar"]) assert.ok(ids.includes(id), id);
  assert.ok(existsSync(join(RAIZ, "scripts", "migraciones", "deriva.mjs")));
});

test("producción no responde: la corrida sale roja Y el aviso dice que hoy no se pudo comparar", () => {
  const r = simular(configurado);
  assert.equal(r.rojo, true);
  assert.equal(r.pasos.find((p) => p.nombre === "Huellas de producción").outcome, "failure");
  assert.equal(r.pasos.find((p) => p.nombre === "Comparar y avisar").outcome, "skipped");
  assert.deepEqual(avisos(r.gh).map((l) => l.split(" --")[0]), ["gh issue create"]);
  assert.match(r.gh, /NO se pudo comparar producción con main \(falló «Huellas de producción/);
  assert.match(r.gh, /no quiere decir que estén iguales/);
  assert.ok(!r.gh.includes("llave-falsa") && !r.gh.includes("anon-falsa"), "el aviso no publica la configuración");
});

test("falta la configuración: el aviso lo dice, y con un aviso abierto lo comenta en vez de abrir otro", () => {
  const r = simular({ abierto: "42" });
  assert.equal(r.rojo, true);
  assert.deepEqual(avisos(r.gh).map((l) => l.split(" --")[0]), ["gh issue comment 42"]);
  assert.match(r.gh, /falló «Huellas de producción/);
});

test("main no arma: el aviso nombra ese paso", () => {
  const r = simular({ ...configurado, fingir: { "Huellas de producción": 0, ...nube, "Main, como el CI": 1 } });
  assert.equal(r.rojo, true);
  assert.match(r.gh, /falló «Main, como el CI/);
});

test("el comparador no puede leer lo que devolvió producción: aviso de «no se pudo comparar», no de «hay diferencias»", () => {
  const r = simular({ ...configurado, fingir: { "Huellas de producción": 0, ...nube }, archivos: { "main.tsv": MAIN, "produccion.tsv": "null\n" } });
  assert.equal(r.rojo, true);
  assert.equal(avisos(r.gh).length, 1);
  assert.match(r.gh, /falló «Comparar/);
  assert.doesNotMatch(r.gh, /no corren lo mismo/);
});

test("hay diferencias: UN aviso que lo dice (sin nombres), y no se suma el de «no se pudo comparar»", () => {
  const r = simular({ ...configurado, fingir: { "Huellas de producción": 0, ...nube }, archivos: { "main.tsv": MAIN, "produccion.tsv": "fn\tf()\taaaaaaaaaaaa\nfn\tg()\tcccccccccccc\n" } });
  assert.equal(r.rojo, true);
  assert.equal(r.pasos.find((p) => p.nombre === "Avisar que hoy no se pudo comparar").outcome, "skipped");
  assert.deepEqual(avisos(r.gh).map((l) => l.split(" --")[0]), ["gh issue create"]);
  assert.match(r.gh, /Producción y main no corren lo mismo/);
  assert.doesNotMatch(r.gh, /NO se pudo comparar|g\(\)/);
});

test("iguales: verde, y cierra el aviso abierto", () => {
  const r = simular({ ...configurado, abierto: "42", fingir: { "Huellas de producción": 0, ...nube }, archivos: { "main.tsv": MAIN, "produccion.tsv": MAIN } });
  assert.equal(r.rojo, false);
  assert.match(r.gh, /^gh issue close 42 --comment .*✓ Producción corre lo mismo que main/m);
  assert.equal(avisos(r.gh).length, 0);
});
