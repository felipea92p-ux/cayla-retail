// Pruebas de la casilla comprobada: `sql-en-produccion.mjs` (comparar) y `sql-en-produccion.sh` (lo que corre el check, con
// `gh` y `curl` falsos). Sin dependencias: `node --test scripts/migraciones/sql-en-produccion.test.mjs`.
// Lo que vigila: el check solo sale verde si MIRÓ producción y está todo; «no pude mirar» siempre sale rojo y lo dice; y lo
// que imprime (el registro es público) nombra archivos del PR, nunca objetos de la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comprobar, informe, leerHuellasDelPr, noCoinciden } from "./sql-en-produccion.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const mapa = (o) => new Map(Object.entries(o));

const delPr = [
  { archivo: "20261012100000_crea.sql", objetos: { "fn\tcrear_orden(uuid)": "aaaaaaaaaaaa", "columna\tordenes.nota": "bbbbbbbbbbbb" } },
  { archivo: "20261012100100_quita.sql", objetos: { "fn\tvieja()": null } },
  { archivo: "20261012100200_datos.sql", objetos: {} },
];
const produccionAlDia = mapa({ "fn\tcrear_orden(uuid)": "aaaaaaaaaaaa", "columna\tordenes.nota": "bbbbbbbbbbbb", "fn\totra()": "cccccccccccc" });

test("todo lo que dejan las migraciones está en producción: pegadas; la de solo datos, sin huella", () => {
  assert.deepEqual(
    comprobar(delPr, produccionAlDia).map((r) => r.estado),
    ["pegada", "pegada", "sin-huella"],
  );
});

test("falta un objeto, está con otra versión, o sigue lo que la migración borra: falta", () => {
  const sinColumna = mapa({ "fn\tcrear_orden(uuid)": "aaaaaaaaaaaa" });
  assert.deepEqual(comprobar(delPr, sinColumna)[0], { archivo: "20261012100000_crea.sql", estado: "falta", faltan: ["columna\tordenes.nota"] });
  const otraVersion = mapa({ "fn\tcrear_orden(uuid)": "000000000000", "columna\tordenes.nota": "bbbbbbbbbbbb" });
  assert.equal(comprobar(delPr, otraVersion)[0].estado, "falta");
  const sigueLaVieja = new Map([...produccionAlDia, ["fn\tvieja()", "dddddddddddd"]]);
  assert.equal(comprobar(delPr, sigueLaVieja)[1].estado, "falta");
});

