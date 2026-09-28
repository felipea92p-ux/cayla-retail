#!/usr/bin/env node
/**
 * Las pruebas de Postgres que leen `apps/web` — las únicas que un PR «solo web» puede romper (ADR-0259).
 *
 * Un PR que solo cambia `apps/web/` deja la base igual que la de `main`, así que casi todas las pruebas del job darían lo
 * mismo que en `main`. Las que NO: las que leen archivos de la web (hoy `roles-cobertura` lee cada `.rpc("…")` de las
 * pantallas; `frescura-lectura` y `fn-movimientos-busqueda-especial` comparan contra un fixture de `apps/web/lib`).
 *
 * La lista no se escribe a mano: se deduce leyendo cada `pnpm pruebas:*` de package.json y los módulos que importa
 * (imports relativos, en cadena). Una prueba nueva que lea la web entra sola; no hay una lista que alguien tenga que
 * acordarse de mover.
 *
 * USO
 *   node scripts/ci/pruebas-web.mjs           → corre esas pruebas (todas, aunque una falle) y sale con 1 si alguna falló
 *   node scripts/ci/pruebas-web.mjs --listar  → solo las nombra
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// `apps/web/…` escrito como ruta, o armado por partes: join(RAIZ, "apps", "web", …).
const LEE_LA_WEB = /apps\/web|["']apps["']\s*,\s*["']web["']/;
const IMPORT_RELATIVO = /(?:from\s+|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;

/** ¿El archivo, o algo que importa en cadena, lee `apps/web`? `leer(ruta)` devuelve el texto o null si no existe. */
export function leeLaWeb(ruta, leer, vistos = new Set()) {
  if (vistos.has(ruta)) return false;
  vistos.add(ruta);
  const texto = leer(ruta);
  if (texto === null) return false;
  if (LEE_LA_WEB.test(texto)) return true;
  for (const [, relativo] of texto.matchAll(IMPORT_RELATIVO)) {
    if (leeLaWeb(resolve(dirname(ruta), relativo), leer, vistos)) return true;
  }
  return false;
}

/** Nombres `pruebas:*` cuyo script corre un archivo que lee la web. */
export function pruebasQueLeenLaWeb(scripts, raiz, leer) {
  return Object.entries(scripts)
    .filter(([nombre]) => nombre.startsWith("pruebas:"))
    .filter(([, comando]) => {
      const archivo = /^node\s+(\S+\.m?js)\b/.exec(comando)?.[1];
      return archivo ? leeLaWeb(resolve(raiz, archivo), leer) : true;
    })
    .map(([nombre]) => nombre)
    .sort();
}

function main() {
  const leer = (ruta) => (existsSync(ruta) ? readFileSync(ruta, "utf8") : null);
  const { scripts } = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const nombres = pruebasQueLeenLaWeb(scripts, RAIZ, leer);

  if (nombres.length === 0) {
    console.error("✗ Ninguna prueba lee la web: casi seguro que la detección se rompió. Revisa scripts/ci/pruebas-web.mjs.");
    process.exit(1);
  }
  console.log(`Pruebas que leen apps/web (${nombres.length}): ${nombres.join(", ")}`);
  if (process.argv.includes("--listar")) return;

  const fallaron = [];
  for (const nombre of nombres) {
    console.log(`\n::group::pnpm ${nombre}`);
    try {
      execFileSync("pnpm", [nombre], { cwd: RAIZ, stdio: "inherit" });
    } catch {
      fallaron.push(nombre);
    }
    console.log("::endgroup::");
  }
  if (fallaron.length > 0) {
    console.error(`\n✗ Fallaron: ${fallaron.join(", ")}`);
    process.exit(1);
  }
  console.log(`\n✓ Las ${nombres.length} pruebas que leen la web pasaron.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
