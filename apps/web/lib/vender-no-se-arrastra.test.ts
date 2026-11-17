import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado de ADR-0674 (actividad 7): la pantalla de Vender no viaja a otras pantallas.
//
// Por qué existe. `money` —una función de una línea— vivía exportada dentro de `components/PuntoDeVenta.tsx`, y el ícono de cada medio de
// pago, dentro del ticket de Vender. Quien los importaba se llevaba la pantalla de Vender ENTERA (298 archivos, 2,6 MB de fuente): Caja,
// Apartados y hasta Mis compras (por `components/ui/FichasMedio.tsx`) la descargaban y la leían sin usarla. En un teléfono de 2–4 GB eso
// es lo que tarda en despertar la pantalla. Nadie lo veía: un import chico no dice lo que arrastra.
//
// Contrato. PROMETE: (1) solo `app/(app)/vender/page.tsx` importa un VALOR de la pantalla de Vender, y solo ella importa un valor de su
// ticket; (2) desde las pantallas vecinas no hay camino de imports fijos hasta ella. ASUME: los imports con `@/` y relativos; un
// `import type` y un `import()` no arrastran nada. NO PROMETE: medir kilobytes (eso es el armado de producción).

const WEB = resolve(__dirname, "..");
const EXTENSIONES = [".tsx", ".ts", "/index.tsx", "/index.ts"];

function archivosDe(carpeta: string): string[] {
  return readdirSync(join(WEB, carpeta), { withFileTypes: true }).flatMap((e) => {
    const ruta = join(carpeta, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : archivosDe(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

/** Los módulos de los que `fuente` importa (o reexporta) un VALOR con un import fijo. `import type`, `import { type X }` y `import()` no cuentan. */
function modulosConValor(ruta: string, fuente: string): string[] {
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
  const modulos: string[] = [];
  for (const nodo of archivo.statements) {
    if (ts.isImportDeclaration(nodo) && ts.isStringLiteral(nodo.moduleSpecifier)) {
      const c = nodo.importClause;
      if (!c) modulos.push(nodo.moduleSpecifier.text); // import "x": efecto de lado
      else if (c.isTypeOnly) continue;
      else if (c.name || (c.namedBindings && ts.isNamespaceImport(c.namedBindings))) modulos.push(nodo.moduleSpecifier.text);
      else if (c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.some((e) => !e.isTypeOnly)) modulos.push(nodo.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(nodo) && nodo.moduleSpecifier && ts.isStringLiteral(nodo.moduleSpecifier) && !nodo.isTypeOnly) {
      modulos.push(nodo.moduleSpecifier.text);
    }
  }
  return modulos;
}

function resolver(desde: string, modulo: string): string | null {
  const base = modulo.startsWith("@/") ? join(WEB, modulo.slice(2)) : modulo.startsWith(".") ? resolve(dirname(join(WEB, desde)), modulo) : null;
  if (!base) return null;
  if (existsSync(base) && statSync(base).isFile()) return relative(WEB, base);
  for (const e of EXTENSIONES) if (existsSync(base + e)) return relative(WEB, base + e);
  return null;
}

const importsDe = new Map<string, string[]>();
function importsFijos(archivo: string): string[] {
  let lista = importsDe.get(archivo);
  if (!lista) {
    lista = modulosConValor(archivo, readFileSync(join(WEB, archivo), "utf8")).flatMap((m) => resolver(archivo, m) ?? []);
    importsDe.set(archivo, lista);
  }
  return lista;
}

/** El camino de imports fijos de `desde` a `hasta`, o `null` si no hay. */
function camino(desde: string, hasta: string): string[] | null {
  const previo = new Map<string, string | null>([[desde, null]]);
  const cola = [desde];
  while (cola.length > 0) {
    const a = cola.shift()!;
    if (a === hasta) {
      const pasos: string[] = [];
      for (let x: string | null = hasta; x; x = previo.get(x) ?? null) pasos.unshift(x);
      return pasos;
    }
    for (const h of importsFijos(a))
      if (!previo.has(h)) {
        previo.set(h, a);
        cola.push(h);
      }
  }
  return null;
}

const VENDER = "components/PuntoDeVenta.tsx";
const TICKET = "components/PuntoDeVentaTicket.tsx";

describe("cómo se reconoce un import que arrastra", () => {
  it("un valor, un valor entre tipos, el módulo entero y una reexportación arrastran", () => {
    const f = `import { money } from "a";\nimport { type T, x } from "b";\nimport * as c from "c";\nimport D from "d";\nimport "e";\nexport { z } from "f";`;
    expect(modulosConValor("x.tsx", f)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("un `import type`, solo tipos en línea y un `import()` no arrastran nada", () => {
    const f = `import type { T } from "a";\nimport { type U, type V } from "b";\nexport type { W } from "c";\nconst m = () => import("d");`;
    expect(modulosConValor("x.tsx", f)).toEqual([]);
  });
});

describe("la pantalla de Vender no viaja a otras pantallas (ADR-0674)", () => {
  const todos = ["components", "app", "lib"].flatMap(archivosDe);

  it("solo la ruta /vender importa un valor de la pantalla de Vender; para un tipo, `import type`", () => {
    const culpables = todos.filter((a) => a !== "app/(app)/vender/page.tsx" && importsFijos(a).includes(VENDER));
    expect(culpables, `Importan un valor de ${VENDER} y se llevan la pantalla de Vender entera. Lo que sirve a más de una pantalla vive en lib/ o en su propio archivo (como lib/money.ts):`).toEqual([]);
  });

  it("solo la pantalla de Vender importa un valor de su ticket", () => {
    const culpables = todos.filter((a) => a !== VENDER && importsFijos(a).includes(TICKET));
    expect(culpables, `Importan un valor de ${TICKET} (que trae a Vender detrás). El ícono de un medio vive en components/punto-de-venta/iconoMetodo.tsx:`).toEqual([]);
  });

  it.each([
    ["Caja", "components/CajaAbiertaPanel.tsx"],
    ["Apartados", "components/apartados/ApartadosPanel.tsx"],
    ["Mis compras ▸ Compré ropa", "components/mi-plata/RegistrarCompra.tsx"],
    ["las fichas de medio de pago de todo el ERP", "components/ui/FichasMedio.tsx"],
  ])("desde %s no hay camino de imports fijos hasta la pantalla de Vender", (_nombre, raiz) => {
    expect(camino(raiz, VENDER)?.join("\n  → ") ?? null).toBeNull();
  });
});
