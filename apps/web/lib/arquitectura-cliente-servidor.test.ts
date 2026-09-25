import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado de arquitectura: un Server Component NUNCA llama como función a algo que vive en un
// archivo "use client" (regla de CLAUDE.md, «Movimiento y modales»). Next no lo detecta al
// compilar ni `tsc` al tipar: la pantalla compila, pasa lint y se cae en el navegador con
// «Attempted to call X() from the server but X is on the client». Ya pasó dos veces
// (`comprobante-linea-tiempo.ts` y `recepciones-reglas.ts` explican en su encabezado por qué
// existen). Una regla que solo vive en un documento se olvida; una que vive en una prueba no.
//
// Contrato (3 líneas). PROMETE: que ningún módulo del lado servidor llame —`f()`, `new F()` o
// `f.g()`— a un nombre importado de un archivo con la directiva "use client". ASUME: los
// imports locales se resuelven como `tsc` (alias `@/` del tsconfig) y `packages/*` no trae
// directivas (hoy ninguno las trae; sus imports se tratan como externos). NO PROMETE: abrir la
// pantalla en el navegador sigue siendo la prueba final.
//
// Cómo lo mide. Arma el grafo de imports desde lo que Next ejecuta en el servidor —
// `app/**/{page,layout,loading,template,route,not-found,default}` (más los archivos de metadatos),
// `proxy.ts` (la barrera que corre por delante de cada petición) y todo archivo "use server"— y lo
// recorre a lo ancho. En cada archivo "use client" se detiene:
// de ahí para abajo ya es el navegador y llamar funciones es legítimo. Un módulo SIN directiva
// que alcance el recorrido cuenta como servidor aunque también lo importe un cliente (Next lo
// evalúa en ambos lados); uno que solo importan clientes nunca entra al recorrido.
// Solo se cuentan los enlaces que existen en tiempo de ejecución: `import type` y
// `import { type X }` no cuentan.
//
// Qué sí ve al llamar: `f()`, `new F()`, `f.g()`, `f["g"]()`, `f?.()`, `f!()`, `(f)()` y los
// envoltorios de tipos `(f as T)()`, `(f satisfies T)()`, `(<T>f)()`.
//
// LÍMITES CONOCIDOS (a propósito; cerrarlos cuesta más de lo que protegen):
//  - `import * as ns`: el archivo SÍ se sigue (se revisa lo que él llama), pero las llamadas
//    `ns.f()` desde el servidor no se rastrean.
//  - Alias y desestructuración: `const g = f; g()` o `const { f } = ns; f()` no se ven; solo el
//    nombre tal como se importó (o renombrado en el propio `import { f as g }`).
//  - Re-exports en barril: si `a.ts` hace `export { f } from "./cliente"` y el servidor llama `f`
//    importándolo de `a.ts`, no se ve (el recorrido SÍ sigue el barril para revisar sus módulos).
//  - `import()` dinámico no se sigue (ni `next/dynamic`).
//  - Solo se miran LLAMADAS. Leer una constante exportada por un archivo cliente desde el servidor
//    (o pasar su valor a una función) tampoco se detecta.
//  - No modela el alcance: si un módulo servidor declara una variable local con el mismo nombre
//    que una importación cliente y la llama, marcará falso positivo. Renombra la local.
//  - Un módulo importado por `packages/*` desde fuera de `apps/web` no se recorre.
//  - Es conservadora por MÓDULO, no por función: un módulo sin directiva que el servidor alcanza y
//    que llama a un hook cliente cuenta como violación aunque esa función el servidor nunca la
//    ejecute. Si un rojo parece injusto por esto, el arreglo es el mismo: separar el módulo mixto.
// Si algún día pasa un caso de estos, el motivo para ampliar la prueba es ese caso, no la
// exhaustividad: la salida de esta prueba nombra archivo, línea y función para que el arreglo sea
// mover la lógica pura a `lib/*.ts` (sin directiva) o renderizar el componente en vez de llamarlo.

// ───────────────────────────── Análisis (puro: recibe el «sistema de archivos») ─────────────────────────────

