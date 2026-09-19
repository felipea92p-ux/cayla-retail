#!/usr/bin/env node
/**
 * Prueba de gastos (ADR-0117) contra un Postgres EFÍMERO, con MUTACIONES.
 *
 * Corre `gastos_aislado.sql` una vez sobre la migración real (debe pasar) y luego sobre
 * versiones mutiladas de esa migración, cada una SIN un candado distinto (deben FALLAR).
 * Una prueba que nunca puede fallar no prueba nada: si un mutante sobrevive, ese candado
 * no está cubierto y este script sale con error.
 *
 * Levanta su propio cluster en una carpeta temporal (mismo patrón que `etiquetar_variantes.mjs`):
 * no necesita Docker ni toca ninguna base compartida. Requiere los binarios de Postgres
 * (`brew install postgresql@16`). No es vitest: `pnpm test` corre en CI sin Postgres.
 *
 *     node scripts/pruebas/gastos_aislado.mjs
 */
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRACION = join(raiz, "supabase/migrations/20260918193000_gastos.sql");
const PRUEBA = "scripts/pruebas/gastos_aislado.sql";

const BIN = ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/bin", "/usr/local/bin"].find((d) => existsSync(join(d, "initdb")));
if (!BIN) {
  console.error("No encuentro initdb. Instala Postgres: brew install postgresql@16");
  process.exit(2);
}
process.env.LC_ALL = "en_US.UTF-8";

