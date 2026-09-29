// Sesión persistida del Responsive Quality Gate — ver `responsive/README.md`, sección
// «Autenticación».
//
// Un login real (contra Supabase local) la primera vez; de ahí en más, las cookies quedan en
// `responsive/.sesion/storageState.json` (fuera de git, ver `.gitignore`) y cada corrida las
// reutiliza — igual que hace `scratchpad/herramientas/cdp.mjs` desde antes, pero con el
// `storageState` de Playwright en vez de reimplementar el guardado de cookies a mano.
//
// Las credenciales NUNCA se hardcodean ni se imprimen: se leen en caliente de
// `supabase/seed.sql` (usuario/clave de desarrollo del seed local), como ya hacía `cdp.mjs`.

import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_REPO = join(AQUI, "..", "..", "..", ".."); // apps/web/responsive/motor -> raíz del repo
const RUTA_SEED = join(RAIZ_REPO, "supabase", "seed.sql");
const DIR_SESION = join(AQUI, "..", ".sesion");
export const RUTA_STORAGE_STATE = join(DIR_SESION, "storageState.json");

const TTL_SESION_MS = 12 * 60 * 60 * 1000; // 12h: una jornada de trabajo, luego se re-loguea sola.

function credencialesSeedLocal() {
  const seed = readFileSync(RUTA_SEED, "utf8");
  const email = seed.match(/'([a-z]+@cayla\.local)'/)?.[1];
  const clave = seed.match(/crypt\('([^']+)'/)?.[1];
  if (!email || !clave) throw new Error("responsive: no encontré credenciales de desarrollo en supabase/seed.sql");
  return { email, clave };
}

function storageStateVigente() {
  if (!existsSync(RUTA_STORAGE_STATE)) return false;
  const edadMs = Date.now() - statSync(RUTA_STORAGE_STATE).mtimeMs;
  return edadMs < TTL_SESION_MS;
}

/**
 * Da un `BrowserContext` ya autenticado. Si hay una sesión reciente guardada, la reusa (sin
 * loguearse de nuevo); si no, hace el login una vez contra `baseURL` y la guarda para las
 * próximas corridas.
 * @param {import('playwright').Browser} browser
 * @param {{ baseURL: string }} opts
 */
export async function contextoAutenticado(browser, { baseURL }) {
  if (storageStateVigente()) {
    return browser.newContext({ storageState: RUTA_STORAGE_STATE });
  }

  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });

  const { email, clave } = credencialesSeedLocal();
  const campoCorreo = pagina.locator('input[type="email"], input[name="email"], input[autocomplete="username"]').first();
  const campoClave = pagina.locator('input[type="password"]').first();
  await campoCorreo.fill(email);
  await campoClave.fill(clave);
  await pagina.getByRole("button", { name: /entrar/i }).click();
  await pagina.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  mkdirSync(DIR_SESION, { recursive: true });
  await contexto.storageState({ path: RUTA_STORAGE_STATE });
  await pagina.close();
  return contexto;
}
