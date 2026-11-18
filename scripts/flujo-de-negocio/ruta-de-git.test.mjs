/**
 * `rutaDeGit`: la ruta de `info/exclude` que usa `espejo.mjs actualizar` existe, se corra desde la carpeta principal o desde un
 * worktree. Pura salvo el último caso, que le pregunta a git del propio repo (en el CI es un checkout normal; en una sesión de
 * Claude Code, casi siempre un worktree: entre los dos se cubren las dos respuestas de git).
 *
 * USO   node --test scripts/flujo-de-negocio/ruta-de-git.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rutaDeGit } from "./ruta-de-git.mjs";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

test("carpeta principal: la relativa se ancla en la raíz", () => {
  assert.equal(rutaDeGit("/repo", ".git/info/exclude"), "/repo/.git/info/exclude");
});

test("worktree: la absoluta queda tal cual", () => {
  const absoluta = "/Users/x/cayla-retail/.git/info/exclude";
  assert.equal(rutaDeGit("/Users/x/cayla-retail/.claude/worktrees/w", absoluta), absoluta);
});

test("control: el `join` de antes rompía la absoluta (el detector no está ciego)", () => {
  const absoluta = "/Users/x/cayla-retail/.git/info/exclude";
  const raiz = "/Users/x/cayla-retail/.claude/worktrees/w";
  assert.notEqual(join(raiz, absoluta), absoluta);
  assert.equal(rutaDeGit(raiz, absoluta), absoluta);
});

test("el salto de línea final de git no ensucia la ruta", () => {
  assert.equal(rutaDeGit("/repo", ".git/info/exclude\n"), "/repo/.git/info/exclude");
});

test("en este repo, la carpeta de `info/exclude` que resuelve existe", () => {
  const salida = execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: RAIZ, encoding: "utf8" });
  // `info/` puede no existir en un clon recién hecho; la carpeta de git, siempre.
  const ruta = rutaDeGit(RAIZ, salida);
  assert.ok(existsSync(dirname(dirname(ruta))), `no existe la carpeta de git de ${ruta}`);
});
