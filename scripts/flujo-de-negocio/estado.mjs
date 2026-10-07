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
 * LO QUE ROMPÍA LA RESTAURACIÓN: LOS CANDADOS `CHECK ... NOT VALID` (2026-10-07). Un candado creado `NOT VALID` no revisa
 * las filas que ya existían, pero SÍ revisa toda fila que se inserta —y recargar con COPY inserta—, así que una fila vieja
 * que lo viola entraba a la base sin problema y no podía volver a entrar: «new row for relation "clientas" violates check
 * constraint "clientas_documento_formato"», y la restauración (todo o nada) se revertía siempre. No era un dato malo de la
 * foto: la migración `20260930160000_club_paso1a_venta_ligada_y_documento.sql` deja ese candado `NOT VALID` a propósito
 * cuando en la base hay fichas viejas que lo violan (aquí, el seed de antes trae una empresa con RUC como «clienta»; nunca
 * se borra ni se corrige a mano). `session_replication_role = replica` apaga disparadores y llaves foráneas, pero NO los
 * CHECK, y Postgres no tiene `disable constraint` para ellos. Hoy hay 4 candados así en `retail` (`clientas_documento_formato`,
 * `venta_items_*` ×2, `comprobantes_transmitido_tiene_entorno`); los otros 3 fallarían igual el día que una fila los viole.
 * Se resolvió como con los disparadores: SOLO dentro de la transacción, cada CHECK `NOT VALID` se suelta antes de la carga y
 * se vuelve a poner después con su MISMA definición, su mismo estado `NOT VALID` y su mismo comentario (`add constraint ...
 * not valid` no recorre la tabla). Un candado VÁLIDO no hace falta tocarlo: ninguna fila puede violarlo. Y la transacción
 * termina comparando una firma de TODOS los candados del schema (tabla, nombre, tipo, validado, definición) con la de antes
 * de empezar: si difiere en algo, lanza un error y se revierte. El esquema no cambia.
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

  // CHECK `NOT VALID`: no miran lo viejo pero sí lo que se inserta, y COPY inserta. Se sueltan y se vuelven a poner idénticos.
  // Con `search_path = ''` la definición sale totalmente calificada (el volcado también vacía el search_path al cargar).
  const noValidos = JSON.parse(psql(`set search_path = '';
    select coalesce(jsonb_agg(jsonb_build_object('tabla', c.conrelid::regclass::text, 'nombre', c.conname,
        'def', pg_get_constraintdef(c.oid), 'comentario', obj_description(c.oid, 'pg_constraint')) order by c.conrelid::regclass::text, c.conname), '[]')::text
      from pg_constraint c where c.connamespace = '${SCHEMA}'::regnamespace and c.contype = 'c' and not c.convalidated
        and c.conislocal and c.conparentid = 0;`));
  const lit = (x) => `'${String(x).replace(/'/g, "''")}'`;
  const id = (x) => `"${String(x).replace(/"/g, '""')}"`;
  const soltarChecks = noValidos.map((k) => `alter table ${k.tabla} drop constraint ${id(k.nombre)};`).join("\n");
  // pg_get_constraintdef ya termina en «NOT VALID» para estos: se vuelven a poner sin recorrer la tabla.
  const ponerChecks = noValidos
    .map((k) => `alter table ${k.tabla} add constraint ${id(k.nombre)} ${k.def};` +
      (k.comentario == null ? "" : `\ncomment on constraint ${id(k.nombre)} on ${k.tabla} is ${lit(k.comentario)};`))
    .join("\n");
  // Firma de TODOS los candados del schema; se toma antes de tocar nada y se exige igual al final, dentro de la transacción.
  const firmaCandados = `(select coalesce(md5(string_agg(concat_ws('|', c.conrelid::regclass::text, c.conname, c.contype, c.convalidated, pg_get_constraintdef(c.oid)),
      E'\\n' order by c.conrelid::regclass::text, c.conname)), '') from pg_constraint c where c.connamespace = '${SCHEMA}'::regnamespace)`;
  const guion = [
    "set local search_path = '';", // la firma de antes y la de después se leen con el mismo search_path
    `select ${firmaCandados} as firma_antes \\gset`,
    "set local session_replication_role = replica;", // sin disparadores comunes ni chequeo de FK mientras se recarga
    apagar,
    soltarChecks,
    `truncate table ${lista};`,
    readFileSync(ruta(nombre, "sql"), "utf8"),
    ponerChecks,
    prender,
    `select ${firmaCandados} = :'firma_antes' as candados_iguales \\gset`,
    "\\if :candados_iguales",
    "\\else",
    "do $$ begin raise exception 'Los candados CHECK no quedaron idénticos a como estaban: se revierte todo.'; end $$;",
    "\\endif",
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
