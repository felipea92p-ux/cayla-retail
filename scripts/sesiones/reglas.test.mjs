// El tablero de sesiones (ADR-0697): la parte pura, sin git ni red. Corre con `node --test` (CI, «Tablero de sesiones»).
import assert from "node:assert/strict";
import test from "node:test";
import { armarSesiones, hace, informe, parsearCambios, parsearStatus, parsearWorktrees, zonas } from "./reglas.mjs";

const AHORA = 1_800_000_000;
const HORA = 3600;
const worktree = (nombre, rama, enCommits = [], sinCommit = [], ultimo = AHORA - HORA) => ({ nombre, ruta: `/repo/.claude/worktrees/${nombre}`, rama, enCommits, sinCommit, ultimo });
const cambio = (ruta, nuevo = false) => ({ ruta, nuevo });

test("parsearWorktrees: rama, HEAD suelto y la carpeta que ya no existe", () => {
  const texto = [
    "worktree /repo\nHEAD aaa\nbranch refs/heads/main\n",
    "worktree /repo/.claude/worktrees/uno\nHEAD bbb\nbranch refs/heads/claude/uno\n",
    "worktree /repo/.claude/worktrees/suelta\nHEAD ccc\ndetached\n",
    "worktree /repo/.claude/worktrees/borrada\nHEAD ddd\nbranch refs/heads/claude/borrada\nprunable gitdir file points to non-existent location\n",
  ].join("\n");
  assert.deepEqual(parsearWorktrees(texto), [
    { ruta: "/repo", nombre: "repo", rama: "main", cabeza: "aaa" },
    { ruta: "/repo/.claude/worktrees/uno", nombre: "uno", rama: "claude/uno", cabeza: "bbb" },
    { ruta: "/repo/.claude/worktrees/suelta", nombre: "suelta", rama: null, cabeza: "ccc" },
  ]);
});

test("parsearStatus: nuevos, cambiados, con espacios y el renombre (que trae la ruta vieja detrás)", () => {
  const texto = [" M apps/web/lib/a.ts", "?? docs/adr/0697-tablero.md", "A  scripts/x y.mjs", "R  nueva.ts", "vieja.ts", " D borrado.ts", ""].join("\0");
  assert.deepEqual(parsearStatus(texto), [
    cambio("apps/web/lib/a.ts"),
    cambio("docs/adr/0697-tablero.md", true),
    cambio("scripts/x y.mjs", true),
    cambio("nueva.ts"),
    cambio("borrado.ts"),
  ]);
});

test("parsearCambios: agregado, cambiado y renombrado (cuenta la nueva, como agregada)", () => {
  const texto = ["M", "a.ts", "A", "supabase/migrations/20261123000000_x.sql", "R100", "viejo.md", "docs/adr/0697-x.md", ""].join("\0");
  assert.deepEqual(parsearCambios(texto), [cambio("a.ts"), cambio("supabase/migrations/20261123000000_x.sql", true), cambio("docs/adr/0697-x.md", true)]);
  assert.deepEqual(parsearCambios(""), []);
});

test("zonas: por carpeta hasta 4 niveles, la raíz por archivo, de más a menos", () => {
  const archivos = ["apps/web/components/caja/A.tsx", "apps/web/components/caja/B.tsx", "apps/web/lib/x.ts", "CLAUDE.md", "supabase/migrations/1.sql", "apps/web/components/caja/sub/C.tsx"];
  assert.deepEqual(zonas(archivos), [
    { zona: "apps/web/components/caja", n: 3 },
    { zona: "CLAUDE.md", n: 1 },
    { zona: "apps/web/lib", n: 1 },
    { zona: "supabase/migrations", n: 1 },
  ]);
  assert.equal(zonas(archivos, 1).length, 1);
});

test("hace: minutos, horas y días", () => {
  assert.equal(hace(AHORA - 30, AHORA), "hace 1 min");
  assert.equal(hace(AHORA - 3 * HORA, AHORA), "hace 3 h");
  assert.equal(hace(AHORA - 5 * 24 * HORA, AHORA), "hace 5 d");
  assert.equal(hace(null, AHORA), "sin fecha");
});

test("armarSesiones: una rama con worktree, rama empujada y PR es UNA sola sesión", () => {
  const t = armarSesiones({
    worktrees: [worktree("uno", "claude/uno", [cambio("a.ts")], [cambio("b.ts", true)], AHORA - 2 * HORA)],
    ramas: [{ rama: "claude/uno", ultimo: AHORA - 3 * HORA, cambios: [cambio("a.ts")] }],
    prs: [{ numero: 7, titulo: "Uno", rama: "claude/uno", archivos: ["a.ts", "c.ts"], adrs: [], migraciones: [], funciones: ["registrar_venta"] }],
    ahora: AHORA,
  });
  assert.equal(t.activas.length, 1);
  const s = t.activas[0];
  assert.equal(s.rama, "claude/uno");
  assert.deepEqual(s.worktree.nombre, "uno");
  assert.deepEqual(s.pr, { numero: 7, titulo: "Uno" });
  assert.equal(s.empujada, true);
  assert.deepEqual(s.archivos, ["a.ts", "b.ts", "c.ts"]);
  assert.equal(s.sinCommit, 1);
  assert.equal(s.ultimo, AHORA - 2 * HORA, "lo más reciente de las tres fuentes");
  assert.deepEqual(s.funciones, ["registrar_venta"]);
});

