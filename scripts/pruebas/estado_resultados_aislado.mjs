#!/usr/bin/env node
/**
 * Prueba del Estado de Resultados (ADR-0109 / ADR-0120) contra un Postgres EFÍMERO, con MUTACIONES.
 *
 * Corre `estado_resultados_aislado.sql` sobre las tres migraciones reales (debe pasar) y luego sobre
 * versiones mutiladas, cada una SIN una regla o un candado distinto (deben FALLAR). Una prueba que
 * nunca puede fallar no prueba nada: si un mutante sobrevive, esa regla no está cubierta.
 *
 * Levanta su propio cluster en una carpeta temporal (mismo patrón que `gastos_aislado.mjs`): no
 * necesita Docker ni toca ninguna base compartida. Requiere los binarios de Postgres
 * (`brew install postgresql@16`). No es vitest: `pnpm test` corre en CI sin Postgres.
 *
 *     node scripts/pruebas/estado_resultados_aislado.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARCHIVOS = {
  m1: join(raiz, "supabase/migrations/20260918195000_cuentas_y_parametros_tributarios.sql"),
  m2: join(raiz, "supabase/migrations/20260918196000_fn_asientos.sql"),
  m3: join(raiz, "supabase/migrations/20260918197000_fn_estado_resultados.sql"),
};
const PRUEBA = "scripts/pruebas/estado_resultados_aislado.sql";

const BIN = ["/opt/homebrew/opt/postgresql@16/bin", "/opt/homebrew/bin", "/usr/local/bin"].find((d) => existsSync(join(d, "initdb")));
if (!BIN) {
  console.error("No encuentro initdb. Instala Postgres: brew install postgresql@16");
  process.exit(2);
}
process.env.LC_ALL = "en_US.UTF-8";

// Cada mutante quita UNA regla. `en` dice qué migración toca; `quitar` devuelve el texto mutado.
// Si no cambia nada, el script se detiene (el patrón dejó de coincidir: hay que actualizarlo).
const MUTANTES = [
  {
    nombre: "los límites del mes en UTC en vez de hora de Lima",
    en: "m2",
    quitar: (t) => t.replace("v_ini := (p_desde::timestamp at time zone 'America/Lima');", "v_ini := p_desde::timestamptz;").replace("v_fin := ((p_hasta + 1)::timestamp at time zone 'America/Lima');", "v_fin := (p_hasta + 1)::timestamptz;"),
  },
  {
    nombre: "IGV sin redondear primero (no cuadra al centavo con el comprobante)",
    en: "m2",
    quitar: (t) => t.replaceAll("round(vt.tot - vt.tot / (1 + retail.fn_tasa_igv(vt.f)), 2)", "(vt.tot - vt.tot / (1 + retail.fn_tasa_igv(vt.f)))"),
  },
  {
    nombre: "la anulación se asienta en el mes de la VENTA, no en el del hecho",
    en: "m2",
    quitar: (t) => t.replace("where v.estado = 'anulada' and v.anulado_en >= v_ini and v.anulado_en < v_fin", "where v.estado = 'anulada' and v.created_at >= v_ini and v.created_at < v_fin"),
  },
  {
    nombre: "una anulación de prenda no vendible NO pasa a merma",
    en: "m2",
    quitar: (t) => t.replace("coalesce(ai.condicion, 'vendible') <> 'vendible'), 0) as costo_mal", "coalesce(ai.condicion, 'vendible') = 'zzz'), 0) as costo_mal"),
  },
  {
    nombre: "devolver al proveedor cuenta como merma",
    en: "m2",
    quitar: (t) => t.replace("'cuarentena_se_boto', 'cuarentena_donada'))", "'cuarentena_se_boto', 'cuarentena_donada', 'cuarentena_devuelta_proveedor'))"),
  },
  {
    nombre: "la merma se valoriza al costo ACTUAL en vez del costo de esa fecha",
    en: "m2",
    quitar: (t) => t.replace(/  select coalesce\(\n    \(select h\.costo_resultante[\s\S]*?    0\)\n/, "  select coalesce((select v.costo from retail.variantes v where v.id = p_variante_id), 0)\n"),
  },
  {
    nombre: "los gastos anulados también asientan",
    en: "m2",
    quitar: (t) => t.replaceAll("where g.estado = 'vigente' and g.fecha between", "where g.fecha between"),
  },
  {
    nombre: "la devolución se valora por reembolso_monto (libre, puede ser NULL)",
    en: "m2",
    quitar: (t) => t.replace("sum((vi.precio_unitario - vi.descuento_unitario) * di.cantidad) as tot", "coalesce(max(d.reembolso_monto), 0) as tot"),
  },
  {
    nombre: "una devolución pendiente o rechazada también asienta",
    en: "m2",
    quitar: (t) => t.replace("where d.estado = 'aprobada' and d.aprobado_en", "where d.estado in ('aprobada', 'pendiente', 'rechazada') and d.aprobado_en is not null and d.aprobado_en"),
  },
  {
    nombre: "el consolidado no incluye «De la empresa»",
    en: "m3",
    quitar: (t) => t.replace("      from filas f\n  )\n  select z.id", "      from filas f where f.id is not null\n  )\n  select z.id"),
  },
  {
    nombre: "el Estado de Resultados no exige líder",
    en: "m3",
    quitar: (t) => t.replace("if not retail.fn_es_lider() then\n    raise exception 'Solo un líder de equipo puede ver el Estado de Resultados';", "if false then\n    raise exception 'Solo un líder de equipo puede ver el Estado de Resultados';"),
  },
  {
    nombre: "el diario no exige líder",
    en: "m2",
    quitar: (t) => t.replace("if not retail.fn_es_lider() then\n    raise exception 'Solo un líder de equipo puede ver el diario contable';\n  end if;\n  if p_desde", "if false then\n    raise exception 'Solo un líder de equipo puede ver el diario contable';\n  end if;\n  if p_desde"),
  },
  {
    nombre: "los parámetros tributarios se pueden editar",
    en: "m1",
    quitar: (t) => t.replace(/create trigger parametros_tributarios_solo_agregar[\s\S]*?;\n/, ""),
  },
  {
    nombre: "permisos de escritura abiertos sobre el plan de cuentas",
    en: "m1",
    quitar: (t) => t.replace("grant select on retail.cuentas, retail.parametros_tributarios to authenticated;", "grant select, insert, update, delete on retail.cuentas, retail.parametros_tributarios to authenticated;"),
  },
  {
    nombre: "una categoría de gasto puede apuntar a una cuenta que no existe",
    en: "m1",
    quitar: (t) => t.replace(/alter table retail\.categorias_gasto\n  add constraint categorias_gasto_cuenta_fkey[^;]*;\n/, ""),
  },
];

const carpeta = mkdtempSync(join(tmpdir(), "pg-resultados-"));
const datos = join(carpeta, "datos");
const puerto = String(55000 + Math.floor(Math.random() * 900));
let arriba = false;
function limpiar() {
  if (arriba) spawnSync(join(BIN, "pg_ctl"), ["-D", datos, "-m", "immediate", "stop"], { stdio: "ignore" });
  rmSync(carpeta, { recursive: true, force: true });
}
process.on("exit", limpiar);

const pg = (bin, args, opts = {}) => spawnSync(join(BIN, bin), args, { encoding: "utf8", cwd: raiz, ...opts });

function correr(nombreBase, rutas) {
  execFileSync(join(BIN, "createdb"), ["-h", carpeta, "-p", puerto, "-U", "postgres", nombreBase], { stdio: "ignore" });
  const r = pg("psql", [
    "-h", carpeta, "-p", puerto, "-U", "postgres", "-d", nombreBase, "-X", "-q", "-t", "-A",
    "-v", "ON_ERROR_STOP=1", "-v", `m1=${rutas.m1}`, "-v", `m2=${rutas.m2}`, "-v", `m3=${rutas.m3}`, "-f", PRUEBA,
  ]);
  return { ok: r.status === 0, salida: (r.stdout ?? "") + (r.stderr ?? "").replace(/^psql:[^\n]*NOTICE:  /gm, "") };
}

try {
  execFileSync(join(BIN, "initdb"), ["-D", datos, "-A", "trust", "-U", "postgres", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  execFileSync(join(BIN, "pg_ctl"), ["-D", datos, "-o", `-p ${puerto} -k ${carpeta} -c listen_addresses=`, "-l", join(carpeta, "pg.log"), "-w", "start"], { stdio: "ignore" });
  arriba = true;

  const original = Object.fromEntries(Object.entries(ARCHIVOS).map(([k, ruta]) => [k, readFileSync(ruta, "utf8")]));

  const limpia = correr("limpia", ARCHIVOS);
  const total = limpia.salida.match(/TOTAL DE VERIFICACIONES OK: (\d+)/)?.[1];
  if (!limpia.ok || !total) {
    console.log(limpia.salida);
    console.error("\n✗ La prueba FALLA sobre las migraciones reales.");
    process.exit(1);
  }
  console.log(`✓ Migraciones reales: ${total} verificaciones ok.\n`);

  let sobrevivieron = 0;
  for (const [i, m] of MUTANTES.entries()) {
    const mutado = m.quitar(original[m.en]);
    if (mutado === original[m.en]) {
      console.error(`✗ El mutante «${m.nombre}» no cambió nada: el patrón ya no coincide con la migración.`);
      process.exit(2);
    }
    const ruta = join(carpeta, `mutante_${i}.sql`);
    writeFileSync(ruta, mutado);
    const r = correr(`mutante_${i}`, { ...ARCHIVOS, [m.en]: ruta });
    const como = r.salida.split("\n").find((l) => l.includes("FALLÓ") || l.includes("ERROR"))?.trim().slice(0, 160) ?? "(sin mensaje)";
    if (!r.ok) console.log(`✓ cae: ${m.nombre}\n    → ${como}`);
    else {
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