test("lo que la deriva ya sabe que difiere (CONOCIDAS) no se exige; el alias de producción se mira con el nombre del repo", () => {
  const conocidas = [{ patron: /^fn\tlegado\(/, motivo: "prueba" }];
  const pr = [{ archivo: "1_x.sql", objetos: { "fn\tlegado()": "eeeeeeeeeeee", "candado\tgastos.igv": "ffffffffffff" } }];
  const alias = new Map([["candado\tgastos.igv1", "candado\tgastos.igv"]]);
  const produccion = mapa({ "candado\tgastos.igv1": "ffffffffffff" });
  assert.equal(comprobar(pr, produccion, { conocidas, alias })[0].estado, "pegada");
});

test("las huellas tienen que cubrir cada migración del PR; las de más (una de main renombrada) no molestan", () => {
  assert.equal(noCoinciden(delPr, ["supabase/migrations/20261012100000_crea.sql", "supabase/migrations/20261012100100_quita.sql"]), null);
  assert.equal(noCoinciden(delPr, ["supabase/migrations/pegar-en-produccion-algo.sql"]), null, "un .sql que Supabase no aplica no tiene huellas");
  assert.match(noCoinciden(delPr, ["supabase/migrations/20261012999999_otra.sql"]), /20261012999999_otra\.sql/);
});

test("el informe público nombra archivos del PR, nunca objetos; con --detalle (privado) sí", () => {
  const sinColumna = mapa({ "fn\tcrear_orden(uuid)": "aaaaaaaaaaaa" });
  const r = comprobar(delPr, sinColumna);
  const publico = informe(r);
  assert.match(publico, /✗ 20261012100000_crea\.sql/);
  assert.match(publico, /✓ 20261012100100_quita\.sql/);
  assert.match(publico, /\? 20261012100200_datos\.sql/);
  assert.doesNotMatch(publico, /ordenes|crear_orden|vieja/, "ningún objeto de la base en lo público");
  assert.match(informe(r, { detalle: true }), /columna ordenes\.nota/);
  assert.match(informe(comprobar(delPr, produccionAlDia)), /se puede fusionar/);
});

test("las huellas del PR mal formadas no se toman por buenas", () => {
  assert.throws(() => leerHuellasDelPr("{}"));
  assert.throws(() => leerHuellasDelPr('{"archivos":[{"archivo":"x.sql"}]}'));
  assert.equal(leerHuellasDelPr(JSON.stringify({ archivos: delPr })).length, 3);
});

// ── El script: códigos de salida ─────────────────────────────────────────────────────────────────────────────────────

const tsv = (m) => [...m].map(([k, h]) => `${k}\t${h}`).join("\n");

function archivos({ pr = { archivos: delPr }, produccion = tsv(produccionAlDia), nuevas = "" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sql-en-produccion-"));
  writeFileSync(join(dir, "huellas-del-pr.json"), typeof pr === "string" ? pr : JSON.stringify(pr));
  writeFileSync(join(dir, "produccion.tsv"), produccion);
  writeFileSync(join(dir, "nuevas.txt"), nuevas);
  return dir;
}

function comparar(dir, ...extra) {
  const r = spawnSync(process.execPath, [join(AQUI, "sql-en-produccion.mjs"), join(dir, "huellas-del-pr.json"), join(dir, "produccion.tsv"), join(dir, "nuevas.txt"), ...extra], { encoding: "utf8" });
  return { codigo: r.status, texto: r.stdout + r.stderr };
}

test("el comparador sale con 0 si está todo, 1 si falta algo y 2 si no pudo comparar", () => {
  assert.equal(comparar(archivos()).codigo, 0);
  assert.equal(comparar(archivos({ produccion: "fn\tcrear_orden(uuid)\taaaaaaaaaaaa" })).codigo, 1);
  const vacia = comparar(archivos({ produccion: "" }));
  assert.equal(vacia.codigo, 2, "una respuesta vacía de producción no es «producción no tiene nada»");
  assert.match(vacia.texto, /No se pudo comprobar/);
  assert.equal(comparar(archivos({ pr: "no es json" })).codigo, 2);
  assert.equal(comparar(archivos({ nuevas: "supabase/migrations/20261012999999_otra.sql\n" })).codigo, 2);
});

// ── sql-en-produccion.sh, con gh y curl falsos ───────────────────────────────────────────────────────────────────────

/**
 * Arma un `gh` y un `curl` falsos y corre el script como el workflow. `corrida` = «id estado» que devuelve la lista de
 * corridas del CI ("" = todavía no hay); `artefacto` = id del artefacto huellas-del-pr ("" = no hay); `codigo` = lo que
 * responde producción; `produccion` = las huellas que responde.
 */
function correrCheck({ corrida = "77 completed", artefacto = "88", codigo = "200", produccion = tsv(produccionAlDia), pr = { archivos: delPr }, sinLlave = false, nuevas = "" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sql-en-produccion-sh-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  mkdirSync(join(dir, "zip"));
  writeFileSync(join(dir, "zip", "huellas-del-pr.json"), JSON.stringify(pr));
  spawnSync("zip", ["-q", "-j", join(dir, "huellas.zip"), join(dir, "zip", "huellas-del-pr.json")]);
  // La celda de producción, como la devuelve PostgREST: un texto JSON.
  writeFileSync(join(dir, "produccion.json"), JSON.stringify(produccion));
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env bash
case "$2" in
  */actions/runs\\?*) printf '%s' ${JSON.stringify(corrida)} ;;
  */actions/runs/*/artifacts) printf '%s' ${JSON.stringify(artefacto)} ;;
  */actions/artifacts/*/zip) cat ${JSON.stringify(join(dir, "huellas.zip"))} ;;
  *) echo "gh falso: no sé $*" >&2; exit 1 ;;
esac
`,
  );
  writeFileSync(
    join(bin, "curl"),
    `#!/usr/bin/env bash
while [ $# -gt 0 ]; do [ "$1" = -o ] && salida="$2"; shift; done
cp ${JSON.stringify(join(dir, "produccion.json"))} "$salida"
printf '%s' ${JSON.stringify(codigo)}
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "curl"), 0o755);
  writeFileSync(join(dir, "nuevas.txt"), nuevas);
  const r = spawnSync("bash", [join(AQUI, "sql-en-produccion.sh")], {
    encoding: "utf8",
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      REPO: "duena/repo",
      SHA: "abc123",
      NUEVAS: join(dir, "nuevas.txt"),
      URL: "https://produccion.example",
      ANON: "llave-publica",
      LLAVE: sinLlave ? "" : "llave-de-la-deriva",
      ESPERA_MAX: "0",
      PAUSA: "0",
    },
  });
  return { codigo: r.status, texto: r.stdout + r.stderr };
}

test("el check: con el CI listo y producción al día, verde", () => {
  const r = correrCheck();
  assert.equal(r.codigo, 0, r.texto);
  assert.match(r.texto, /se puede fusionar/);
});

test("el check: si a producción le falta algo, rojo y nombra solo el archivo", () => {
  const r = correrCheck({ produccion: "fn\tcrear_orden(uuid)\taaaaaaaaaaaa" });
  assert.equal(r.codigo, 1, r.texto);
  assert.match(r.texto, /✗ 20261012100000_crea\.sql/);
  assert.doesNotMatch(r.texto, /ordenes\.nota/);
});

test("el check: lo que no pudo mirar sale rojo diciendo qué, nunca verde", () => {
  const casos = [
    [{ sinLlave: true }, /Falta configurar/],
    [{ corrida: "77 completed", artefacto: "" }, /terminó sin dejar las huellas/],
    [{ corrida: "", artefacto: "" }, /todavía no deja sus huellas/],
    [{ corrida: "77 in_progress", artefacto: "" }, /todavía no deja sus huellas/],
    [{ codigo: "401" }, /No se pudo leer producción \(HTTP 401\)/],
    [{ produccion: "" }, /No se pudo comprobar/],
    [{ nuevas: "supabase/migrations/20261012999999_otra.sql\n" }, /no son las migraciones de este PR/],
  ];
  for (const [entrada, mensaje] of casos) {
    const r = correrCheck(entrada);
    assert.notEqual(r.codigo, 0, `${JSON.stringify(entrada)} salió verde:\n${r.texto}`);
    assert.match(r.texto, mensaje, JSON.stringify(entrada));
  }
});
