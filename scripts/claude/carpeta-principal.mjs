#!/usr/bin/env node
// El aviso de la carpeta principal (hook `SessionStart` de `.claude/settings.json`, 2026-11-23).
//
// Claude Code lee las skills del proyecto (`.claude/skills/`) de la CARPETA PRINCIPAL del repo, no de la worktree de cada sesión.
// Si esa carpeta se queda atrás de `main`, todas las sesiones de ese equipo trabajan con skills viejas sin saberlo: el 2026-11-23 la
// Mac de Felipe iba 1.194 commits atrás (desde el 12-11), le faltaban `innovar`, `modern-web-guidance` y `actualizar-lista-compra`, y
// no veía el CLAUDE.md corto ni `.claude/rules/`. Este aviso lo dice al abrir la sesión, con el comando para ponerla al día.
//
// Solo avisa: no mueve la carpeta, porque en otro equipo puede haber un servidor corriendo desde ahí. Nunca falla (principio 9): sin
// red, sin `origin` o fuera de un repo, calla y la sesión sigue.
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El aviso que corresponde, o `null` si la carpeta está al día.
 * @param {{ principal: string, rama: string | null, atras: number, sucia: boolean, desde: string | null }} estado
 */
export function avisoDeCarpeta({ principal, rama, atras, sucia, desde }) {
  if (atras <= 0) return null;
  const cuando = desde ? ` (desde el ${desde})` : "";
  const que = `La carpeta principal del repo va ${atras} ${atras === 1 ? "commit" : "commits"} atrás de main${cuando}: las skills del proyecto que ve esta sesión son de esa fecha.`;
  const comando = `git -C "${principal}" merge --ff-only origin/main`;
  let como;
  if (rama !== "main") como = `Está en la rama «${rama ?? "sin rama"}», no en main: pásala a main cuando nadie la esté usando y ponla al día (${comando}).`;
  else if (sucia) como = `Tiene cambios sin commit: guárdalos primero y después ponla al día (${comando}).`;
  else como = `Para ponerla al día: ${comando}. Las skills nuevas se ven en la sesión siguiente.`;
  return {
    systemMessage: `${que} ${como}`,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        `${que} ${como} Avísale al usuario al empezar, en una línea; no la actualices sin su OK: en esa carpeta puede haber un servidor corriendo.`,
    },
  };
}

function git(args, cwd, timeout = 8000) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout });
  return r.status === 0 ? r.stdout.trim() : null;
}

function leerEstado(desdeAqui) {
  const comun = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], desdeAqui);
  if (!comun) return null;
  const principal = dirname(comun);
  // Traer main una vez por sesión: sin red, se compara con lo último que se trajo.
  git(["fetch", "--quiet", "origin", "main"], principal);
  const atras = Number(git(["rev-list", "--count", "HEAD..origin/main"], principal));
  if (!Number.isFinite(atras)) return null;
  const fecha = git(["log", "-1", "--format=%cs", "HEAD"], principal);
  return {
    principal,
    rama: git(["symbolic-ref", "--short", "-q", "HEAD"], principal),
    atras,
    sucia: (git(["status", "--porcelain", "--untracked-files=no"], principal) ?? "") !== "",
    desde: fecha ? fecha.split("-").reverse().slice(0, 2).join("-") : null,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const estado = leerEstado(process.env.CLAUDE_PROJECT_DIR || process.cwd());
    const aviso = estado && avisoDeCarpeta(estado);
    if (aviso) process.stdout.write(JSON.stringify(aviso));
  } catch {
    // Callar: un aviso que falla no puede trabar la sesión.
  }
  process.exit(0);
}