// Cada mutante quita UN candado. `quitar` recibe el texto de la migración y devuelve el mutado;
// si no cambia nada, el script se detiene (el patrón dejó de coincidir: hay que actualizarlo).
const MUTANTES = [
  {
    nombre: "sin índice único (un egreso podría respaldar dos gastos)",
    quitar: (t) => t.replace(/create unique index gastos_egreso_vigente_uq[\s\S]*?;\n/, ""),
  },
  {
    nombre: "sin check efectivo⇔egreso",
    quitar: (t) => t.replace("check ((medio_pago = 'efectivo') = (caja_movimiento_id is not null))", "check (true)"),
  },
  {
    nombre: "sin trigger que impide editar/borrar gastos",
    quitar: (t) => t.replace(/create trigger gastos_solo_anular[\s\S]*?;\n/, ""),
  },
  {
    nombre: "permisos de escritura abiertos a authenticated",
    quitar: (t) =>
      t.replace(
        "grant select on retail.categorias_gasto, retail.gastos, retail.egresos_no_gasto to authenticated;",
        "grant select, insert, update, delete on retail.categorias_gasto, retail.gastos, retail.egresos_no_gasto to authenticated;",
      ),
  },
  {
    nombre: "sin validar que el monto coincida con el egreso",
    quitar: (t) => t.replace(/  if v_mov\.monto <> new\.monto_total then[\s\S]*?  end if;\n/, ""),
  },
  {
    nombre: "registrar_gasto sin exigir líder",
    quitar: (t) =>
      t.replace(
        "if not retail.fn_es_lider() then\n    raise exception 'Solo un líder de equipo puede registrar gastos';",
        "if false then\n    raise exception 'Solo un líder de equipo puede registrar gastos';",
      ),
  },
  {
    nombre: "el resumen cuenta también los gastos anulados",
    quitar: (t) => t.replace("where g.estado = 'vigente' and g.fecha between p_desde and p_hasta", "where g.fecha between p_desde and p_hasta"),
  },
  {
    nombre: "un gasto puede señalar un egreso marcado «no es gasto»",
    quitar: (t) =>
      t.replace(
        /  if exists \(select 1 from retail\.egresos_no_gasto e\n\s+where e\.caja_movimiento_id = new\.caja_movimiento_id and e\.revertido_en is null\) then/,
        "  if false then",
      ),
  },
  {
    nombre: "sin candado de concurrencia entre «clasificar» y «marcar no es gasto»",
    quitar: (t) => t.replace(/  perform pg_advisory_xact_lock\([^\n]*\n/g, ""),
    // Pasa la prueba secuencial: solo lo delata la prueba con dos sesiones (concurrencia).
  },
  {
    nombre: "se puede marcar «no es gasto» un egreso que ya es gasto",
    quitar: (t) =>
      t.replace(
        /  if exists \(select 1 from retail\.gastos g\n\s+where g\.caja_movimiento_id = new\.caja_movimiento_id and g\.estado = 'vigente'\) then/,
        "  if false then",
      ),
  },
];

const carpeta = mkdtempSync(join(tmpdir(), "pg-gastos-"));
const datos = join(carpeta, "datos");
const puerto = String(55000 + Math.floor(Math.random() * 900));
let arriba = false;
function limpiar() {
  if (arriba) spawnSync(join(BIN, "pg_ctl"), ["-D", datos, "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(carpeta, { recursive: true, force: true });
}
process.on("exit", limpiar);

const IDENT = "select set_config('test.lider','true',false), set_config('test.uid','ffffffff-0000-4000-8000-00000000000a',false);";
const M6 = "'eeeeeeee-0000-4000-8000-000000000006'";

/**
 * Dos líderes sobre el MISMO egreso a la vez: A lo marca «no es gasto» y tarda en confirmar; B,
 * mientras tanto, lo clasifica como gasto. Sin el candado por egreso, B no ve la marca (aún no
 * confirmada) y las dos pasan: el egreso queda gasto Y «no es gasto». Con el candado, B espera a A,
 * ve la marca y es rechazado. Devuelve true si el estado final es coherente.
 */
async function concurrenciaCoherente(base) {
  const args = ["-h", carpeta, "-p", puerto, "-U", "postgres", "-d", base, "-X", "-q", "-t", "-A"];
  const A = spawn(join(BIN, "psql"), args, { cwd: raiz });
  A.stdin.end(`${IDENT}\nbegin;\nselect retail.marcar_egreso_no_gasto(${M6}, 'concurrencia');\nselect pg_sleep(2);\ncommit;\n`);
  const terminoA = new Promise((res) => A.on("close", res));
  await new Promise((r) => setTimeout(r, 700));
  pg("psql", args, { input: `${IDENT}\nselect public.g(public.k_aqp(), 'efectivo', 10, p_mov => ${M6});\n` });
  await terminoA;
  const r = pg("psql", args, {
    input: `select (select count(*) from retail.gastos where caja_movimiento_id = ${M6} and estado = 'vigente') + (select count(*) from retail.egresos_no_gasto where caja_movimiento_id = ${M6} and revertido_en is null);\n`,
  });
  return r.stdout.trim() === "1";
}

const pg = (bin, args, opts = {}) => spawnSync(join(BIN, bin), args, { encoding: "utf8", cwd: raiz, ...opts });

function correr(nombreBase, rutaMigracion) {
  execFileSync(join(BIN, "createdb"), ["-h", carpeta, "-p", puerto, "-U", "postgres", nombreBase], { stdio: "ignore" });
  const r = pg("psql", [
    "-h", carpeta, "-p", puerto, "-U", "postgres", "-d", nombreBase, "-X", "-q", "-t", "-A",
    "-v", "ON_ERROR_STOP=1", "-v", `migracion=${rutaMigracion}`, "-f", PRUEBA,
  ]);
  return { ok: r.status === 0, salida: (r.stdout ?? "") + (r.stderr ?? "").replace(/^psql:[^\n]*NOTICE:  /gm, "") };
}

try {
  execFileSync(join(BIN, "initdb"), ["-D", datos, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  execFileSync(join(BIN, "pg_ctl"), ["-D", datos, "-o", `-p ${puerto} -k ${carpeta} -c listen_addresses=`, "-l", join(carpeta, "pg.log"), "-w", "start"], { stdio: "ignore" });
  arriba = true;

  const original = readFileSync(MIGRACION, "utf8");

  // 1. La migración real: TODO debe pasar.
  const limpia = correr("limpia", MIGRACION);
  const total = limpia.salida.match(/TOTAL DE VERIFICACIONES OK: (\d+)/)?.[1];
  if (!limpia.ok || !total) {
    console.log(limpia.salida);
    console.error("\n✗ La prueba FALLA sobre la migración real.");
    process.exit(1);
  }
  console.log(`✓ Migración real: ${total} verificaciones ok.`);
  if (!(await concurrenciaCoherente("limpia"))) {
    console.error("✗ Concurrencia: el mismo egreso quedó a la vez gasto y «no es gasto».");
    process.exit(1);
  }
  console.log("✓ Concurrencia (dos sesiones sobre el mismo egreso): un solo destino.\n");

  // 2. Los mutantes: TODOS deben fallar.
  let sobrevivieron = 0;
  for (const [i, m] of MUTANTES.entries()) {
    const mutado = m.quitar(original);
    if (mutado === original) {
      console.error(`✗ El mutante «${m.nombre}» no cambió nada: el patrón ya no coincide con la migración.`);
      process.exit(2);
    }
    const ruta = join(carpeta, `mutante_${i}.sql`);
    writeFileSync(ruta, mutado);
    const r = correr(`mutante_${i}`, ruta);
    let detectado = !r.ok;
    let como = r.salida.split("\n").find((l) => l.includes("FALLÓ") || l.includes("ERROR"))?.trim().slice(0, 150) ?? "(sin mensaje)";
    if (r.ok && !(await concurrenciaCoherente(`mutante_${i}`))) {
      detectado = true;
      como = "prueba de concurrencia: el egreso quedó gasto Y «no es gasto»";
    }
    if (detectado) {
      console.log(`✓ cae: ${m.nombre}\n    → ${como}`);
    } else {
      sobrevivieron++;
      console.log(`✗ SOBREVIVIÓ: ${m.nombre}\n    → esa parte del diseño NO está cubierta por la prueba`);
    }
  }

  console.log(`\n${MUTANTES.length - sobrevivieron}/${MUTANTES.length} mutantes detectados.`);
  process.exit(sobrevivieron === 0 ? 0 : 1);
} catch (e) {
  console.error("No se pudo preparar el Postgres de prueba:", e.message);
  process.exit(2);
}
