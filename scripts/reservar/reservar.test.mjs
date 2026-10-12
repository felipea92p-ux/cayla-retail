// Pruebas de las reservas (ADR-0380) contra un remoto git de verdad (un repo «bare» en una carpeta temporal): la promesa
// es de git —el segundo push de una etiqueta que ya existe se rechaza—, así que se prueba con git, no con un simulacro.
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { despuesDe, reservar, siguienteAdr, siguienteMigracion } from "./reservar.mjs";
import { leerReservas, parsearReservas, revisarReservas } from "./reservas.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "reservar.mjs");
const correr = promisify(execFile);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Un remoto con `main` (ADR 0001 y 0007, una migración) y una rama remota con el ADR 0012. Devuelve `clonar(rama)`. */
function armarRemoto() {
  const raiz = mkdtempSync(join(tmpdir(), "reservas-"));
  const remoto = join(raiz, "remoto.git");
  git(raiz, "init", "--quiet", "--bare", "-b", "main", remoto);
  const semilla = join(raiz, "semilla");
  git(raiz, "clone", "--quiet", remoto, semilla);
  for (const [cwd] of [[semilla]]) {
    git(cwd, "config", "user.name", "Prueba");
    git(cwd, "config", "user.email", "prueba@example.com");
  }
  mkdirSync(join(semilla, "docs", "adr"), { recursive: true });
  mkdirSync(join(semilla, "supabase", "migrations"), { recursive: true });
  writeFileSync(join(semilla, "docs", "adr", "0001-uno.md"), "x");
  writeFileSync(join(semilla, "docs", "adr", "0007-siete.md"), "x");
  writeFileSync(join(semilla, "supabase", "migrations", "20261012150000_algo.sql"), "select 1;");
  git(semilla, "add", "-A");
  git(semilla, "commit", "--quiet", "-m", "semilla");
  git(semilla, "push", "--quiet", "origin", "HEAD:main");
  git(semilla, "checkout", "--quiet", "-b", "claude/otra");
  writeFileSync(join(semilla, "docs", "adr", "0012-de-otra-rama.md"), "x");
  git(semilla, "add", "-A");
  git(semilla, "commit", "--quiet", "-m", "otra");
  git(semilla, "push", "--quiet", "origin", "claude/otra");
  let n = 0;
  const clonar = (rama) => {
    const dir = join(raiz, `clon-${n++}`);
    git(raiz, "clone", "--quiet", remoto, dir);
    git(dir, "config", "user.name", "Prueba");
    git(dir, "config", "user.email", "prueba@example.com");
    git(dir, "checkout", "--quiet", "-b", rama);
    return dir;
  };
  return { raiz, clonar, limpiar: () => rmSync(raiz, { recursive: true, force: true }) };
}

test("siguienteAdr: uno más que el mayor, sin rellenar huecos", () => {
  assert.equal(siguienteAdr(new Set(["0001", "0379", "0012"])), "0380");
  assert.equal(siguienteAdr(new Set()), "0001");
});

test("siguienteMigracion: el próximo múltiplo de 10 min desde ahora, o 10 min después de la mayor si es posterior", () => {
  const ahora = new Date("2026-10-12T15:23:41Z");
  assert.equal(siguienteMigracion([], ahora), "20261012153000");
  assert.equal(siguienteMigracion(["20261012150000"], ahora), "20261012153000");
  assert.equal(siguienteMigracion(["20261012190000"], ahora), "20261012191000");
  assert.equal(despuesDe("20261012235500"), "20261013000500", "cruza el día bien");
});

test("parsearReservas lee la etiqueta y la rama dueña; ignora lo que no es una reserva", () => {
  const texto =
    "reserva/adr-0380\x1frama: claude/cola-de-fusion\nquien: Felipe\n\x1e\n" +
    "reserva/migracion-20261012153000\x1frama: claude/otra\n\x1e\n" +
    "reserva/cualquier-cosa\x1frama: x\n\x1e\n" +
    "reserva/adr-0381\x1fsin rama\n\x1e";
  assert.deepEqual(parsearReservas(texto), [
    { tipo: "adr", numero: "0380", rama: "claude/cola-de-fusion", etiqueta: "reserva/adr-0380" },
    { tipo: "migracion", numero: "20261012153000", rama: "claude/otra", etiqueta: "reserva/migracion-20261012153000" },
    { tipo: "adr", numero: "0381", rama: "", etiqueta: "reserva/adr-0381" },
  ]);
});

