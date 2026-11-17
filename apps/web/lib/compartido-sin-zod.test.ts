import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado de ADR-0674 (actividad 7): el índice de `@cayla-retail/shared` no trae ninguna librería.
//
// Por qué existe. El índice reexportaba `./schemas`, que arma sus esquemas con zod apenas se carga. Como el armado no puede saber que eso
// no hace falta, toda pantalla que importaba un enum o un formateador del índice bajaba zod entero: 52 KB ya armados en 52 de las 139
// pantallas (Vender, Caja, Inicio, Recibir, Existencias…), y ninguna validaba nada con él. Nadie lo veía: el import decía `SEDES`.
//
// Contrato. PROMETE: desde `packages/shared/src/index.ts`, por imports y reexportaciones de valor, no se llega a ningún import de una
// librería. ASUME: dentro del paquete los imports son relativos. NO PROMETE: medir kilobytes (eso es `scripts/peso/por-modulo.mjs`).
// Lo que necesite una librería va en una subruta propia del paquete (`@cayla-retail/shared/schemas`), que solo paga quien la importa.

const SRC = resolve(__dirname, "../../../packages/shared/src");

/** Los módulos de los que `fuente` importa o reexporta un VALOR. `import type` y `export type` no cuentan. */
function modulosConValor(ruta: string, fuente: string): string[] {
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const modulos: string[] = [];
  for (const nodo of archivo.statements) {
    if (ts.isImportDeclaration(nodo) && ts.isStringLiteral(nodo.moduleSpecifier)) {
      const c = nodo.importClause;
      if (c?.isTypeOnly) continue;
      if (c?.namedBindings && ts.isNamedImports(c.namedBindings) && !c.name && c.namedBindings.elements.every((e) => e.isTypeOnly)) continue;
      modulos.push(nodo.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(nodo) && nodo.moduleSpecifier && ts.isStringLiteral(nodo.moduleSpecifier) && !nodo.isTypeOnly) {
      modulos.push(nodo.moduleSpecifier.text);
    }
  }
  return modulos;
}

/** Cada librería a la que se llega desde `entrada`, con el archivo del paquete que la importa. */
function libreriasDesde(entrada: string): string[] {
  const vistos = new Set<string>();
  const halladas: string[] = [];
  const cola = [resolve(SRC, entrada)];
  while (cola.length > 0) {
    const archivo = cola.pop()!;
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);
    for (const m of modulosConValor(archivo, readFileSync(archivo, "utf8"))) {
      if (!m.startsWith(".")) {
        halladas.push(`${relative(SRC, archivo)} → ${m}`);
        continue;
      }
      const base = resolve(dirname(archivo), m);
      const hallado = [base, `${base}.ts`, `${base}/index.ts`].find((p) => existsSync(p) && p.endsWith(".ts"));
      if (hallado) cola.push(hallado);
    }
  }
  return halladas.sort();
}

describe("el índice del paquete compartido no trae librerías (ADR-0674)", () => {
  it("desde el índice no se llega a zod ni a ninguna otra librería", () => {
    expect(
      libreriasDesde("index.ts"),
      "El índice de @cayla-retail/shared llega a una librería: toda pantalla que importe algo de él la descarga entera. Lo que la necesite va en una subruta del paquete (como `@cayla-retail/shared/schemas`):",
    ).toEqual([]);
  });

  it("el detector no está ciego: los esquemas sí llegan a zod", () => {
    expect(libreriasDesde("schemas.ts")).toEqual(["schemas.ts → zod"]);
  });
});
