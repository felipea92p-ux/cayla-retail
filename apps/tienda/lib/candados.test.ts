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

const FUENTES = [...CARPETAS.flatMap((c) => archivos(join(RAIZ, c))), join(RAIZ, "next.config.ts"), join(RAIZ, "proxy.ts")]
  .map((ruta) => ({ ruta: relative(RAIZ, ruta), texto: readFileSync(ruta, "utf8") }))
  .filter((f) => f.ruta !== ESTE);

/** Las variables de entorno que se leen (`process.env.X`), con el archivo donde se leen. */
const variables = FUENTES.flatMap(({ ruta, texto }) => [...texto.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => ({ ruta, nombre: m[1] })));
const esDelNavegador = (texto: string) => /^\s*["']use client["']/.test(texto);
const esDeAcciones = (texto: string) => /^\s*["']use server["']/.test(texto);

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

  // Las cuentas de los clientes (actividad 2): su proyecto de inicio de sesión es otro, y la tienda lo nombra con lo suyo.
  it("las variables de entorno son de la tienda: TIENDA_* en el servidor y, en el navegador, solo la dirección y la llave pública del proyecto de clientes", () => {
    expect(variables.length).toBeGreaterThan(0);
    // Ni una variable del ERP (las de su Supabase, su sal del club, su padrón…): la tienda tiene las suyas. La excepción es
    // `CRON_SECRET`, que no es del ERP sino de Vercel: es el nombre con que Vercel firma sus trabajos programados en CADA proyecto (el
    // de la tienda tiene la suya), y solo la lee la ruta del cron de la tienda.
    expect(
      variables.filter((v) => !/^(TIENDA_|NEXT_PUBLIC_TIENDA_)/.test(v.nombre) && v.nombre !== "NODE_ENV" && v.nombre !== "CRON_SECRET").map((v) => `${v.ruta}: ${v.nombre}`),
    ).toEqual([]);
    expect(variables.filter((v) => v.nombre === "CRON_SECRET").map((v) => v.ruta)).toEqual(["app/api/cuentas-cerradas/route.ts"]);
    const publicas = new Set(FUENTES.flatMap(({ texto }) => [...texto.matchAll(/\bNEXT_PUBLIC_[A-Z0-9_]+/g)].map((m) => m[0])));
    expect([...publicas].sort()).toEqual(["NEXT_PUBLIC_TIENDA_AUTH_ANON_KEY", "NEXT_PUBLIC_TIENDA_AUTH_URL"]);
  });

  it("la llave secreta del proyecto de clientes solo la lee lib/sesion-servidor.ts, que es del servidor", () => {
    const conLlave = FUENTES.filter(({ texto }) => texto.includes("TIENDA_AUTH_SERVICE_KEY")).map((f) => f.ruta);
    expect(conLlave).toEqual(["lib/sesion-servidor.ts"]);
    expect(FUENTES.find((f) => f.ruta === "lib/sesion-servidor.ts")?.texto.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("solo el servidor crea y borra usuarios del proyecto de clientes (nunca un componente del navegador)", () => {
    const conAdmin = FUENTES.filter(({ texto }) => /\.auth\.admin\b/.test(texto));
    expect(conAdmin.length).toBeGreaterThan(0);
    expect(conAdmin.filter(({ ruta, texto }) => !esDeAcciones(texto) && !/-servidor\.ts$/.test(ruta)).map((f) => f.ruta)).toEqual([]);
    expect(FUENTES.filter(({ texto }) => esDelNavegador(texto) && /\b(clienteAdmin|clienteSuelto|clienteSesion)\b/.test(texto)).map((f) => f.ruta)).toEqual([]);
  });
});