test("revisarReservas: de otra rama es error, sin reserva es aviso, mía no dice nada", () => {
  const reservas = [
    { tipo: "adr", numero: "0380", rama: "claude/yo" },
    { tipo: "adr", numero: "0381", rama: "claude/otra" },
    { tipo: "migracion", numero: "0382", rama: "claude/otra" },
  ];
  const r = revisarReservas({ tipo: "adr", nuevos: ["0380", "0381", "0382"], reservas, rama: "claude/yo" });
  assert.equal(r.errores.length, 1);
  assert.match(r.errores[0], /0381.*claude\/otra/);
  assert.equal(r.avisos.length, 1, "0382 está reservado como migración, no como ADR");
  assert.match(r.avisos[0], /0382/);
  assert.deepEqual(revisarReservas({ tipo: "adr", nuevos: ["0381"], reservas, rama: "" }).errores, [], "sin rama (push a main) no juzga");
});

test("reservar: salta lo de main y de las ramas remotas, y deja la rama dueña en la etiqueta", () => {
  const { clonar, limpiar } = armarRemoto();
  try {
    const yo = clonar("claude/yo");
    const ahora = new Date("2026-10-12T15:23:41Z");
    assert.deepEqual(reservar({ tipo: "adr", cwd: yo, ahora }), ["0013"], "0012 vive en una rama remota sin fusionar");
    assert.deepEqual(reservar({ tipo: "adr", cwd: yo, cuantos: 2, ahora }), ["0014", "0015"]);
    assert.deepEqual(reservar({ tipo: "migracion", cwd: yo, ahora }), ["20261012153000"]);
    const otro = clonar("claude/otro");
    assert.deepEqual(reservar({ tipo: "migracion", cwd: otro, ahora }), ["20261012154000"], "ve la reserva del primero");
    const vistas = leerReservas({ cwd: otro });
    assert.deepEqual(
      vistas.map((r) => `${r.numero} ${r.rama}`).sort(),
      ["0013 claude/yo", "0014 claude/yo", "0015 claude/yo", "20261012153000 claude/yo", "20261012154000 claude/otro"],
    );
  } finally {
    limpiar();
  }
});

test("reservar a la vez desde cinco clones: cinco números distintos (el remoto rechaza el repetido)", async () => {
  const { clonar, limpiar } = armarRemoto();
  try {
    const clones = Array.from({ length: 5 }, (_, i) => clonar(`claude/sesion-${i}`));
    const salidas = await Promise.all(clones.map((cwd) => correr("node", [SCRIPT, "adr"], { cwd })));
    const numeros = salidas.map((s) => s.stdout.trim()).sort();
    assert.deepEqual(numeros, ["ADR-0013", "ADR-0014", "ADR-0015", "ADR-0016", "ADR-0017"]);
    const duenos = leerReservas({ cwd: clones[0] }).map((r) => r.rama);
    assert.equal(new Set(duenos).size, 5, "cada reserva tiene su propia rama dueña");
  } finally {
    limpiar();
  }
});

test("reservar se niega desde main y sin red, sin inventar un número", () => {
  const { clonar, limpiar } = armarRemoto();
  try {
    const dir = clonar("claude/x");
    git(dir, "checkout", "--quiet", "main");
    assert.throws(() => reservar({ tipo: "adr", cwd: dir }), /main/);
    git(dir, "checkout", "--quiet", "claude/x");
    git(dir, "remote", "set-url", "origin", "/no/existe.git");
    assert.throws(() => reservar({ tipo: "adr", cwd: dir }), /Sin conexión/);
    assert.equal(git(dir, "tag", "-l", "reserva/*"), "", "no dejó ninguna etiqueta a medias");
  } finally {
    limpiar();
  }
});
