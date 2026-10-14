// Pruebas de «deriva con lo pegado» (ADR-0402). Sin dependencias: `node --test scripts/migraciones/deriva-pegados.test.mjs`.
// La lógica pura se prueba directo; las tres órdenes corren de verdad con un `gh` y un `docker` falsos al frente del PATH.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aplicarEnOrden, lineasPublicas, ordenar, seleccionar } from "./deriva-pegados.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(RAIZ, "scripts", "migraciones", "deriva-pegados.mjs");
const PEGADO = "## SQL\n- [x] SQL pegado en producción\n- [ ] El SQL se pega después de fusionar\n";
const DESPUES = "## SQL\n- [ ] SQL pegado en producción\n- [x] El SQL se pega después de fusionar\n";
const nueva = (nombre) => ({ filename: `supabase/migrations/${nombre}`, status: "added" });

test("solo cuentan los PR de este repo, con «SQL pegado en producción» marcada y con migraciones que Supabase aplica", () => {
  const r = seleccionar([
    { numero: 30, propio: true, cuerpo: PEGADO, archivos: [nueva("20261013200000_b.sql"), nueva("20261013190000_a.sql"), { filename: "apps/web/x.ts", status: "modified" }] },
    { numero: 10, propio: true, cuerpo: PEGADO, archivos: [nueva("20261005160100_c.sql")] },
    { numero: 11, propio: false, cuerpo: PEGADO, archivos: [nueva("20261005160200_fork.sql")] }, // un fork no pudo pegar nada
    { numero: 12, propio: true, cuerpo: DESPUES, archivos: [nueva("20261005160300_despues.sql")] },
    { numero: 13, propio: true, cuerpo: "sin casilla", archivos: [nueva("20261005160400_nada.sql")] },
    { numero: 14, propio: true, cuerpo: PEGADO, archivos: [{ filename: "apps/web/y.ts", status: "added" }] }, // marcó, sin migraciones
    { numero: 15, propio: true, cuerpo: PEGADO, archivos: [nueva("pegar-en-produccion-algo.sql")] }, // Supabase no lo aplica
  ]);
  assert.deepEqual(r, [
    { numero: 10, nuevas: ["20261005160100_c.sql"] },
    { numero: 30, nuevas: ["20261013190000_a.sql", "20261013200000_b.sql"] },
  ]);
});

test("se aplican todas juntas por versión (como se fueron pegando), y un archivo repetido en dos PR una sola vez: el del PR mayor", () => {
  const { orden, repetidos } = ordenar([
    { numero: 978, nuevas: ["20261012190000_aprobar.sql"] },
    { numero: 1054, nuevas: ["20261012190000_aprobar.sql", "20261013195000_anular.sql"] },
    { numero: 806, nuevas: ["20261005160100_piso.sql", "20261013199000_otro.sql"] },
  ]);
  assert.deepEqual(orden, [
    { pr: 806, archivo: "20261005160100_piso.sql" },
    { pr: 1054, archivo: "20261012190000_aprobar.sql" },
    { pr: 1054, archivo: "20261013195000_anular.sql" },
    { pr: 806, archivo: "20261013199000_otro.sql" },
  ]);
  assert.deepEqual(repetidos, [{ archivo: "20261012190000_aprobar.sql", prs: [978, 1054], usado: 1054 }]);
});

test("un archivo que no se aplica deja a SU PR sin armar (salta lo que le sigue de ese PR) y los demás PR se aplican igual", () => {
  const orden = [
    { pr: 1, archivo: "a1.sql" },
    { pr: 2, archivo: "b1.sql" },
    { pr: 1, archivo: "a2.sql" },
    { pr: 2, archivo: "b2.sql" },
  ];
  const vistos = [];
  const r = aplicarEnOrden(orden, (pr, archivo) => {
    vistos.push(archivo);
    if (archivo === "a1.sql") throw Object.assign(new Error("Command failed"), { stderr: 'ERROR:  relation "retail.x" does not exist\nLINE 1: …' });
  });
  assert.deepEqual(vistos, ["a1.sql", "b1.sql", "b2.sql"]);
  assert.deepEqual(r.aplicados, [{ pr: 2, archivo: "b1.sql" }, { pr: 2, archivo: "b2.sql" }]);
  assert.deepEqual(r.saltados, [{ pr: 1, archivo: "a2.sql" }]);
  assert.deepEqual(r.fallidos, [{ pr: 1, archivo: "a1.sql", motivo: 'ERROR:  relation "retail.x" does not exist' }]);
});

