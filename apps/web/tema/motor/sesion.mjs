// Sesiones de las cuentas locales. Un login real la primera vez (contra el Supabase LOCAL); de ahí en más las cookies quedan en
// `tema/.sesion/<correo>.json` (fuera de git) y se reutilizan mientras sigan valiendo. Se niega a correr fuera de localhost.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAVE_LOCAL } from "../cuentas.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", ".sesion");
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function exigirLocal(baseUrl) {
  const origen = new URL(baseUrl).origin;
  if (!LOCAL.test(origen)) throw new Error(`Solo contra el ERP local (localhost): «${origen}» no lo es. Las cuentas de prueba y sus claves son del seed local.`);
  return origen;
}

const archivoDe = (correo) => join(DIR, `${correo}.json`);

// La base local compartida vive en el contenedor `supabase_db_cayla-retail`. Una rama que levanta su PROPIA base de pruebas (otro puerto,
// otro contenedor, p. ej. `supabase_db_cayla-oc`) lo dice con `TEMA_DB_CONTENEDOR=<nombre>`, para que los ids de las pantallas salgan de la
// base que de verdad lee su servidor. Sin la variable, nada cambia. Solo lectura, y solo contenedores `supabase_db_*` de esta máquina.
const CONTENEDOR_DB = process.env.TEMA_DB_CONTENEDOR || "supabase_db_cayla-retail";
if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(CONTENEDOR_DB)) throw new Error(`TEMA_DB_CONTENEDOR=«${CONTENEDOR_DB}» no es un contenedor de base local (supabase_db_…).`);

/** Una consulta de SOLO LECTURA a la base local (para armar la URL de un escenario con un id real). */
export function consultarLocal(sql) {
  return execFileSync("docker", ["exec", CONTENEDOR_DB, "psql", "-U", "postgres", "-At", "-c", sql], { encoding: "utf8" }).trim();
}

/** El id de una ubicación por su nombre, para la cookie de la sede activa (solo base local). */
function idDeUbicacion(nombre) {
  const id = execFileSync("docker", ["exec", CONTENEDOR_DB, "psql", "-U", "postgres", "-At", "-c", `select id from retail.ubicaciones where nombre ilike '%${nombre.replace(/'/g, "")}%' limit 1`], { encoding: "utf8" }).trim();
  if (!id) throw new Error(`No hay una ubicación que se llame «${nombre}» en la base local.`);
  return id;
}

async function iniciarSesion(navegador, origen, correo) {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  // Esperar a que React hidrate: si se escribe antes, el estado del formulario queda vacío y el servidor responde 400.
  await p.goto(`${origen}/login`, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.locator('input[type="email"]').first().fill(correo);
  await p.locator('input[type="password"]').first().fill(CLAVE_LOCAL);
  await p.locator('button[type="submit"]').first().click();
  try {
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
  } catch {
    const dice = (await p.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160);
    await ctx.close();
    throw new Error(`No entró ${correo}: «${dice}». ¿Existe la cuenta? (pnpm --filter web tema:cuentas)`);
  }
  mkdirSync(DIR, { recursive: true });
  await ctx.storageState({ path: archivoDe(correo) });
  await ctx.close();
}

/**
 * Un contexto de Playwright ya con sesión, con el tema pedido puesto desde antes de pintar y la vista (sede/Global) elegida.
 * `escala` es la densidad de píxeles (por defecto 1): `/unificar` la pide en 2 para que la captura de un botón se lea nítida.
 */
export async function abrirContexto(navegador, cuenta, { baseUrl, tema, viewport, escala = 1 }) {
  const origen = exigirLocal(baseUrl);
  if (cuenta.correo === null) {
    // Sin sesión: el login y las páginas públicas. Solo se pone el tema.
    const ctx = await navegador.newContext({ viewport, deviceScaleFactor: escala, ...(viewport.width < 700 ? { isMobile: true, hasTouch: true } : {}) });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem("cayla-tema", t);
      } catch {
        /* ventana privada */
      }
    }, tema);
    return ctx;
  }
  if (!existsSync(archivoDe(cuenta.correo))) await iniciarSesion(navegador, origen, cuenta.correo);
  const nuevo = () => navegador.newContext({ storageState: archivoDe(cuenta.correo), viewport, deviceScaleFactor: escala, ...(viewport.width < 700 ? { isMobile: true, hasTouch: true } : {}) });
  let ctx = await nuevo();
  // ¿La sesión guardada sigue valiendo? Si la mandan al login, se rehace.
  const prueba = await ctx.newPage();
  await prueba.goto(`${origen}/`, { waitUntil: "domcontentloaded" });
  if (new URL(prueba.url()).pathname.startsWith("/login")) {
    await ctx.close();
    await iniciarSesion(navegador, origen, cuenta.correo);
    ctx = await nuevo();
  } else {
    await prueba.close();
  }
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("cayla-tema", t);
    } catch {
      /* ventana privada: el tema no se guarda */
    }
  }, tema);
  if (cuenta.vista) {
    const valor = cuenta.vista === "global" ? "global" : idDeUbicacion(cuenta.vista);
    await ctx.addCookies([{ name: "cayla_ubicacion_activa", value: valor, url: origen }]);
  }
  return ctx;
}
