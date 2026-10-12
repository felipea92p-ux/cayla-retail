#!/usr/bin/env node
/**
 * Lo que el CI hace con las migraciones de un PR (`scripts/migraciones/huellas-del-pr.mjs`), de punta a punta, contra el
 * Postgres del stack local (ADR-0251, act. 2026-10-12).
 *
 * EL PROBLEMA. El paso `supabase` del CI aparta las migraciones de un PR, las aplica una por una tomando huellas y las
 * devuelve a su carpeta. Ese camino solo corre de verdad en un PR que trae migraciones: si se rompiera, lo vería recién
 * el próximo PR con SQL, en rojo por algo que no es suyo. Esta prueba lo recorre en cada corrida.
 *
 * PROMETE (sale con 1 si algo no se cumple): las pruebas de `huellas-del-pr.test.mjs`, incluidas las de punta a punta, que
 * aquí NO se saltan. Corren en una base APARTE del mismo Postgres (`huellas_prueba`, se crea de nuevo y se borra al
 * final): la base de las demás pruebas no se toca, y da igual en qué tanda caiga.
 * USO: pnpm pruebas:huellas-del-pr   (necesita el stack local: `npx supabase start`)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTENEDOR = "supabase_db_cayla-retail";
// La ruta del docker de verdad: la prueba arma un `docker` falso que le manda los psql a esta base.
const DOCKER = execFileSync("sh", ["-c", "command -v docker"], { encoding: "utf8" }).trim();
const base = (orden) => execFileSync(DOCKER, ["exec", CONTENEDOR, "psql", "-U", "postgres", "-q", "-v", "ON_ERROR_STOP=1", "-c", orden], { stdio: "inherit" });

base("drop database if exists huellas_prueba");
base("create database huellas_prueba");
const r = spawnSync(process.execPath, ["--test", join(RAIZ, "scripts", "migraciones", "huellas-del-pr.test.mjs")], {
  stdio: "inherit",
  env: { ...process.env, HUELLAS_PSQL: `${DOCKER} exec -i ${CONTENEDOR} psql -U postgres -d huellas_prueba`, HUELLAS_EXIGIR: "1" },
});
base("drop database if exists huellas_prueba");
process.exit(r.status ?? 1);