type Directiva = "client" | "server" | null;

/** Cómo se resuelve un `import`: a un archivo del proyecto, a algo de fuera (paquete, CSS, imagen,
 *  otro paquete del monorepo) o a nada — este último es un defecto de la prueba, no del código. */
type Resolucion = { ruta: string } | "externo" | "irresoluble";

interface Sistema {
  /** Fuente del archivo. `ruta` siempre es relativa a `apps/web` y con «/». */
  leer(ruta: string): string;
  resolver(spec: string, desde: string): Resolucion;
}

interface Enlace {
  spec: string;
  /** Nombres traídos como valor: `local` es como se llama en este archivo, `exportado` como se
   *  llama en el origen (`default` para `import X from`). */
  nombres: { local: string; exportado: string }[];
}

interface Violacion {
  archivo: string;
  linea: number;
  /** Nombre con el que el archivo la llama. */
  local: string;
  /** Nombre con el que el archivo cliente la exporta (`default` si es la exportación por defecto). */
  exportado: string;
  origen: string;
  /** Raíz → … → archivo: por dónde llegó el recorrido, para saber quién arrastra al módulo. */
  camino: string[];
}

function parsear(ruta: string, fuente: string): ts.SourceFile {
  const kind = ruta.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, false, kind);
}

/** La directiva vive en el prólogo: las sentencias de texto que abren el archivo, antes de
 *  cualquier import (los comentarios no cuentan). Un `"use client"` más abajo no es directiva. */
function directivaDe(sf: ts.SourceFile): Directiva {
  for (const s of sf.statements) {
    if (!ts.isExpressionStatement(s) || !ts.isStringLiteral(s.expression)) break;
    if (s.expression.text === "use client") return "client";
    if (s.expression.text === "use server") return "server";
  }
  return null;
}

/** Los enlaces que existen al ejecutar (no los de tipos): imports y `export … from`. */
function enlacesDe(sf: ts.SourceFile): Enlace[] {
  const enlaces: Enlace[] = [];
  for (const s of sf.statements) {
    if (ts.isExportDeclaration(s)) {
      // Barril: sirve para seguir el recorrido, no para atribuir nombres (ver LÍMITES).
      if (!s.isTypeOnly && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
        enlaces.push({ spec: s.moduleSpecifier.text, nombres: [] });
      }
      continue;
    }
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) continue;
    const spec = s.moduleSpecifier.text;
    const clausula = s.importClause;
    if (!clausula) {
      enlaces.push({ spec, nombres: [] }); // `import "./x"`: solo efectos
      continue;
    }
    if (clausula.isTypeOnly) continue;
    const nombres: Enlace["nombres"] = [];
    let hayValor = false;
    if (clausula.name) {
      nombres.push({ local: clausula.name.text, exportado: "default" });
      hayValor = true;
    }
    const enlazados = clausula.namedBindings;
    if (enlazados && ts.isNamespaceImport(enlazados)) {
      hayValor = true; // `import * as ns`: se sigue el archivo pero no se rastrean sus llamadas
    } else if (enlazados) {
      for (const el of enlazados.elements) {
        if (el.isTypeOnly) continue;
        nombres.push({ local: el.name.text, exportado: (el.propertyName ?? el.name).text });
        hayValor = true;
      }
    }
    if (hayValor) enlaces.push({ spec, nombres });
  }
  return enlaces;
}

/** El identificador del que cuelga lo que se llama: `f` en `f()`, `Fmt` en `Fmt.cop(x)`. Sirve
 *  también para `f!()`, `(f)()`, `f?.()`, `f["x"]()` y los envoltorios de tipos que TypeScript borra
 *  al compilar y que por eso NO cambian lo que se ejecuta: `(f as any)()`, `(f satisfies T)()` y
 *  `(<any>f)()` (este último solo existe en `.ts`; en `.tsx` es JSX). Devuelve null si lo llamado no
 *  cuelga de un nombre (`(() => 1)()`, `a().b()` — el `a()` de adentro se revisa aparte, al
 *  recorrer el árbol). */
