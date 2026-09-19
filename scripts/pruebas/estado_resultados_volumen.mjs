#!/usr/bin/env node
/**
 * Mide cuánto tarda el Estado de Resultados con tres años de historia simulada (ver el .sql).
 * Postgres EFÍMERO, sin Docker. Uso: node scripts/pruebas/estado_resultados_volumen.mjs
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
process.env.LC_ALL = "en_US.UTF-8";
const carpeta = mkdtempSync(join(tmpdir(), "pg-volumen-"));
const datos = join(carpeta, "datos");
const puerto = String(55000 + Math.floor(Math.random() * 900));
let arriba = false;
process.on("exit", () => {
  if (arriba) spawnSync(join(BIN, "pg_ctl"), ["-D", datos, "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(carpeta, { recursive: true, force: true });
});
try {
  execFileSync(join(BIN, "initdb"), ["-D", datos, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  execFileSync(join(BIN, "pg_ctl"), ["-D", datos, "-o", `-p ${puerto} -k ${carpeta} -c listen_addresses=`, "-l", join(carpeta, "pg.log"), "-w", "start"], { stdio: "ignore" });
  arriba = true;
  execFileSync(join(BIN, "createdb"), ["-h", carpeta, "-p", puerto, "-U", "postgres", "volumen"], { stdio: "ignore" });
  const r = spawnSync(
    join(BIN, "psql"),
    ["-h", carpeta, "-p", puerto, "-U", "postgres", "-d", "volumen", "-X", "-q", "-A", "-v", "ON_ERROR_STOP=1",
     "-v", "m1=supabase/migrations/20260918195000_cuentas_y_parametros_tributarios.sql",
     "-v", "m2=supabase/migrations/20260918196000_fn_asientos.sql",
     "-v", "m3=supabase/migrations/20260918197000_fn_estado_resultados.sql",
     "-f", "scripts/pruebas/estado_resultados_volumen.sql"],
    { cwd: raiz, encoding: "utf8" },
  );
  const limpio = (r.stdout ?? "").split("\n").filter((l) => /^(filas|---|Estado|Diario|Time:)|^\d/.test(l) || l.includes("volumen") || l.includes("filas:"));
  console.log(limpio.join("\n"));
  if (r.status !== 0) console.error((r.stderr ?? "").split("\n").filter((l) => /ERROR/.test(l)).join("\n"));
  process.exit(r.status === 0 ? 0 : 1);
} catch (e) {
  console.error("No se pudo preparar el Postgres:", e.message);
  process.exit(2);
}
