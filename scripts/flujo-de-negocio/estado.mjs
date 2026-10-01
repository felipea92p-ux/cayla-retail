#!/usr/bin/env node
/**
 * Guardar y restaurar el ESTADO de la base local — el instrumento de `/flujo-de-negocio`, no el razonamiento.
 *
 * EL PROBLEMA QUE RESUELVE. Un caso corrido desde el navegador GUARDA de verdad en el Postgres local, que es compartido
 * con otras sesiones. Las pruebas de `scripts/pruebas/` no lo notan porque terminan en ROLLBACK; una venta hecha en la
 * pantalla, no. Sin una forma de volver atrás, la primera venta de prueba cambia stock, caja y correlativos para todos, y
 * dos corridas del mismo caso dejan de ser comparables.
 *
 * QUÉ PROMETE.
 *   · `guardar`: una foto de los DATOS del schema `retail` (no del esquema: eso son las migraciones) y una huella por
 *     tabla (filas y md5 del contenido).
 *   · `comparar`: qué tablas cambiaron desde la foto. También sirve para el informe: «esto es lo que el caso escribió».
 *   · `restaurar`: todo o nada. Una sola transacción vacía `retail` y recarga la foto; si algo falla a la mitad, se revierte
 *     y la base queda como estaba. Termina comparando la huella: dice «idéntico» solo si lo es. Por defecto solo MUESTRA
 *     lo que desharía; ejecutar exige `--si`.
 * QUÉ NO PROMETE.
 *   · No toca `auth`, `public` (Dynamic: personas, sedes) ni `storage`: el seed y las sesiones abiertas siguen valiendo.
 *   · No distingue «lo que hizo el caso» de «lo que hizo otra sesión mientras corría». Restaurar deshace las dos. Por eso
 *     no se corre un caso mientras otra sesión escribe en la base local.
 *   · Solo funciona con el contenedor local (`CONTENEDOR_LOCAL`). No hay forma de apuntarlo a otra base.
 *
 * LO QUE HACE DIFÍCIL RESTAURAR, y cómo se resolvió. `retail.movimientos` es un libro inmutable A PROPÓSITO: tiene dos
 * disparadores `ENABLE ALWAYS` (no se puede UPDATE, DELETE ni TRUNCATE) y ni el modo de restauración de Postgres los salta.
 * Deshacer una venta de prueba exige apagarlos. Se hace SOLO dentro de la transacción y se vuelven a dejar en `ALWAYS`,
 * el estado exacto en que estaban (las opciones estándar de pg_restore los dejarían en `ENABLE` común y habrían cambiado el
 * esquema sin avisar). Las filas viejas se recargan idénticas, con sus mismos ids y fechas: el historial anterior a la foto
 * no cambia; solo desaparece lo escrito después. Es la excepción a «nunca DELETE en movimientos»: vale porque la base es
 * local y de prueba, y por eso este script no acepta otro destino.
 *
 * USO
 *   node scripts/flujo-de-negocio/estado.mjs guardar <nombre> [--reemplazar]
 *   node scripts/flujo-de-negocio/estado.mjs comparar <nombre>
 *   node scripts/flujo-de-negocio/estado.mjs restaurar <nombre> [--si]
 *   node scripts/flujo-de-negocio/estado.mjs listar
 * La foto vive en `.flujo-de-negocio/estado/` (fuera de git: el repo es público y la foto tiene datos de la base).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const DIR = join(RAIZ, ".flujo-de-negocio/estado");
const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const SCHEMA = "retail";
const MAX = 512 * 1024 * 1024;

const docker = (args, input) =>
  execFileSync("docker", ["exec", "-i", CONTENEDOR_LOCAL, ...args], { input, encoding: "utf8", maxBuffer: MAX, stdio: ["pipe", "pipe", "pipe"] });
/** Como superusuario: `postgres` no lo es y no puede apagar disparadores ni vaciar el libro. Solo dentro del contenedor local. */
const psql = (sql, extra = []) => docker(["psql", "-q", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", ...extra, "-f", "-"], sql).trim();

const ruta = (nombre, ext) => join(DIR, `${nombre}.${ext}`);
const validarNombre = (n) => {
  if (!n || !/^[a-z0-9-]+$/.test(n)) {
    console.error("Nombre inválido (minúsculas, números y guiones).");
    process.exit(2);
  }
};

const ultimaMigracion = () => psql("select max(version) from supabase_migrations.schema_migrations where version ~ '^[0-9]{8,}';");
const tablas = () =>
  psql(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='${SCHEMA}' and c.relkind in ('r','p') and not c.relispartition order by 1;`).split("\n").filter(Boolean);

/** Huella: filas y md5 del contenido de cada tabla, en una sola consulta. Solo tablas: las vistas se derivan de ellas. */
function huella() {
  const partes = tablas().map(
    (t) => `select '${t}', count(*), md5(coalesce(string_agg(md5(x::text), '' order by md5(x::text)), '')) from ${SCHEMA}."${t}" x`,
  );
  const filas = psql(partes.join("\nunion all\n") + ";").split("\n");
  // Ordenada por tabla: un UNION ALL no garantiza el orden de sus filas y tras una recarga puede cambiar, lo que haría
  // «distinta» una huella cuyo contenido es idéntico.
  return Object.fromEntries(
    filas.map((f) => { const [t, n, h] = f.split("|"); return [t, { n: Number(n), h }]; }).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

const diferencias = (antes, ahora) =>
  Object.keys({ ...antes, ...ahora })
    .filter((t) => antes[t]?.h !== ahora[t]?.h)
    .map((t) => ({ tabla: t, antes: antes[t]?.n ?? 0, ahora: ahora[t]?.n ?? 0 }));

function cargar(nombre) {
  validarNombre(nombre);
  if (!existsSync(ruta(nombre, "json"))) {
    console.error(`No hay una foto llamada «${nombre}». Fotos guardadas: ${listado().join(", ") || "ninguna"}.`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(ruta(nombre, "json"), "utf8"));
}
const listado = () => (existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []);

function guardar(nombre, reemplazar) {
  validarNombre(nombre);
  mkdirSync(DIR, { recursive: true });
  if (existsSync(ruta(nombre, "json")) && !reemplazar) {
    console.error(`Ya existe la foto «${nombre}». Usa --reemplazar si quieres sustituirla.`);
    process.exit(2);
  }
  const sql = docker(["pg_dump", "-U", "supabase_admin", "-d", "postgres", "--data-only", `--schema=${SCHEMA}`, "--no-owner", "--no-privileges", "-Fp"]);
  writeFileSync(ruta(nombre, "sql"), sql);
  const h = huella();
  const meta = { nombre, creada: new Date().toISOString(), ultima_migracion: ultimaMigracion(), tablas: h };
  writeFileSync(ruta(nombre, "json"), JSON.stringify(meta, null, 2));
  const filas = Object.values(h).reduce((s, x) => s + x.n, 0);
  console.log(`Foto «${nombre}» guardada: ${Object.keys(h).length} tablas, ${filas} filas, migración ${meta.ultima_migracion}.`);
}

function comparar(nombre) {
  const meta = cargar(nombre);
  const dif = diferencias(meta.tablas, huella());
  if (!dif.length) return console.log(`Idéntico a la foto «${nombre}»: ${Object.keys(meta.tablas).length} tablas, ninguna cambió.`), true;
  console.log(`Cambió ${dif.length} tabla(s) desde la foto «${nombre}»:`);
  for (const d of dif) console.log(`  ${d.tabla.padEnd(40)} ${d.antes} → ${d.ahora} filas`);
  return false;
}

function restaurar(nombre, confirmado) {
  const meta = cargar(nombre);
  const migracionHoy = ultimaMigracion();
  if (migracionHoy !== meta.ultima_migracion) {
    console.error(`No restauro: la foto es de la migración ${meta.ultima_migracion} y la base está en la ${migracionHoy}. Recargar datos de un esquema distinto los rompe.`);
    process.exit(2);
  }
  const dif = diferencias(meta.tablas, huella());
  if (!dif.length) return console.log("Nada que deshacer: la base ya es idéntica a la foto."), true;
  console.log(`${confirmado ? "Voy a deshacer" : "Desharía"} cambios en ${dif.length} tabla(s):`);
  for (const d of dif) console.log(`  ${d.tabla.padEnd(40)} ${d.ahora} → ${d.antes} filas`);
  if (!confirmado) return console.log("\nSolo mostré lo que desharía. Para ejecutarlo: agrega --si."), true;

  // Disparadores que ignoran el modo de restauración: se apagan y se dejan EXACTAMENTE como estaban.
  const siempre = psql(`select c.relname||'|'||t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='${SCHEMA}' and not t.tgisinternal and t.tgenabled='A' order by 1;`).split("\n").filter(Boolean).map((l) => l.split("|"));
  const apagar = siempre.map(([t, g]) => `alter table ${SCHEMA}."${t}" disable trigger "${g}";`).join("\n");
  const prender = siempre.map(([t, g]) => `alter table ${SCHEMA}."${t}" enable always trigger "${g}";`).join("\n");
  const lista = tablas().map((t) => `${SCHEMA}."${t}"`).join(", ");
  const guion = [
    "set local session_replication_role = replica;", // sin disparadores comunes ni chequeo de FK mientras se recarga
    apagar,
    `truncate table ${lista};`,
    readFileSync(ruta(nombre, "sql"), "utf8"),
    prender,
  ].join("\n");

  try {
    psql(guion, ["-1"]); // -1 = una sola transacción: todo o nada
  } catch (e) {
    console.error(`\nLa restauración FALLÓ y se revirtió por completo (la base quedó como estaba):\n${String(e.stderr ?? e.message).split("\n").slice(0, 6).join("\n")}`);
    process.exit(1);
  }
  const quedan = diferencias(meta.tablas, huella());
  if (quedan.length) {
    console.error(`\nRestauré, pero ${quedan.length} tabla(s) no coinciden con la foto: ${quedan.map((d) => d.tabla).join(", ")}`);
    process.exit(1);
  }
  console.log(`\nRestaurado: la base es idéntica a la foto «${nombre}» (${Object.keys(meta.tablas).length} tablas, mismas huellas).`);
  return true;
}

const [modo, nombre, ...flags] = process.argv.slice(2);
if (modo === "guardar") guardar(nombre, flags.includes("--reemplazar"));
else if (modo === "comparar") process.exit(comparar(nombre) ? 0 : 1);
else if (modo === "restaurar") process.exit(restaurar(nombre, flags.includes("--si")) ? 0 : 1);
else if (modo === "listar") console.log(listado().join("\n") || "(sin fotos)");
else if (modo === "huella") console.log(JSON.stringify(huella())); // para las pruebas: comparar con exactitud
else {
  console.error("Uso: estado.mjs guardar <nombre> [--reemplazar] | comparar <nombre> | restaurar <nombre> [--si] | listar");
  process.exit(2);
}
