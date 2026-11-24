#!/usr/bin/env node
// El tablero de sesiones al abrir una sesión (hook `SessionStart` de `.claude/settings.json`, ADR-0697).
//
// Corre `tablero.mjs --al-abrir` como proceso aparte con un tope de 8 s y le deja a la sesión un resumen corto: las otras
// sesiones activas y los choques que importan (`resumenAlAbrir`, en `reglas.mjs`). A la persona solo le muestra una línea si
// hay un choque seguro o uno que toca a esta sesión.
//
// Nunca traba la sesión (principio 9): sin red, sin `gh`, fuera de un repo o pasado el tope, calla y sale con 0. El tope vive
// aquí y no en el tablero porque el tablero lee con `gh` de forma síncrona: un proceso aparte se puede cortar a tiempo.
// Medido el 2026-11-23 en la Mac de Felipe, con 42 worktrees: ~3–4 s, casi todo `git status` (~0,5 s por worktree, disco).
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resumenAlAbrir } from "./reglas.mjs";

const TOPE_MS = 8000;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "tablero.mjs"), "--al-abrir"], {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      encoding: "utf8",
      timeout: TOPE_MS,
      maxBuffer: 1 << 26,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const aviso = r.status === 0 ? resumenAlAbrir(JSON.parse(r.stdout)) : null;
    if (aviso) process.stdout.write(JSON.stringify(aviso));
  } catch {
    // Callar: un resumen que falla no puede trabar la sesión.
  }
  process.exit(0);
}
