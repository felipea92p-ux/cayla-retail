import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ADR-0611, mejora 4: el botón que confirma no se apaga por lo que falta. Apagado no dice qué falta, y en un celular ni siquiera se puede preguntar
// (el `title` no se ve). Se le pasa `confirma={guia}`: al tocarlo, cada campo pendiente dice su error y el cursor va al primero.
// Lo demás sí lo puede apagar (`disabled={enviando}`, `disabled={sinCambios}`): lo que no se arregla llenando un campo de la hoja.

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivos(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

const TODOS = [...archivos("components"), ...archivos("app")];

describe("el botón no se apaga por lo que falta (ADR-0611, mejora 4)", () => {
  it("ningún `disabled` pregunta por la guía: se usa `confirma={guia}`", () => {
    const mal = TODOS.flatMap((p) =>
      readFileSync(p, "utf8")
        .split("\n")
        .flatMap((l, i) => (/^\s*\/\//.test(l) || !/(^|\s)disabled=\{[^}]*\.puedeConfirmar/.test(l) ? [] : [`${p}:${i + 1}`])),
    );
    expect(mal, `Estos botones se apagan por lo que falta. Usa confirma={guia}:\n${mal.join("\n")}`).toEqual([]);
  });

  it("toda hoja con `confirma` tiene dónde decir el error: usa CampoGuiado", () => {
    const sinDonde = TODOS.filter((p) => {
      const t = readFileSync(p, "utf8");
      return /\bconfirma=\{/.test(t) && !/CampoGuiado|guia=\{|foco=\{/.test(t);
    });
    expect(sinDonde).toEqual([]);
  });
});
