#!/usr/bin/env node
/**
 * Pruebas de `retail.etiquetar_variantes` contra un Postgres EFÍMERO.
 *
 * A diferencia de `registrar_venta.mjs` (que habla con el Postgres de Docker que
 * comparten los worktrees), esto levanta su propio cluster en una carpeta temporal,
 * en un puerto libre y solo por socket local, corre `etiquetar_variantes.sql` y lo
 * destruye al terminar. No necesita Docker (que suele estar caído) ni toca ninguna
 * base compartida; solo requiere los binarios de Postgres (`brew install postgresql@16`).
 *
 * Como `registrar_venta.mjs`, NO es un test de vitest: `pnpm test` corre en CI sobre
 * un checkout limpio sin Postgres. Se corre a mano:
 *
 *     node scripts/pruebas/etiquetar_variantes.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/bin", "/usr/local/bin"].find((d) => existsSync(join(d, "initdb")));
if (!BIN) {
  console.error("No encuentro initdb. Instala Postgres: brew install postgresql@16");
  process.exit(2);
}

// Sin esto, en macOS el servidor puede morir al arrancar con «postmaster became
// multithreaded during startup» (una configuración de idioma que no existe).
process.env.LC_ALL = "en_US.UTF-8";

const carpeta = mkdtempSync(join(tmpdir(), "pg-etiquetar-"));
const datos = join(carpeta, "datos");
const socket = carpeta; // el socket vive en la carpeta temporal, no en /tmp compartido
const puerto = String(55000 + Math.floor(Math.random() * 900));
let arriba = false;

function limpiar() {
  if (arriba) spawnSync(join(BIN, "pg_ctl"), ["-D", datos, "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(carpeta, { recursive: true, force: true });
}
process.on("exit", limpiar);

try {
  execFileSync(join(BIN, "initdb"), ["-D", datos, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  execFileSync(
    join(BIN, "pg_ctl"),
    ["-D", datos, "-o", `-p ${puerto} -k ${socket} -c listen_addresses=`, "-l", join(carpeta, "pg.log"), "-w", "start"],
    { stdio: "ignore" },
  );
  arriba = true;
  execFileSync(join(BIN, "createdb"), ["-h", socket, "-p", puerto, "-U", "postgres", "prueba"], { stdio: "ignore" });

  const r = spawnSync(join(BIN, "psql"), ["-h", socket, "-p", puerto, "-U", "postgres", "-d", "prueba", "-X", "-f", "scripts/pruebas/etiquetar_variantes.sql"], {
    cwd: raiz,
    encoding: "utf8",
  });
  process.stdout.write((r.stdout ?? "") + (r.stderr ?? "").replace(/^psql:[^\n]*NOTICE:  /gm, ""));
  process.exit(r.status === 0 ? 0 : 1);
} catch (e) {
  console.error("No se pudo preparar el Postgres de prueba:", e.message);
  process.exit(2);
}