function raizDeLoLlamado(e: ts.Expression): ts.Identifier | null {
  let actual: ts.Expression = e;
  for (;;) {
    if (ts.isIdentifier(actual)) return actual;
    if (
      ts.isPropertyAccessExpression(actual) ||
      ts.isElementAccessExpression(actual) ||
      ts.isNonNullExpression(actual) ||
      ts.isParenthesizedExpression(actual) ||
      ts.isAsExpression(actual) ||
      ts.isSatisfiesExpression(actual) ||
      ts.isTypeAssertionExpression(actual)
    ) {
      actual = actual.expression;
    } else {
      return null;
    }
  }
}

/** Llamadas (`f()`, `new F()`) cuyo objetivo cuelga de alguno de los nombres dados. JSX
 *  (`<Componente />`) NO es una llamada: es justo la forma correcta de usar un componente cliente. */
function llamadasA(sf: ts.SourceFile, nombres: Set<string>): { local: string; linea: number }[] {
  const halladas: { local: string; linea: number }[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) || ts.isNewExpression(nodo)) {
      const raiz = raizDeLoLlamado(nodo.expression);
      if (raiz && nombres.has(raiz.text)) {
        halladas.push({ local: raiz.text, linea: sf.getLineAndCharacterOfPosition(nodo.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(sf);
  return halladas;
}

interface Resultado {
  violaciones: Violacion[];
  /** Módulos alcanzados que corren en el servidor (sin directiva, o "use server"). */
  servidor: Set<string>;
  /** Archivos "use client" con los que el servidor se topó (donde se detiene el recorrido). */
  fronteras: Set<string>;
  irresolubles: { desde: string; spec: string }[];
}

function analizar(sistema: Sistema, raices: string[]): Resultado {
  const cache = new Map<string, { sf: ts.SourceFile; directiva: Directiva }>();
  const abrir = (ruta: string) => {
    let hecho = cache.get(ruta);
    if (!hecho) {
      const sf = parsear(ruta, sistema.leer(ruta));
      hecho = { sf, directiva: directivaDe(sf) };
      cache.set(ruta, hecho);
    }
    return hecho;
  };

  const padre = new Map<string, string | null>();
  const cola: string[] = [];
  for (const raiz of raices) {
    if (!padre.has(raiz)) {
      padre.set(raiz, null);
      cola.push(raiz);
    }
  }
  const camino = (ruta: string) => {
    const cadena: string[] = [];
    for (let r: string | null | undefined = ruta; r; r = padre.get(r)) cadena.unshift(r);
    return cadena;
  };

  const resultado: Resultado = { violaciones: [], servidor: new Set(), fronteras: new Set(), irresolubles: [] };
  for (let i = 0; i < cola.length; i++) {
    const ruta = cola[i];
    const { sf, directiva } = abrir(ruta);
    if (directiva === "client") {
      resultado.fronteras.add(ruta); // una entrada que ya es cliente: de aquí para abajo es el navegador
      continue;
    }
    resultado.servidor.add(ruta);

    const delCliente = new Map<string, { exportado: string; origen: string }>();
    for (const enlace of enlacesDe(sf)) {
      const destino = sistema.resolver(enlace.spec, ruta);
      if (destino === "irresoluble") {
        resultado.irresolubles.push({ desde: ruta, spec: enlace.spec });
        continue;
      }
      if (destino === "externo") continue;
      if (abrir(destino.ruta).directiva === "client") {
        resultado.fronteras.add(destino.ruta);
        for (const n of enlace.nombres) delCliente.set(n.local, { exportado: n.exportado, origen: destino.ruta });
        continue; // frontera: no se recorre hacia abajo
      }
      if (!padre.has(destino.ruta)) {
        padre.set(destino.ruta, ruta);
        cola.push(destino.ruta);
      }
    }

    if (delCliente.size === 0) continue;
    for (const llamada of llamadasA(sf, new Set(delCliente.keys()))) {
      const desde = delCliente.get(llamada.local)!;
      resultado.violaciones.push({
        archivo: ruta,
        linea: llamada.linea,
        local: llamada.local,
        exportado: desde.exportado,
        origen: desde.origen,
        camino: camino(ruta),
      });
    }
  }
  return resultado;
}

/** El mensaje que verá quien rompa la regla: dónde, qué función, de qué archivo cliente, qué error
 *  daría Next de todos modos y cuál es el arreglo. */
function mensajeDe(v: Violacion): string {
  const funcion = v.exportado === "default" ? v.local : v.exportado;
  const alias = v.exportado !== "default" && v.local !== v.exportado ? ` (importada como ${v.local})` : "";
  const llegada = v.camino.length > 1 ? `\n    llegó al servidor por: ${v.camino.join(" → ")}` : "";
  return (
    `${v.archivo}:${v.linea} llama a ${funcion}()${alias}, pero esa función vive en ${v.origen}, que es "use client".\n` +
    `    En el servidor Next lanza «Attempted to call ${funcion}() from the server but ${funcion} is on the client» ` +
    `y la pantalla se cae.\n` +
    `    Arreglo: si es lógica pura, sácala a lib/*.ts (sin directiva) e impórtala desde ambos lados; ` +
    `si es un componente, renderízalo en vez de llamarlo; si es un hook, su lugar es un componente cliente.${llegada}`
  );
}

// ───────────────────────────── El repo real ─────────────────────────────

const WEB = join(__dirname, "..");

/** Opciones de `tsc` de este proyecto (alias `@/`, `moduleResolution: bundler`): la misma
 *  resolución que ve el typecheck, sin duplicar el mapa de alias aquí. */
const OPCIONES: ts.CompilerOptions = (() => {
  const leido = ts.readConfigFile(join(WEB, "tsconfig.json"), ts.sys.readFile);
  const { options } = ts.convertCompilerOptionsFromJson(leido.config.compilerOptions, WEB);
  return { ...options, pathsBasePath: WEB }; // que el alias no dependa de desde dónde se lance vitest
})();
const CACHE_RESOLUCION = ts.createModuleResolutionCache(WEB, (n) => n, OPCIONES);
const RECURSOS = /\.(css|svg|png|jpe?g|gif|webp|ico|json)$/;

function desdeDisco(): Sistema {
  return {
    leer: (ruta) => readFileSync(join(WEB, ruta), "utf8"),
    resolver(spec, desde) {
      if (!spec.startsWith(".") && !spec.startsWith("@/")) return "externo"; // paquetes: react, next, @cayla-retail/*
      if (RECURSOS.test(spec)) return "externo";
      const r = ts.resolveModuleName(spec, join(WEB, desde), OPCIONES, ts.sys, CACHE_RESOLUCION).resolvedModule;
      if (!r) return "irresoluble";
      const rel = relative(WEB, r.resolvedFileName).split(sep).join("/");
      if (rel.startsWith("..") || rel.includes("node_modules") || rel.endsWith(".d.ts")) return "externo";
      return { ruta: rel };
    },
  };
}

function fuentesBajo(dir: string): string[] {
  return readdirSync(join(WEB, dir), { withFileTypes: true }).flatMap((e) => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fuentesBajo(ruta);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

// Lo que Next ejecuta en el servidor por convención de archivo. `error.tsx`/`global-error.tsx` no
// están: Next EXIGE que sean "use client".
const ENTRADA_DE_APP =
  /(^|\/)(page|layout|loading|template|route|not-found|default|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon)\.tsx?$/;

// `proxy.ts` (el antiguo `middleware.ts`, renombrado en Next 16) corre en el servidor por delante de
// cada petición, pero vive en la raíz de `apps/web` y no en `app/`: se agrega a mano.
const PROXY = "proxy.ts";

function raicesDelRepo(): { raices: string[]; accionesDeServidor: string[] } {
  const enApp = fuentesBajo("app");
  const entradas = enApp.filter((r) => ENTRADA_DE_APP.test(r));
  if (existsSync(join(WEB, PROXY))) entradas.push(PROXY);
  // Un archivo "use server" es servidor esté o no importado: sus acciones corren allí.
  const acciones = [...enApp, ...fuentesBajo("components"), ...fuentesBajo("lib")].filter((ruta) => {
    const fuente = readFileSync(join(WEB, ruta), "utf8");
    return fuente.includes("use server") && directivaDe(parsear(ruta, fuente)) === "server";
  });
  return { raices: [...new Set([...entradas, ...acciones])], accionesDeServidor: acciones };
}

describe("Arquitectura — el servidor no llama funciones de archivos «use client»", () => {
  const { raices, accionesDeServidor } = raicesDelRepo();
  const real = analizar(desdeDisco(), raices);

  it("parte de las entradas reales del servidor (que el candado no mire el vacío)", () => {
    expect(raices.filter((r) => /(^|\/)page\.tsx$/.test(r)).length).toBeGreaterThanOrEqual(50);
    expect(raices.filter((r) => /(^|\/)layout\.tsx$/.test(r)).length).toBeGreaterThanOrEqual(10);
    expect(raices.filter((r) => /(^|\/)route\.ts$/.test(r)).length).toBeGreaterThanOrEqual(5);
    // Chequeo de cordura del recorrido, no un conteo de acciones: con >= 1 basta para notar que el
    // escaneo de "use server" se rompió. Hoy hay 3, pero borrar o fusionar una acción legítima no
    // debe poner esto en rojo.
    expect(accionesDeServidor.length).toBeGreaterThanOrEqual(1);
    // `proxy.ts` es entrada del servidor aunque no viva en `app/` (si algún día se renombra, se ajusta aquí).
    if (existsSync(join(WEB, PROXY))) expect(raices).toContain(PROXY);
  });

  it("el recorrido llega lejos en el servidor y topa con muchos archivos cliente", () => {
    // Pisos holgados, no cifras exactas: si el recorrido se quedara en las raíces (alias sin
    // resolver, imports mal leídos) el candado pasaría siempre en verde sin mirar nada.
    expect(real.servidor.size).toBeGreaterThanOrEqual(250);
    expect(real.fronteras.size).toBeGreaterThanOrEqual(80);
  });

  it("todo import local del servidor se resuelve (un import perdido es un tramo del grafo sin revisar)", () => {
    expect(real.irresolubles.map((i) => `${i.desde} importa «${i.spec}»`)).toEqual([]);
  });

  it("ningún módulo del servidor llama como función a algo que vive en un archivo «use client»", () => {
    expect(real.violaciones.map(mensajeDe)).toEqual([]);
  });
});

// ───────────────────────────── El detector, sobre archivos inventados ─────────────────────────────

/** Un mini-repo en memoria: `{ "ruta.ts": "fuente" }`. Los imports son relativos con «/» y sin
 *  extensión, como en el repo (`./cliente`, `../lib/x`). */
function repoInventado(archivos: Record<string, string>): Sistema {
  return {
    leer: (ruta) => archivos[ruta],
    resolver(spec, desde) {
      if (!spec.startsWith(".")) return "externo";
      const partes = desde.split("/").slice(0, -1);
      for (const trozo of spec.split("/")) {
        if (trozo === "..") partes.pop();
        else if (trozo !== ".") partes.push(trozo);
      }
      const base = partes.join("/");
      const ruta = [`${base}.ts`, `${base}.tsx`].find((r) => r in archivos);
      return ruta ? { ruta } : "irresoluble";
    },
  };
}

const CLIENTE = `"use client";\nexport function useAtajo() {}\nexport function Boton() { return null; }\nexport default function Panel() { return null; }\n`;

describe("Arquitectura — el detector distingue lo que rompe de lo que no", () => {
  const revisar = (archivos: Record<string, string>, raices: string[]) => analizar(repoInventado(archivos), raices);

  it("marca la llamada a una función cliente desde una página, con archivo, línea y función", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { useAtajo } from "../cliente";\nexport default function P() {\n  useAtajo();\n  return null;\n}\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones).toMatchObject([{ archivo: "app/page.tsx", linea: 3, local: "useAtajo", exportado: "useAtajo", origen: "cliente.tsx" }]);
    const mensaje = mensajeDe(r.violaciones[0]);
    expect(mensaje).toContain("app/page.tsx:3");
    expect(mensaje).toContain("useAtajo()");
    expect(mensaje).toContain("cliente.tsx");
    expect(mensaje).toContain("Attempted to call useAtajo() from the server but useAtajo is on the client");
  });

  it("renderizar el componente cliente (<Boton />) no es llamarlo", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { Boton } from "../cliente";\nimport Panel from "../cliente";\nexport default function P() { return <div><Boton /><Panel>hola</Panel></div>; }\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones).toEqual([]);
    expect(r.fronteras).toEqual(new Set(["cliente.tsx"]));
  });

  it("`import type` y `import { type X }` no traen nada que llamar", () => {
    const r = revisar(
      {
        "app/page.tsx": `import type { Boton } from "../cliente";\nimport { type useAtajo } from "../cliente";\nexport default function P() { Boton(); useAtajo(); return null; }\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones).toEqual([]);
  });

  it("nombra la exportación original cuando se importa con alias y cuando es la exportación por defecto", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { useAtajo as usar } from "../cliente";\nimport Panel from "../cliente";\nexport default function P() { usar(); Panel(); return null; }\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones.map((v) => [v.local, v.exportado])).toEqual([
      ["usar", "useAtajo"],
      ["Panel", "default"],
    ]);
    expect(mensajeDe(r.violaciones[0])).toContain("llama a useAtajo() (importada como usar)");
    expect(mensajeDe(r.violaciones[1])).toContain("llama a Panel()");
  });

  it("marca `new F()`, `F?.()`, `F!()` y `F.g()`", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { Boton } from "../cliente";\nexport default function P() { new Boton(); Boton?.(); Boton!(); Boton.algo(); return null; }\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones.map((v) => v.linea)).toEqual([2, 2, 2, 2]);
    expect(r.violaciones).toHaveLength(4);
  });

  // Cada forma va sola en su propio archivo: si el detector deja de desenvolver una de ellas, se pone
  // en rojo esa fila y no otra. Raíz `.ts` (no `.tsx`) porque `<any>Boton` solo es un cast fuera de JSX.
  it.each([
    ["paréntesis", "(Boton)()"],
    ["acceso con corchetes", 'Boton["algo"]()'],
    ["`as`", "(Boton as any)()"],
    ["`satisfies`", "(Boton satisfies unknown)()"],
    ["cast con `<T>`", "(<any>Boton)()"],
    ["`new` con `as`", "new (Boton as any)()"],
  ])("marca la llamada aunque venga envuelta en %s", (_forma, llamada) => {
    const r = revisar(
      {
        "app/route.ts": `import { Boton } from "../cliente";\nexport function GET() {\n  ${llamada};\n  return null;\n}\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/route.ts"],
    );
    expect(r.violaciones).toMatchObject([{ archivo: "app/route.ts", linea: 3, local: "Boton", exportado: "Boton" }]);
  });

  it("llegar a la llamada por un módulo intermedio sin directiva también cuenta, y el mensaje dice por dónde", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { armar } from "../lib/armar";\nexport default function P() { armar(); return null; }\n`,
        "lib/armar.ts": `import { useAtajo } from "../cliente";\nexport function armar() { return useAtajo(); }\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones).toMatchObject([{ archivo: "lib/armar.ts", camino: ["app/page.tsx", "lib/armar.ts"] }]);
    expect(mensajeDe(r.violaciones[0])).toContain("app/page.tsx → lib/armar.ts");
  });

  it("el mismo módulo sin directiva no cuenta si solo lo importan clientes (no corre en el servidor)", () => {
    const archivos = {
      "app/page.tsx": `import { Boton } from "../cliente";\nexport default function P() { return <Boton />; }\n`,
      // `lib/solo-cliente.ts` no tiene directiva pero solo lo alcanza un archivo cliente.
      "cliente.tsx": `"use client";\nimport { fea } from "./lib/solo-cliente";\nexport function Boton() { fea(); return null; }\n`,
      "lib/solo-cliente.ts": `import { useAtajo } from "../cliente";\nexport function fea() { return useAtajo(); }\n`,
    };
    expect(revisar(archivos, ["app/page.tsx"]).violaciones).toEqual([]);
    // …pero en cuanto una página del servidor lo importa, sí corre allí y sí rompe.
    const conServidor = revisar(
      { ...archivos, "app/otra/page.tsx": `import { fea } from "../../lib/solo-cliente";\nexport default function P() { fea(); return null; }\n` },
      ["app/page.tsx", "app/otra/page.tsx"],
    );
    expect(conServidor.violaciones.map((v) => v.archivo)).toEqual(["lib/solo-cliente.ts"]);
  });

  it("un archivo cliente que llama a otro cliente es legítimo", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { Boton } from "../cliente";\nexport default function P() { return <Boton />; }\n`,
        "cliente.tsx": `"use client";\nimport { useOtro } from "./otro";\nexport function Boton() { useOtro(); return null; }\n`,
        "otro.ts": `"use client";\nexport function useOtro() {}\n`,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones).toEqual([]);
  });

  it("un archivo «use server» es entrada aunque nadie lo importe", () => {
    const r = revisar(
      {
        "app/actions/guardar.ts": `"use server";\nimport { useAtajo } from "../../cliente";\nexport async function guardar() { useAtajo(); }\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/actions/guardar.ts"],
    );
    expect(r.violaciones).toMatchObject([{ archivo: "app/actions/guardar.ts", local: "useAtajo" }]);
  });

  it("sigue el barril (`export * from`) para revisar los módulos que hay detrás", () => {
    const r = revisar(
      {
        "app/page.tsx": `import { algo } from "../lib/barril";\nexport default function P() { algo; return null; }\n`,
        "lib/barril.ts": `export * from "./reglas";\n`,
        "lib/reglas.ts": `import { useAtajo } from "../cliente";\nexport const algo = () => useAtajo();\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones.map((v) => v.archivo)).toEqual(["lib/reglas.ts"]);
  });

  it("sigue `import \"./x\"` (solo efectos): lo que el módulo importado llama también corre en el servidor", () => {
    const r = revisar(
      {
        "app/page.tsx": `import "../lib/efectos";\nexport default function P() { return null; }\n`,
        "lib/efectos.ts": `import { useAtajo } from "../cliente";\nuseAtajo();\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones.map((v) => v.archivo)).toEqual(["lib/efectos.ts"]);
  });

  it("sigue `import * as ns` para revisar el módulo que hay detrás (aunque `ns.f()` no se rastree)", () => {
    const r = revisar(
      {
        "app/page.tsx": `import * as reglas from "../lib/reglas";\nexport default function P() { return String(reglas); }\n`,
        "lib/reglas.ts": `import { useAtajo } from "../cliente";\nexport const algo = () => useAtajo();\n`,
        "cliente.tsx": CLIENTE,
      },
      ["app/page.tsx"],
    );
    expect(r.violaciones.map((v) => v.archivo)).toEqual(["lib/reglas.ts"]);
  });

  it("avisa de un import local que no se pudo resolver, en vez de perder ese tramo en silencio", () => {
    const r = revisar({ "app/page.tsx": `import { x } from "../no-existe";\nexport default function P() { x(); return null; }\n` }, ["app/page.tsx"]);
    expect(r.irresolubles).toEqual([{ desde: "app/page.tsx", spec: "../no-existe" }]);
  });

  it("la directiva solo cuenta en el prólogo del archivo", () => {
    const con = (fuente: string) => directivaDe(parsear("x.ts", fuente));
    expect(con(`"use client";\nimport a from "a";`)).toBe("client");
    expect(con(`'use client'\nimport a from "a";`)).toBe("client");
    expect(con(`// comentario\n/* otro */\n"use client";\nexport const x = 1;`)).toBe("client");
    expect(con(`"use server";\nexport async function f() {}`)).toBe("server");
    expect(con(`import a from "a";\n"use client";`)).toBeNull();
    expect(con(`export const d = "use client";`)).toBeNull();
    expect(con(`export function f() { "use server"; }`)).toBeNull(); // acción en línea: el archivo sigue siendo de servidor
  });
});
