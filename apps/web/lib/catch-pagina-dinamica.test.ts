import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Candado: un `try/catch` del servidor que lee la sesión (cookies) no se traga el error de «página dinámica».
//
// Por qué existe: al compilar, Next prueba a pre-renderizar cada pantalla y, cuando alguien llama a `cookies()`, lanza a propósito un
// error (`DYNAMIC_SERVER_USAGE`) que significa «esta pantalla es dinámica, no la dejes estática». Si un `catch` lo atrapa y devuelve
// «vacío», la pantalla que dependía solo de esa lectura se queda armada con el vacío y todos lo ven. El 2026-10-27 el armado de Vercel
// lo mostró en `getWhatsappDeSedes` («WhatsApp de las sedes: Error: Dynamic server usage»): no rompió nada porque otra lectura sin
// `catch` ya hacía dinámica la pantalla, pero era casualidad. Regla: en el `catch`, `unstable_rethrow(e)` primero (relanza lo que es de
// Next —dinámica, redirect, notFound— y no toca un error real, que sigue tolerándose como antes).
//
// Contrato. PROMETE: que ningún `try` de `app/` o `lib/` (archivos de servidor) que llame directo a `createClient`, `cookies`, `headers`,
// `getUbicaciones` o `requirePersonaActualV2` tiene un `catch` sin `unstable_rethrow` ni `throw`. ASUME: esas son las puertas por donde
// entran las cookies. NO PROMETE: ver una lectura de sesión escondida dentro de otra función (`getAlgo()` que por dentro usa `createClient`),
// ni un `.catch(() => …)` de promesa; esos se revisan a mano.

const PUERTAS = new Set(["createClient", "cookies", "headers", "getUbicaciones", "requirePersonaActualV2"]);

/** Las líneas de cada `try` que lee la sesión y cuyo `catch` se traga el error de página dinámica. */
function catchesQueSeTragan(ruta: string, fuente: string): number[] {
  if (!/\bcatch\b/.test(fuente)) return [];
  if (/^\s*(["'])use client\1/.test(fuente)) return []; // en el navegador no hay pre-renderizado ni cookies de Next
  const archivo = ts.createSourceFile(ruta, fuente, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineas: number[] = [];

  const hay = (nodo: ts.Node, buscar: (n: ts.Node) => boolean): boolean => {
    let hallado = false;
    const mirar = (n: ts.Node) => {
      if (hallado) return;
      if (buscar(n)) {
        hallado = true;
        return;
      }
      ts.forEachChild(n, mirar);
    };
    mirar(nodo);
    return hallado;
  };
  const llamaA = (n: ts.Node, nombres: ReadonlySet<string>) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && nombres.has(n.expression.text);

  const visitar = (nodo: ts.Node) => {
    if (ts.isTryStatement(nodo) && nodo.catchClause) {
      const leeSesion = hay(nodo.tryBlock, (n) => llamaA(n, PUERTAS));
      const relanza = hay(nodo.catchClause.block, (n) => llamaA(n, new Set(["unstable_rethrow"])) || ts.isThrowStatement(n));
      if (leeSesion && !relanza) lineas.push(archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1);
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return lineas;
}

describe("cómo se reconoce un catch que se traga el error de página dinámica", () => {
  it("un try que lee la sesión con un catch que devuelve vacío", () => {
    const fuente = `async function a() {\n  try {\n    const s = await createClient();\n  } catch (e) {\n    return null;\n  }\n}`;
    expect(catchesQueSeTragan("a.ts", fuente)).toEqual([2]);
  });

  it("con unstable_rethrow o con throw en el catch, no", () => {
    const con = `async function a() {\n  try {\n    await createClient();\n  } catch (e) {\n    unstable_rethrow(e);\n    return null;\n  }\n}`;
    const lanza = `async function a() {\n  try {\n    await cookies();\n  } catch (e) {\n    throw e;\n  }\n}`;
    expect(catchesQueSeTragan("a.ts", con)).toEqual([]);
    expect(catchesQueSeTragan("a.ts", lanza)).toEqual([]);
  });

  it("un try que no lee la sesión, o un archivo del navegador, no cuentan", () => {
    expect(catchesQueSeTragan("a.ts", `try { JSON.parse(x); } catch { }`)).toEqual([]);
    expect(catchesQueSeTragan("a.tsx", `"use client";\ntry { await createClient(); } catch { }`)).toEqual([]);
  });
});

function archivosDeServidor(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === ".next") continue;
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...archivosDeServidor(ruta));
    else if (/\.(ts|tsx)$/.test(entrada.name) && !/\.test\.(ts|tsx)$/.test(entrada.name)) salida.push(ruta);
  }
  return salida;
}

describe("ningún try de servidor se traga el error de página dinámica", () => {
  it("app/ y lib/ relanzan lo que es de Next antes de tolerar la falla", () => {
    const raiz = join(__dirname, "..");
    const culpables: string[] = [];
    for (const carpeta of ["app", "lib"]) {
      for (const ruta of archivosDeServidor(join(raiz, carpeta))) {
        const lineas = catchesQueSeTragan(ruta, readFileSync(ruta, "utf8"));
        for (const linea of lineas) culpables.push(`${ruta.slice(raiz.length + 1)}:${linea}`);
      }
    }
    // Si falla: en ese `catch`, `unstable_rethrow(e)` (de `next/navigation`) como primera línea. Ver el encabezado de esta prueba.
    expect(culpables).toEqual([]);
  });
});
