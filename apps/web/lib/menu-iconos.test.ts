import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARBOL, esGrupo, type ClaveIcono, type Nodo } from "./menu";

// Candado de los íconos del lateral (refresco retail, Felipe 2026-10-13). Los trazos viven en `IC`, dentro de `AppShell.tsx`.
//
// PROMETE: (1) que cada clave que el árbol del menú nombra tiene su trazo; (2) que dos claves nunca comparten el MISMO dibujo
// (`menu.test.ts` ya impide que dos filas de un perfil repitan la CLAVE, pero dos claves distintas con el mismo trazo se verían
// igual en pantalla: «Ventas» y «Compras» eran dos bolsas casi idénticas hasta este refresco); (3) que ningún subtrazo unido
// con un espacio arranca con «m» minúscula.
// POR QUÉ (3): un trazo de lucide con varios elementos se pega en UN solo `d`. Solo, su «m» inicial es absoluto; unido a otro,
// es RELATIVO al punto donde terminó el anterior y el dibujo se descuadra sin avisar (se vio, antes de pintarla, al unir los
// dos trazos de la brújula de Gestión). Se escribe «M», y «l» para los pares que le siguen.
// NO PROMETE: que cada dibujo se lea bien a 18 px ni que diga lo que la pantalla es: eso se mira en el menú, claro y oscuro.

const RAIZ = join(__dirname, "..");

function trazosDelLateral(): Map<string, string> {
  const fuente = readFileSync(join(RAIZ, "components/AppShell.tsx"), "utf8");
  const desde = fuente.indexOf("const IC: Record");
  const bloque = fuente.slice(desde, fuente.indexOf("/* ----", desde));
  return new Map([...bloque.matchAll(/^ {2}(\w+): "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
}

const clavesDelArbol = (nodos: readonly Nodo[]): ClaveIcono[] =>
  nodos.flatMap((n) => (n.estado !== "viva" ? [] : esGrupo(n) ? [n.icono, ...clavesDelArbol(n.hijos)] : [n.icono]));

describe("íconos del lateral (`IC` en AppShell)", () => {
  const trazos = trazosDelLateral();

  it("lee los trazos del mapa", () => {
    expect(trazos.size).toBeGreaterThan(40);
  });

  it("cada ícono que nombra el árbol del menú tiene su trazo", () => {
    const sinTrazo = [...new Set(clavesDelArbol(ARBOL))].filter((c) => !trazos.has(c));
    expect(sinTrazo).toEqual([]);
  });

  it("dos claves distintas no comparten el mismo dibujo", () => {
    const porDibujo = new Map<string, string[]>();
    for (const [clave, d] of trazos) porDibujo.set(d, [...(porDibujo.get(d) ?? []), clave]);
    const repetidos = [...porDibujo.values()].filter((claves) => claves.length > 1).map((claves) => claves.join(" + "));
    expect(repetidos).toEqual([]);
  });

  it("ningún subtrazo unido con un espacio arranca con «m» minúscula (sería relativo al anterior)", () => {
    const sueltos = [...trazos].filter(([, d]) => /^m/.test(d) || /\sm/.test(d)).map(([clave]) => clave);
    expect(sueltos).toEqual([]);
  });
});