test("armarSesiones: activa en 48 h, quieta si es más vieja, vacía si no tiene nada propio", () => {
  const t = armarSesiones({
    worktrees: [
      worktree("viva", "claude/viva", [], [cambio("a.ts")], AHORA - 47 * HORA),
      worktree("dormida", "claude/dormida", [], [cambio("b.ts")], AHORA - 49 * HORA),
      worktree("limpia", "claude/limpia"),
      worktree("principal", "main"),
    ],
    prs: [{ numero: 9, titulo: "Viejo", rama: "claude/pr-viejo", archivos: ["x.ts"], adrs: [], migraciones: [], funciones: [] }],
    fechas: new Map([["claude/pr-viejo", AHORA - 10 * 24 * HORA]]),
    ahora: AHORA,
  });
  assert.deepEqual(t.activas.map((s) => s.rama), ["claude/viva"]);
  assert.deepEqual(t.quietas.map((s) => s.rama), ["claude/dormida", "claude/pr-viejo"]);
  assert.deepEqual(t.vacias, ["limpia", "principal"]);
});

test("armarSesiones: los números nuevos (ADR, migración) salen de lo agregado, y no cuentan si main ya tiene ese archivo", () => {
  const t = armarSesiones({
    worktrees: [
      worktree("uno", "claude/uno", [cambio("docs/adr/0697-tablero.md", true), cambio("docs/adr/0381-reservas.md")], [cambio("supabase/migrations/20261123100000_x.sql", true)]),
      worktree("atrasada", "claude/atrasada", [cambio("docs/adr/0600-ya-en-main.md", true)]),
    ],
    rutasDeMain: new Set(["docs/adr/0600-ya-en-main.md"]),
    ahora: AHORA,
  });
  const [uno, atrasada] = ["claude/uno", "claude/atrasada"].map((r) => t.activas.find((s) => s.rama === r));
  assert.deepEqual(uno.adrs, ["0697"], "el ADR solo cambiado no es nuevo");
  assert.deepEqual(uno.migraciones, ["20261123100000"]);
  assert.deepEqual(atrasada.adrs, []);
});

test("armarSesiones: las reservas de cada rama y la marca de esta sesión", () => {
  const t = armarSesiones({
    worktrees: [worktree("uno", "claude/uno", [cambio("a.ts")]), worktree("dos", "claude/dos", [cambio("b.ts")])],
    reservas: [
      { tipo: "adr", numero: "0697", rama: "claude/uno" },
      { tipo: "migracion", numero: "20261123100000", rama: "claude/uno" },
      { tipo: "adr", numero: "0698", rama: "claude/otra" },
    ],
    actual: "claude/dos",
    ahora: AHORA,
  });
  const uno = t.activas.find((s) => s.rama === "claude/uno");
  assert.deepEqual(uno.reservas, [{ tipo: "adr", numero: "0697" }, { tipo: "migracion", numero: "20261123100000" }]);
  assert.equal(uno.esta, false);
  assert.equal(t.activas.find((s) => s.rama === "claude/dos").esta, true);
});

test("armarSesiones: una worktree en HEAD suelto se nombra por su carpeta", () => {
  const t = armarSesiones({ worktrees: [worktree("suelta", null, [], [cambio("a.ts")])], ahora: AHORA });
  assert.equal(t.activas[0].rama, "(sin rama) suelta");
});

test("informe: dice dónde vive cada sesión, qué toca, qué reservó y qué fuente no respondió", () => {
  const tablero = armarSesiones({
    worktrees: [worktree("uno", "claude/uno", [cambio("docs/adr/0697-t.md", true), cambio("scripts/sesiones/a.mjs"), cambio("scripts/sesiones/b.mjs")])],
    ramas: [{ rama: "claude/nube", ultimo: AHORA - 5 * HORA, cambios: [cambio("apps/web/lib/x.ts")] }],
    reservas: [
      { tipo: "adr", numero: "0697", rama: "claude/uno" },
      { tipo: "migracion", numero: "20261123100000", rama: "claude/nube" },
    ],
    actual: "claude/uno",
    ahora: AHORA,
  });
  const texto = informe({ ...tablero, faltan: ["prs"] }, AHORA);
  assert.match(texto, /ACTIVAS \(algo en las últimas 48 h\): 2/);
  assert.match(texto, /claude\/uno \(esta sesión\) · hace 1 h · worktree uno/);
  assert.match(texto, /3 archivos · scripts\/sesiones \(2\), docs\/adr \(1\) · ADR 0697\n/, "la reserva que ya usa no se repite");
  assert.match(texto, /reservó sin usar todavía: migración 20261123100000/);
  assert.match(texto, /claude\/nube · hace 5 h · rama empujada \(sin worktree en esta máquina\)/);
  assert.match(texto, /No pude leer: los PR \(gh no respondió\)/);
  assert.doesNotMatch(texto, /QUIETAS/, "sin quietas no hay sección");
});

test("informe: una quieta va en una línea, y una lista larga de números se resume", () => {
  const migraciones = ["20261121152000", "20261121160000", "20261121162000", "20261122213000"].map((v) => cambio(`supabase/migrations/${v}_x.sql`, true));
  const tablero = armarSesiones({
    worktrees: [worktree("larga", "claude/larga", migraciones), worktree("vieja", "claude/vieja", [], [cambio("docs/maquetas/x/a.html")], AHORA - 9 * 24 * HORA)],
    ahora: AHORA,
  });
  const texto = informe({ ...tablero, faltan: [] }, AHORA);
  assert.match(texto, /4 migraciones \(20261121152000 … 20261122213000\)/);
  assert.match(texto, /\n  claude\/vieja · hace 9 d · worktree vieja · 1 archivo \(1 sin commit\) · docs\/maquetas\/x \(1\)\n/);
  assert.doesNotMatch(texto, /No pude leer/);
});
