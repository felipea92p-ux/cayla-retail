// Pruebas del aviso de SQL huérfano: `sql-huerfano.mjs` (decidir, con un `gh` falso en JS), el script de punta a punta
// (con un `gh` falso en el PATH, para los códigos de salida) y lo que el workflow promete sobre su seguridad. Sin
// dependencias: `node --test scripts/migraciones/sql-huerfano.test.mjs`.
// Lo que vigila: el caso de #978 abre su aviso; lo que ya está en main, lo que no marcó «pegado» o lo que viene de un fork
// no; un aviso por PR; el aviso se cierra solo cuando sus archivos llegan a main; lo público nombra archivos, nunca objetos
// de la base; y «no pude mirar» nunca sale verde.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { archivosDelAviso, aviso, correr, huerfanas, prDelAviso, TITULO } from "./sql-huerfano.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..", "..");
const REPO = "cayla/retail";

const MIG_978 = "supabase/migrations/20261012200000_nota_credito_declara_solo_lo_devuelto.sql";
const PEGADO = "## SQL para producción\n\n- [x] **SQL pegado en producción.** Cada migración nueva…\n- [ ] **El SQL se pega después de fusionar**, …";
const DESPUES = "- [ ] **SQL pegado en producción.** …\n- [x] **El SQL se pega después de fusionar**, porque …";
// El parche trae el texto de la función: lo público nunca tiene que repetirlo.
const archivos978 = [
  { filename: "docs/adr/0382-nota-de-credito-declara-solo-lo-devuelto.md", status: "added" },
  { filename: "scripts/pruebas/aprobar_devolucion_caja.mjs", status: "modified" },
  { filename: MIG_978, status: "added", patch: "@@ -0,0 +1 @@\n+create or replace function retail.aprobar_devolucion(p_id uuid) …" },
];

/** Un PR como lo da `gh pr list --json number,state,mergedAt,isCrossRepository,body`. */
const enLista = (numero, cuerpo, otros = {}) => ({ number: numero, state: "CLOSED", mergedAt: null, isCrossRepository: false, body: cuerpo, ...otros });
/** Un aviso como lo da `gh issue list --json number,title,state,body`. */
const issue = (numero, pr, archivos, state = "OPEN") => ({ number: numero, state, ...(({ titulo, cuerpo }) => ({ title: titulo, body: cuerpo }))(aviso(pr, archivos)) });

/** `gh` falso: responde lo de GitHub y anota cada llamada. `falla(args)` = lanzar como un HTTP 502. */
function falsoGh({ issues = [], cerrados = [], rest = {}, archivos = {}, falla = () => false } = {}) {
  const llamadas = [];
  let siguiente = 700;
  const gh = (args, entrada) => {
    llamadas.push({ args, entrada });
    if (falla(args)) throw new Error("gh: HTTP 502");
    const [a, b] = args;
    if (a === "issue" && b === "list") return JSON.stringify(issues);
    if (a === "pr" && b === "list") return JSON.stringify(cerrados);
    if (a === "api") {
      const [, numero, files] = args[1].match(/pulls\/(\d+)(\/files)?$/);
      return JSON.stringify(files ? [archivos[numero] ?? []] : rest[numero]);
    }
    if (a === "issue" && b === "create") return `https://github.com/${REPO}/issues/${siguiente++}\n`;
    return "";
  };
  const escrituras = () => llamadas.filter(({ args: [a, b] }) => !(b === "list" || a === "api"));
  return { gh, llamadas, escrituras };
}

const soloMain = (...rutas) => (ruta) => rutas.includes(ruta);
const nadaEnMain = () => false;