test("lo público nombra PR y archivos, nunca el error (el error no es de producción, pero no tiene por qué ir al aviso)", () => {
  const plan = { prs: [{ numero: 806 }, { numero: 1055 }], orden: [], repetidos: [] };
  const lineas = lineasPublicas(plan, { fallidos: [{ pr: 1055, archivo: "20261013235000_r.sql", motivo: 'ERROR: relation "retail.secreto" does not exist' }] });
  assert.equal(lineas[0], "Se sumó a main el SQL que estos PR abiertos declaran pegado en producción: #806.");
  assert.match(lineas[1], /^⚠ #1055 no se pudo armar sobre el main de hoy \(falló `20261013235000_r\.sql`\)/);
  assert.ok(!lineas.join("\n").includes("secreto"));
  assert.match(lineasPublicas({ prs: [] }, { fallidos: [] })[0], /se comparó con main a secas/);
});

/** Un `gh` y un `docker` falsos. `gh` responde desde `fixture` y anota cada llamada; `docker` anota el SQL y falla si dice FALLA. */
function entorno(fixture) {
  const dir = mkdtempSync(join(tmpdir(), "deriva-pegados-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(dir, "fixture.json"), JSON.stringify(fixture));
  writeFileSync(
    join(bin, "gh"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.LOG_GH, args.join(" ") + "\\n");
const f = JSON.parse(fs.readFileSync(process.env.FIXTURE, "utf8"));
if (f.caido) { process.stderr.write("HTTP 502: Bad Gateway\\n" + "x".repeat(50) + "\\n"); process.exit(1); }
if (args[0] === "pr" && args[1] === "list") { process.stdout.write(JSON.stringify(f.abiertos)); process.exit(0); }
const ruta = args.find((a) => a.startsWith("repos/"));
let m = ruta.match(/pulls\\/(\\d+)\\/files$/);
if (m) { process.stdout.write(JSON.stringify([f.archivos[m[1]] ?? []])); process.exit(0); }
m = ruta.match(/contents\\/supabase\\/migrations\\/(.+)\\?ref=(.+)$/);
if (m) { process.stdout.write(f.contenido[m[2] + ":" + m[1]] ?? ""); process.exit(0); }
process.exit(9);
`,
  );
  writeFileSync(
    join(bin, "docker"),
    `#!/usr/bin/env bash
sql=$(cat)
printf '%s\\n---\\n' "$sql" >> "$LOG_DOCKER"
case "$sql" in *FALLA*) echo 'ERROR:  relation "retail.x" does not exist' >&2; exit 3;; esac
exit 0
`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "docker"), 0o755);
  const env = {
    PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
    FIXTURE: join(dir, "fixture.json"),
    LOG_GH: join(dir, "gh.log"),
    LOG_DOCKER: join(dir, "docker.log"),
    GITHUB_REPOSITORY: "cayla/retail",
  };
  writeFileSync(env.LOG_GH, "");
  writeFileSync(env.LOG_DOCKER, "");
  const carpeta = join(dir, "pegados");
  const correr = (orden) => {
    const r = spawnSync(process.execPath, [SCRIPT, orden, carpeta], { env, encoding: "utf8" });
    return { codigo: r.status, salida: r.stdout, error: r.stderr };
  };
  return { correr, carpeta, gh: () => readFileSync(env.LOG_GH, "utf8"), docker: () => readFileSync(env.LOG_DOCKER, "utf8") };
}

const FIXTURE = {
  abiertos: [
    { number: 1055, isCrossRepository: false, body: `${PEGADO}\nTEXTO-DEL-CUERPO`, headRefOid: "sha1055" },
    { number: 806, isCrossRepository: false, body: PEGADO, headRefOid: "sha806" },
    { number: 900, isCrossRepository: true, body: PEGADO, headRefOid: "shafork" },
    { number: 1056, isCrossRepository: false, body: "- [ ] SQL pegado en producción", headRefOid: "sha1056" },
  ],
  archivos: {
    1055: [nueva("20261013181000_fondos.sql"), nueva("20261013235000_rendicion.sql")],
    806: [nueva("20261005160100_piso.sql")],
    900: [nueva("20261001000000_fork.sql")],
    1056: [nueva("20261013170000_recibir.sql")],
  },
  contenido: {
    "sha1055:20261013181000_fondos.sql": "create function retail.fondos() returns int language sql as 'select 1';",
    "sha1055:20261013235000_rendicion.sql": "select FALLA;",
    "sha806:20261005160100_piso.sql": "create function retail.piso() returns int language sql as 'select 2';",
  },
};

test("reunir: baja las migraciones de los PR que declaran su SQL pegado, de la cabeza que se listó, y nunca mira un fork ni uno sin la casilla", () => {
  const e = entorno(FIXTURE);
  const r = e.correr("reunir");
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /PR abiertos que declaran su SQL pegado: #806, #1055 \(3 migraciones\)\./);
  const plan = JSON.parse(readFileSync(join(e.carpeta, "plan.json"), "utf8"));
  assert.deepEqual(plan.prs.map((p) => [p.numero, p.sha]), [[806, "sha806"], [1055, "sha1055"]]);
  assert.deepEqual(plan.orden.map((o) => o.archivo), ["20261005160100_piso.sql", "20261013181000_fondos.sql", "20261013235000_rendicion.sql"]);
  assert.equal(readFileSync(join(e.carpeta, "806", "20261005160100_piso.sql"), "utf8"), FIXTURE.contenido["sha806:20261005160100_piso.sql"]);
  assert.doesNotMatch(e.gh(), /pulls\/900|pulls\/1056|shafork|sha1056/);
  assert.ok(!r.salida.includes("TEXTO-DEL-CUERPO") && !r.error.includes("TEXTO-DEL-CUERPO"), "el cuerpo del PR no va al registro");
});

test("aplicar: cada migración por separado; la que no se aplica deja a su PR sin armar y no hace fallar el paso", () => {
  const e = entorno(FIXTURE);
  assert.equal(e.correr("reunir").codigo, 0);
  const r = e.correr("aplicar");
  assert.equal(r.codigo, 0, r.error);
  const resultado = JSON.parse(readFileSync(join(e.carpeta, "resultado.json"), "utf8"));
  assert.deepEqual(resultado.aplicados.map((a) => a.archivo), ["20261005160100_piso.sql", "20261013181000_fondos.sql"]);
  assert.deepEqual(resultado.fallidos.map((f) => [f.pr, f.archivo]), [[1055, "20261013235000_rendicion.sql"]]);
  assert.equal(e.docker().split("\n---\n").filter(Boolean).length, 3, "una llamada a psql por archivo: cada uno en su transacción");
  assert.match(r.salida, /::warning::#1055 no se pudo armar sobre el main de hoy: falló 20261013235000_rendicion\.sql\./);
});

test("resumen: 0 si todo armó, 1 si un PR no armó (y lo nombra), 2 si no hay qué leer", () => {
  const e = entorno({ ...FIXTURE, contenido: { ...FIXTURE.contenido, "sha1055:20261013235000_rendicion.sql": "select 1;" } });
  assert.equal(e.correr("reunir").codigo, 0);
  assert.equal(e.correr("aplicar").codigo, 0);
  const bien = e.correr("resumen");
  assert.equal(bien.codigo, 0);
  assert.equal(bien.salida.trim(), "Se sumó a main el SQL que estos PR abiertos declaran pegado en producción: #806, #1055.");

  const m = entorno(FIXTURE);
  m.correr("reunir");
  m.correr("aplicar");
  const mal = m.correr("resumen");
  assert.equal(mal.codigo, 1);
  assert.match(mal.salida, /#806\./);
  assert.match(mal.salida, /⚠ #1055 no se pudo armar/);
  assert.doesNotMatch(mal.salida, /relation/);

  const vacio = entorno(FIXTURE);
  assert.equal(vacio.correr("resumen").codigo, 2);
});

test("GitHub no responde: reunir sale con 2 (no se sabe qué restar) y no deja un plan a medias", () => {
  const e = entorno({ caido: true });
  const r = e.correr("reunir");
  assert.equal(r.codigo, 2);
  assert.match(r.error, /::error::No se pudo leer los PR abiertos: HTTP 502: Bad Gateway$/m);
  assert.ok(!existsSync(join(e.carpeta, "plan.json")));
});

test("ningún PR declara su SQL pegado: plan vacío, nada que aplicar, y el resumen lo dice", () => {
  const e = entorno({ abiertos: [], archivos: {}, contenido: {} });
  assert.equal(e.correr("reunir").codigo, 0);
  assert.equal(e.correr("aplicar").codigo, 0);
  assert.equal(e.docker(), "");
  const r = e.correr("resumen");
  assert.equal(r.codigo, 0);
  assert.match(r.salida, /se comparó con main a secas/);
});
