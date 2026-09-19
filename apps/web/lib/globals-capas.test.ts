import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Candado de ADR-0105. Una regla de clase (`.algo-cayla`) escrita en globals.css FUERA de
// `@layer` le gana a toda utilidad de Tailwind — `card-cayla border-l-2 border-l-rojo`
// pintaba el borde sand de 1px y el acento rojo nunca se veía, sin ningún error. Este test
// lee el CSS y falla si aparece una regla de clase sin capa, para que el defecto no vuelva
// en silencio la próxima vez que alguien agregue una clase «porque así estaban las otras».
//
// Recorre el archivo con una pila de bloques: `@layer` marca todo lo de adentro como
// «con capa» (y `@media`/`@supports` heredan la marca del padre); `@keyframes` y `@theme` no
// contienen reglas de clase. Lo que queda por encima del nivel de bloque y empieza con `.`
// es una clase suelta.

function clasesSinCapa(css: string): string[] {
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const pila: { conCapa: boolean; opaco: boolean }[] = [];
  const sueltas: string[] = [];
  let cabecera = "";

  for (const c of limpio) {
    if (c === "{") {
      const enCapa = pila.length > 0 && pila[pila.length - 1].conCapa;
      const opaco = pila.length > 0 && pila[pila.length - 1].opaco;
      const txt = cabecera.trim();
      if (txt.startsWith("@")) {
        const nombre = txt.match(/^@([a-z-]+)/)![1];
        pila.push({
          conCapa: enCapa || nombre === "layer",
          opaco: opaco || nombre === "keyframes" || nombre === "theme",
        });
      } else {
        if (!opaco && !enCapa && txt.startsWith(".")) sueltas.push(txt.replace(/\s+/g, " "));
        pila.push({ conCapa: enCapa, opaco: true }); // dentro de una regla no hay más reglas
      }
      cabecera = "";
    } else if (c === "}") {
      pila.pop();
      cabecera = "";
    } else if (c === ";") {
      cabecera = "";
    } else {
      cabecera += c;
    }
  }
  return sueltas;
}

describe("globals.css — clases de componente", () => {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

  it("ninguna regla de clase queda fuera de una @layer", () => {
    expect(clasesSinCapa(css)).toEqual([]);
  });

  it("el detector sí ve una clase suelta (que no pase de largo por estar mal escrito)", () => {
    const malo = `@layer components { .bien { color: red; } }\n.mal { color: blue; }\n@media print { .peor { color: green; } }`;
    expect(clasesSinCapa(malo)).toEqual([".mal", ".peor"]);
  });
});