test("el caso de #978: cerrado sin fusionar, «SQL pegado» marcada y una migración que main no tiene → aviso y comentario en el PR", () => {
  const f = falsoGh({ cerrados: [enLista(978, PEGADO)], archivos: { 978: archivos978 } });
  const hechos = correr({ gh: f.gh, repo: REPO, enMain: nadaEnMain });
  const [crear, comentar, ...resto] = f.escrituras();
  assert.equal(resto.length, 0);
  assert.deepEqual(crear.args.slice(0, 2), ["issue", "create"]);
  assert.equal(crear.args[crear.args.indexOf("--title") + 1], `${TITULO}978`);
  assert.match(crear.entrada, /`supabase\/migrations\/20261012200000_nota_credito_declara_solo_lo_devuelto\.sql`/);
  assert.match(crear.entrada, /reabre #978/);
  assert.deepEqual(comentar.args.slice(0, 3), ["pr", "comment", "978"]);
  assert.match(comentar.entrada, /Lo sigue #700/);
  assert.deepEqual(hechos, ["abrí #700 por `20261012200000_nota_credito_declara_solo_lo_devuelto.sql`"]);
});

test("sus migraciones ya están en main (las llevó otro PR, como pasó con #788): no avisa", () => {
  const f = falsoGh({ cerrados: [enLista(788, PEGADO)], archivos: { 788: archivos978 } });
  assert.deepEqual(correr({ gh: f.gh, repo: REPO, enMain: soloMain(MIG_978) }), []);
  assert.deepEqual(f.escrituras(), []);
});

test("solo nombra lo que falta: de dos migraciones, la que ya llegó a main no va en el aviso", () => {
  const otra = "supabase/migrations/20261012200100_otra.sql";
  const archivos = [...archivos978, { filename: otra, status: "added" }];
  assert.deepEqual(huerfanas({ archivos, cuerpo: PEGADO, enMain: soloMain(MIG_978) }), [otra]);
});

test("no avisa si no marcó «pegado», si no trae migraciones, ni si el PR está fusionado, abierto o viene de un fork", () => {
  assert.deepEqual(huerfanas({ archivos: archivos978, cuerpo: DESPUES, enMain: nadaEnMain }), [], "«se pega después» no se pegó");
  assert.deepEqual(huerfanas({ archivos: archivos978, cuerpo: "Sin casillas", enMain: nadaEnMain }), []);
  assert.deepEqual(huerfanas({ archivos: archivos978.slice(0, 2), cuerpo: PEGADO, enMain: nadaEnMain }), [], "sin migración no hay nada en producción");
  const f = falsoGh({
    cerrados: [enLista(1, PEGADO, { mergedAt: "2026-10-12T00:00:00Z", state: "MERGED" }), enLista(2, PEGADO, { isCrossRepository: true }), enLista(3, DESPUES)],
    archivos: { 1: archivos978, 2: archivos978, 3: archivos978 },
  });
  assert.deepEqual(correr({ gh: f.gh, repo: REPO, enMain: nadaEnMain }), []);
  assert.ok(!f.llamadas.some(({ args }) => args[0] === "api"), "ni siquiera baja los archivos: la casilla y el estado bastan");
});

test("un aviso por PR: si ya tiene uno, abierto o cerrado a mano, no abre otro ni vuelve a comentar", () => {
  for (const estado of ["OPEN", "CLOSED"]) {
    const f = falsoGh({ issues: [issue(55, 978, [MIG_978], estado)], cerrados: [enLista(978, PEGADO)], archivos: { 978: archivos978 } });
    assert.deepEqual(correr({ gh: f.gh, repo: REPO, enMain: nadaEnMain }), [], estado);
    assert.deepEqual(f.escrituras(), [], estado);
  }
});

test("el aviso se cierra solo cuando TODOS sus archivos llegan a main; con uno pendiente, o sin archivos legibles, sigue abierto", () => {
  const otra = "supabase/migrations/20261012200100_otra.sql";
  const abiertos = [issue(55, 978, [MIG_978]), issue(56, 979, [MIG_978, otra]), { number: 57, state: "OPEN", title: `${TITULO}980`, body: "Editado a mano, sin lista." }];
  const f = falsoGh({ issues: abiertos });
  const hechos = correr({ gh: f.gh, repo: REPO, enMain: soloMain(MIG_978) });
  assert.deepEqual(hechos, ["cerré el aviso #55: los archivos de #978 ya están en main"]);
  const [cerrar] = f.escrituras();
  assert.deepEqual(cerrar.args.slice(0, 3), ["issue", "close", "55"]);
  assert.match(cerrar.args.at(-1), /ya está en `main`/);
  // Ya cerrado, no se vuelve a abrir aunque el PR siga en la lista de cerrados.
  const g = falsoGh({ issues: [issue(55, 978, [MIG_978], "CLOSED")], cerrados: [enLista(978, PEGADO)], archivos: { 978: archivos978 } });
  assert.deepEqual(correr({ gh: g.gh, repo: REPO, enMain: soloMain(MIG_978) }), []);
});

test("el PR recién cerrado se pide directo (--pr): el buscador de GitHub todavía no lo ve cerrado", () => {
  const rest = { 978: { number: 978, state: "closed", merged: false, merged_at: null, body: PEGADO, head: { repo: { full_name: REPO } } } };
  const f = falsoGh({ cerrados: [], rest, archivos: { 978: archivos978 } });
  assert.equal(correr({ gh: f.gh, repo: REPO, pr: 978, enMain: nadaEnMain }).length, 1);
  // Fusionado, abierto o de un fork (o un fork que ya no existe: `head.repo` nulo): nada.
  for (const otro of [{ merged: true }, { state: "open" }, { head: { repo: { full_name: "otra/cuenta" } } }, { head: { repo: null } }]) {
    const g = falsoGh({ rest: { 978: { ...rest[978], ...otro } }, archivos: { 978: archivos978 } });
    assert.deepEqual(correr({ gh: g.gh, repo: REPO, pr: 978, enMain: nadaEnMain }), [], JSON.stringify(otro));
  }
});

test("lo público nombra el PR y sus archivos, nunca un objeto de la base ni el contenido de la migración", () => {
  const f = falsoGh({ issues: [issue(54, 977, ["supabase/migrations/20261012100000_x.sql"])], cerrados: [enLista(978, PEGADO)], archivos: { 978: archivos978 } });
  correr({ gh: f.gh, repo: REPO, enMain: soloMain("supabase/migrations/20261012100000_x.sql") });
  const publicado = f.escrituras().map(({ args, entrada }) => [...args, entrada ?? ""].join(" ")).join("\n");
  assert.ok(publicado.length > 0);
  assert.doesNotMatch(publicado, /aprobar_devolucion|create or replace|retail\./);
});

test("el aviso se lee de vuelta: su PR (por la marca o el título) y sus archivos; una ruta rara no se toma", () => {
  const { titulo, cuerpo } = aviso(978, [MIG_978]);
  assert.equal(prDelAviso({ title: "Otro título", body: cuerpo }), 978, "la marca sobrevive a que cambien el título");
  assert.equal(prDelAviso({ title: titulo, body: "sin marca" }), 978);
  assert.equal(prDelAviso({ title: "Producción ≠ main (deriva diaria)", body: "PR #978" }), null, "otro aviso no es de este");
  assert.deepEqual(archivosDelAviso(cuerpo), [MIG_978]);
  const raro = "- `supabase/migrations/../../etc/x.sql`\n- `supabase/migrations/sub/x.sql`\n- `apps/web/x.sql`\n  - `supabase/migrations/1_x.sql`";
  assert.deepEqual(archivosDelAviso(raro), []);
});

test("--simular dice lo que haría y no escribe nada en GitHub", () => {
  const llegada = "supabase/migrations/20261012100000_x.sql";
  const f = falsoGh({ issues: [issue(55, 977, [llegada])], cerrados: [enLista(978, PEGADO)], archivos: { 978: archivos978 } });
  const hechos = correr({ gh: f.gh, repo: REPO, enMain: soloMain(llegada), simular: true });
  assert.deepEqual(f.escrituras(), []);
  assert.deepEqual(hechos, [
    "cerraría el aviso #55: los archivos de #977 ya están en main",
    "abriría «SQL en producción que main no tiene: PR #978» por `20261012200000_nota_credito_declara_solo_lo_devuelto.sql`",
  ]);
});

// ── El script: códigos de salida, con un `gh` falso en el PATH ──────────────────────────────────────────────────────────

/** Corre el script con un `gh` falso que sirve `respuestas` (o sale con 1 si `falla`) y una raíz de main de juguete. */
function script({ respuestas = {}, falla = false, args = [], conMigraciones = true, repo = REPO } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sql-huerfano-"));
  const bin = join(dir, "bin");
  const raiz = join(dir, "main");
  mkdirSync(bin);
  if (conMigraciones) mkdirSync(join(raiz, "supabase", "migrations"), { recursive: true });
  const log = join(dir, "gh.log");
  writeFileSync(log, "");
  writeFileSync(join(dir, "respuestas.json"), JSON.stringify(respuestas));
  writeFileSync(
    join(bin, "gh"),
    [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      "const a = process.argv.slice(2);",
      'fs.appendFileSync(process.env.GH_LOG, a.join(" ") + "\\n");',
      `if (${falla}) { process.stderr.write("HTTP 502: Bad Gateway\\n"); process.exit(1); }`,
      'const r = JSON.parse(fs.readFileSync(process.env.GH_RESPUESTAS, "utf8"));',
      'const clave = a[0] === "api" ? a[1] : a.slice(0, 2).join(" ");',
      'process.stdout.write(r[clave] ?? "");',
    ].join("\n"),
  );
  chmodSync(join(bin, "gh"), 0o755);
  const env = { PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, HOME: dir, GH_LOG: log, GH_RESPUESTAS: join(dir, "respuestas.json"), SQL_HUERFANO_RAIZ: raiz, GITHUB_REPOSITORY: repo };
  const r = spawnSync(process.execPath, [join(AQUI, "sql-huerfano.mjs"), ...args], { env, encoding: "utf8" });
  return { codigo: r.status, salida: r.stdout, error: r.stderr, gh: readFileSync(log, "utf8") };
}

const respuestas978 = {
  "issue list": "[]",
  "pr list": JSON.stringify([enLista(978, PEGADO)]),
  [`repos/${REPO}/pulls/978/files`]: JSON.stringify([archivos978]),
  "issue create": `https://github.com/${REPO}/issues/701\n`,
};

test("de punta a punta: abre el aviso, comenta el PR y sale con 0", () => {
  const r = script({ respuestas: respuestas978 });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.gh, /^issue create --repo cayla\/retail --title SQL en producción que main no tiene: PR #978 --body-file -$/m);
  assert.match(r.gh, /^pr comment 978 --repo cayla\/retail --body-file -$/m);
  assert.match(r.salida, /abrí #701/);
});

test("sin nada que avisar sale con 0 y lo dice", () => {
  const r = script({ respuestas: { "issue list": "[]", "pr list": "[]" } });
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Ningún PR cerrado sin fusionar/);
});

test("«no pude mirar» nunca sale verde: GitHub caído, sin repo, sin las migraciones de main o un --pr que no es número", () => {
  const casos = [
    [{ falla: true }, /HTTP 502/],
    [{ repo: "" }, /GITHUB_REPOSITORY/],
    [{ conMigraciones: false }, /supabase\/migrations de main/],
    [{ args: ["--pr", "978; rm -rf /"] }, /--pr tiene que ser un número/],
  ];
  for (const [opciones, motivo] of casos) {
    const r = script({ respuestas: respuestas978, ...opciones });
    assert.equal(r.codigo, 1, JSON.stringify(opciones));
    assert.match(r.error, motivo);
    assert.doesNotMatch(r.gh, /issue create|pr comment|issue close/, "no escribió nada a medias");
  }
});

// ── El workflow: lo que promete sobre su seguridad ──────────────────────────────────────────────────────────────────────

test("el workflow corre con main (nunca el código del PR), salta forks y fusionados, y no interpola nada que escriba el PR", () => {
  const yml = readFileSync(join(RAIZ, ".github", "workflows", "sql-huerfano.yml"), "utf8");
  assert.match(yml, /pull_request_target:\n\s+types: \[closed\]/);
  assert.match(yml, /push:\n\s+branches: \[main\]\n\s+paths: \["supabase\/migrations\/\*\*"\]/);
  assert.match(yml, /schedule:/);
  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /uses: actions\/checkout@v4\n\s+with:\n\s+ref: main\n/, "el checkout es main");
  assert.doesNotMatch(yml, /head\.sha|head_ref|github\.head_ref/, "nunca el código del PR");
  assert.match(yml, /github\.event\.pull_request\.merged == false && github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.doesNotMatch(yml, /pull_request\.(body|title)/, "el cuerpo y el título los lee el script, no el shell");
  assert.match(yml, /concurrency:\n\s+group: sql-huerfano\n\s+cancel-in-progress: false/);
  assert.match(yml, /run: node scripts\/migraciones\/sql-huerfano\.mjs \$\{PR:\+--pr "\$PR"\}/);
});
