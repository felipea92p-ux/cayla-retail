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

// El mismo candado para Recibir un envío (ADR-0674 act. f): era la pantalla más pesada del ERP (1 031 KB propios) y la que el almacén usa en
// el celular. Lo que se difirió o se separó no puede volver por un import fijo sin que esto lo diga.
describe("contar un envío no vuelve a cargar lo que se le quitó (ADR-0674)", () => {
  const CONTAR = "components/recepcion-conteo/RecibirContando.tsx";

  it.each([
    ["la hoja que crea una prenda (baja al abrirla)", "components/recepcion-envio/HojaPrenda.tsx"],
    ["el paso «Cerrar» (baja al pasar a él)", "components/recepcion-conteo/CerrarEnvio.tsx"],
    ["las reglas de la caja (antes, por el descuento de campaña de la etiqueta de precio)", "lib/vender-reglas.ts"],
    ["las reglas de «Compré ropa» (antes, por los tipos de papel y la foto del papel)", "lib/compra-rapida-reglas.ts"],
  ])("desde contar un envío no hay camino de imports fijos hasta %s", (_nombre, pieza) => {
    expect(camino(CONTAR, pieza)?.join("\n  → ") ?? null).toBeNull();
  });

  it("la recepción de antes (fase 4) tampoco importa fija la hoja de la prenda", () => {
    expect(camino("components/recepcion-envio/RecibirEnvio.tsx", "components/recepcion-envio/HojaPrenda.tsx")?.join("\n  → ") ?? null).toBeNull();
  });
});

// Y para «Preguntas del equipo» (ADR-0674 act. g): para decir «→ Caja» le pedía el título al registro de las guías desde el navegador, y con
// él bajaba el texto de las 79 guías (650 KB de sus 786). El título lo resuelve el servidor (`lib/guias/titulos.ts`) y llega como dato.
describe("Preguntas del equipo no baja el texto de las guías ni zod (ADR-0674)", () => {
  // Lo mismo con zod (52 KB): el esquema de lo que devuelve la IA vivía en `informe.ts`, que también importa la tarjeta del informe.
  it.each([
    ["la lista de preguntas", "components/asistente/PreguntasEquipo.tsx", "el registro de las guías", "lib/guias/registro.ts"],
    ["la lista de preguntas", "components/asistente/PreguntasEquipo.tsx", "los títulos, que son del servidor", "lib/guias/titulos.ts"],
    ["la tarjeta del informe", "components/asistente/InformeSemanal.tsx", "el esquema de zod del informe", "lib/asistente/informe-esquema.ts"],
    ["la tarjeta del informe", "components/asistente/InformeSemanal.tsx", "el registro de las guías", "lib/guias/registro.ts"],
  ])("desde %s (%s) no hay camino de imports fijos hasta %s", (_nombre, raiz, _que, pieza) => {
    expect(camino(raiz, pieza)?.join("\n  → ") ?? null).toBeNull();
  });
});

// zod solo en el servidor (ADR-0674 act. g). Un archivo que arma un esquema de zod al cargarse trae la librería entera (52 KB) a quien le
// importe cualquier cosa, aunque sea una constante: así la bajaban Configuración (por `TOPE_MENSUAL_USD`) y Preguntas del equipo. Lo que el
// navegador necesita de esos archivos vive aparte (`lib/asistente/limites.ts`); el esquema, en un archivo que solo importa el servidor.
describe("ningún componente llega a zod por un import fijo (ADR-0674)", () => {
  const todos = ["components", "app", "lib"].flatMap(archivosDe);
  const usaZod = (a: string) => modulosConValor(a, readFileSync(join(WEB, a), "utf8")).some((m) => m === "zod" || m.startsWith("zod/"));

  it("desde components/ no hay camino de imports fijos hasta un archivo que importa zod", () => {
    const conZod = todos.filter(usaZod);
    expect(conZod.length, "el detector no está ciego: hay archivos que importan zod").toBeGreaterThan(0);
    // Quién importa a quién, al revés: desde los archivos con zod se sube hasta todo el que los alcanza.
    const quienImporta = new Map<string, string[]>();
    for (const a of todos) for (const h of importsFijos(a)) quienImporta.set(h, [...(quienImporta.get(h) ?? []), a]);
    const alcanzan = new Set(conZod);
    const cola = [...conZod];
    while (cola.length > 0) {
      for (const padre of quienImporta.get(cola.pop()!) ?? []) {
        if (alcanzan.has(padre)) continue;
        alcanzan.add(padre);
        cola.push(padre);
      }
    }
    const culpables = [...alcanzan].filter((a) => a.startsWith("components/")).sort();
    expect(culpables, `Estos componentes llegan a zod por un import fijo y lo bajan entero. Lo que necesiten de ese archivo va en uno aparte, sin zod (como lib/asistente/limites.ts). Archivos con zod: ${conZod.join(", ")}`).toEqual([]);
  });
});

