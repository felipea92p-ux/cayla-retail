import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Los candados de la puerta angosta (ADR-0408), mirando el código de la tienda: lo que ninguna prueba de pantalla vería.
const RAIZ = resolve(__dirname, "..");
const ESTE = relative(RAIZ, __filename);
const CARPETAS = ["app", "components", "lib", "scripts"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx|mjs|js)$/.test(nombre) ? [ruta] : [];
  });
}

const FUENTES = [...CARPETAS.flatMap((c) => archivos(join(RAIZ, c))), join(RAIZ, "next.config.ts")]
  .map((ruta) => ({ ruta: relative(RAIZ, ruta), texto: readFileSync(ruta, "utf8") }))
  .filter((f) => f.ruta !== ESTE);

const importaciones = (texto: string) =>
  [...texto.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm)].map((m) => m[1]);

describe("candados de la tienda", () => {
  it("lee el código de verdad (si no encuentra archivos, los candados no prueban nada)", () => {
    expect(FUENTES.map((f) => f.ruta)).toEqual(expect.arrayContaining(["lib/base.ts", "app/page.tsx"]));
  });

  it("no importa nada del ERP: la tienda vive sola y solo comparte la base (por sus funciones)", () => {
    const fuera = FUENTES.flatMap(({ ruta, texto }) =>
      importaciones(texto)
        .filter((imp) => imp.startsWith("."))
        .filter((imp) => relative(RAIZ, resolve(RAIZ, dirname(ruta), imp)).startsWith(".."))
        .map((imp) => `${ruta} → ${imp}`),
    );
    const delErp = FUENTES.flatMap(({ ruta, texto }) => importaciones(texto).filter((imp) => /apps\/web|^web\//.test(imp)).map((imp) => `${ruta} → ${imp}`));
    expect([...fuera, ...delErp]).toEqual([]);
  });

  it("nunca usa las llaves del ERP (ni la de servicio ni las públicas de su proyecto)", () => {
    const prohibidas = ["SUPABASE_SERVICE_ROLE_KEY", "service_role", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "crearClienteAdmin"];
    const usos = FUENTES.flatMap(({ ruta, texto }) => prohibidas.filter((p) => texto.includes(p)).map((p) => `${ruta}: ${p}`));
    expect(usos).toEqual([]);
  });

  it("solo lib/base.ts carga el driver, y cada archivo que lee la base es del servidor", () => {
    const conDriver = FUENTES.filter(({ texto }) => importaciones(texto).some((imp) => imp === "postgres")).map((f) => f.ruta);
    expect(conDriver).toEqual(["lib/base.ts"]);
    const delServidor = FUENTES.filter((f) => f.ruta === "lib/base.ts" || /-servidor\.ts$/.test(f.ruta));
    expect(delServidor.map((f) => f.ruta)).toContain("lib/portada-servidor.ts");
    expect(delServidor.filter(({ texto }) => !texto.trimStart().startsWith('import "server-only";')).map((f) => f.ruta)).toEqual([]);
  });

  it("en toda la tienda, la base solo se nombra por sus funciones retail.tienda_* (nunca una tabla a mano)", () => {
    const nombres = FUENTES.flatMap(({ ruta, texto }) => [...texto.matchAll(/\bretail\.([a-z_][a-z0-9_]*)/g)].map((m) => `${ruta}: ${m[1]}`));
    expect(nombres.length).toBeGreaterThan(0);
    expect(nombres.filter((n) => !n.split(": ")[1].startsWith("tienda_"))).toEqual([]);
    // Nada de leer o escribir tablas a mano: la base decide en cada función qué devuelve.
    expect(FUENTES.filter(({ texto }) => /\b(from|into|update|join|delete\s+from)\s+retail\./i.test(texto)).map((f) => f.ruta)).toEqual([]);
  });

  it("ningún componente del navegador importa la conexión a la base", () => {
    const delNavegador = FUENTES.filter(({ texto }) => /^\s*["']use client["']/.test(texto));
    const malos = delNavegador
      .filter(({ texto }) => importaciones(texto).some((imp) => /(^|\/)(base|[a-z-]+-servidor)$/.test(imp)))
      .map((f) => f.ruta);
    expect(malos).toEqual([]);
  });
});
