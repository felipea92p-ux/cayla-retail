import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Felipe, 2-nov-2026: «a la hora que busco y selecciono un color se recarga el apartado de colores y me regresa al inicio». El buscador de colores se volvía a montar
// (`key={vuelta}`) después de cada color elegido: la lista se cerraba y reabría arriba de todo. Elegir un color NO remonta nada: el combo está en modo `varios` (la lista sigue abierta y
// donde estaba, con el buscador vacío). Solo CREAR un color nuevo remonta el buscador, y a propósito.

const fuente = readFileSync(join(__dirname, "..", "components", "alta-producto", "ElegirColores.tsx"), "utf8");
const sinComentarios = fuente.replace(/\/\/.*$/gm, "");

describe("el buscador de colores no se recarga al elegir uno", () => {
  it("el combo de búsqueda pide el modo `varios`", () => {
    expect(sinComentarios).toMatch(/<ComboBuscable[\s\S]*?\bvarios\b/);
  });
  it("elegir un color no incrementa la `key` del buscador: la única vuelta que queda es la de «crear un color nuevo»", () => {
    const aparece = sinComentarios.match(/setVuelta\(/g) ?? [];
    expect(aparece.length).toBe(1);
    const alElegir = /onValor=\{\(cod\) => \{[^}]*\}\}/.exec(sinComentarios)?.[0] ?? "";
    expect(alElegir).not.toContain("setVuelta");
  });
});
