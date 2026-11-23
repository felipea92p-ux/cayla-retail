// El aviso de la carpeta principal: qué dice en cada caso. Corre con `node --test` (CI, «Herramientas de Claude Code»).
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeCarpeta } from "./carpeta-principal.mjs";

const base = { principal: "/repo", rama: "main", atras: 0, sucia: false, desde: "12-11" };

test("al día no dice nada", () => {
  assert.equal(avisoDeCarpeta(base), null);
});

test("atrás, limpia y en main: da el comando para avanzarla", () => {
  const a = avisoDeCarpeta({ ...base, atras: 1194 });
  assert.match(a.systemMessage, /1194 commits atrás de main \(desde el 12-11\)/);
  assert.match(a.systemMessage, /git -C "\/repo" merge --ff-only origin\/main/);
  assert.equal(a.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(a.hookSpecificOutput.additionalContext, /no la actualices sin su OK/);
});

test("un solo commit va en singular", () => {
  assert.match(avisoDeCarpeta({ ...base, atras: 1 }).systemMessage, /va 1 commit atrás/);
});

test("con cambios sin commit pide guardarlos antes", () => {
  assert.match(avisoDeCarpeta({ ...base, atras: 3, sucia: true }).systemMessage, /cambios sin commit: guárdalos primero/);
});

test("en otra rama lo dice y no propone avanzarla sola", () => {
  const a = avisoDeCarpeta({ ...base, atras: 3, rama: "claude/x" });
  assert.match(a.systemMessage, /Está en la rama «claude\/x», no en main/);
});
