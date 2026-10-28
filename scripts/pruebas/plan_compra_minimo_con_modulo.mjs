#!/usr/bin/env node
/**
 * Pruebas de «Fijar un mínimo» del Plan de campaña con el módulo (ADR-0362, decisión 64) — migración
 * `20261015141000_plan_compra_minimo_con_el_modulo.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que el mínimo de una tienda lo fije quien tiene el módulo «Plan de campaña», sea o no líder (el módulo es la llave,
 * decisión 40), y que la suma de los mínimos de una campaña nunca pase de 100 % aunque dos personas los fijen a la vez: con más gente
 * que puede fijarlos, dos a la vez en tiendas distintas leían la suma vieja y las dos pasaban.
 *
 * QUÉ PRUEBA.
 *   N1 Micaela (no es líder) con SOLO «Plan de campaña» en su rol fija el mínimo de una tienda, y queda firmado por ella.
 *   N2 Con un rol sin el módulo (solo Proveedores), 42501 que nombra el Plan de campaña (`plan_compra_sin_modulo`).
 *   N3 El líder, como siempre.
 *   N4 Para quien tiene el módulo sigue valiendo la suma: 60 % + 50 % se rechaza («sumarían 110 %»).
 *   F  La forma: la función ya no pregunta si es líder, sigue pidiendo el módulo, bloquea el plan, hay una sola con ese nombre,
 *      `authenticated` la ejecuta y `anon` no.
 *   C1 DOS A LA VEZ (con COMMIT, sobre un plan de prueba que se borra al final): A fija 60 % en una tienda y tarda en confirmar; B fija
 *      60 % en otra en ese momento. B espera a A, ve su mínimo y se rechaza: la campaña queda en 60 %, nunca en 120 %. Sin el bloqueo,
 *      las dos pasaban. Este caso necesita la migración aplicada en la base (en el CI lo está).
 *   Los casos N y F corren en su transacción con ROLLBACK y cargan la migración dos veces (así se prueba que se puede volver a pegar).
 *
 * USO
 *   pnpm pruebas:plan-compra-minimo                              → contra la base `postgres` del stack local
 *   pnpm pruebas:plan-compra-minimo --contenedor supabase_db_x   → contra otro stack (un banco de pruebas propio)
 *   pnpm pruebas:plan-compra-minimo --sin-migracion              → sin cargar la migración: contra una base sin el cambio, la prueba
 *                                                                   tiene que FALLAR (así se ve que vigila algo)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const SIN_MIGRACION = process.argv.includes("--sin-migracion");
const MIGRACION = SIN_MIGRACION
  ? ""
  : readFileSync(join(RAIZ, "supabase", "migrations", "20261015141000_plan_compra_minimo_con_el_modulo.sql"), "utf8")
      .replace(/^set lock_timeout.*$/m, "")
      .replace(/^reset lock_timeout;$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\nset local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text; v_pista text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text, v_pista = pg_exception_hint;
  return v_estado || '|' || v_msg || '|' || coalesce(v_pista, '');
end;
$f$;
grant execute on function pg_temp.intento(text) to authenticated;
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Prueba decisión 64', current_date, current_date + 30) returning id as plan \\gset
select id as lima from retail.ubicaciones where nombre = 'Tienda Lima' \\gset
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
`;

// Micaela con un rol de prueba (sin clave, como los roles a medida) que ve SOLO esos módulos. Se va con el ROLLBACK.
const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Prueba decisión 64') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;

let casos = 0;
let fallas = 0;
function anotar(nombre, ok, esperado, obtenido) {
  casos++;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  }
}
function caso(nombre, sql, esperado) {
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).at(-1);
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").slice(0, 4).join(" ")}`;
  }
  anotar(nombre, obtenido === esperado, esperado, obtenido);
}

const MINIMO = (tienda, pct) => `pg_temp.intento(format('select retail.guardar_plan_compra_minimo(%L, %L, ${pct})', :'plan', :'${tienda}'))`;

// N. QUIÉN LO FIJA ------------------------------------------------------------------------------------------------------
caso(
  "N1 Micaela (no es líder) con solo «Plan de campaña» fija el mínimo de Lima, y queda firmado por ella",
  `${rolDeMicaela("plan_compra")}
   ${como(MICAELA)}
   select ${MINIMO("lima", 20)} as r \\gset
   reset role;
   select concat_ws(',', :'r', (select minimo_pct from retail.planes_compra_reparto where plan_id = :'plan' and ubicacion_id = :'lima'),
     (select actualizado_por = :'micaela' from retail.planes_compra_reparto where plan_id = :'plan' and ubicacion_id = :'lima'));`,
  "SIN_ERROR,20,t"
);
caso(
  "N2 con un rol sin el módulo (solo Proveedores), 42501 que nombra el Plan de campaña",
  `${rolDeMicaela("proveedores")}
   ${como(MICAELA)}
   select concat_ws(',', split_part(${MINIMO("lima", 20)}, '|', 1), split_part(${MINIMO("lima", 20)}, '|', 3));`,
  "42501,plan_compra_sin_modulo"
);
caso(
  "N3 el líder, como siempre",
  `${como(FELIPE)}
   select ${MINIMO("tru", 15)} as r \\gset
   reset role;
   select concat_ws(',', :'r', (select minimo_pct from retail.planes_compra_reparto where plan_id = :'plan' and ubicacion_id = :'tru'));`,
  "SIN_ERROR,15"
);
caso(
  "N4 para quien tiene el módulo sigue valiendo la suma: 60 % + 50 % se rechaza",
  `${rolDeMicaela("plan_compra")}
   ${como(MICAELA)}
   select ${MINIMO("tru", 60)} as primero \\gset
   select split_part(${MINIMO("lima", 50)}, '|', 2) as segundo \\gset
   select concat_ws(',', :'primero', :'segundo');`,
  "SIN_ERROR,Los mínimos de las tiendas sumarían 110 %: no pueden pasar de 100 %."
);

// F. LA FORMA -----------------------------------------------------------------------------------------------------------
caso(
  "F  ya no pregunta si es líder, sigue pidiendo el módulo, bloquea el plan; una sola función; authenticated sí, anon no",
  `select concat_ws(',',
     position('fn_es_lider' in pg_get_functiondef('retail.guardar_plan_compra_minimo(uuid, uuid, integer)'::regprocedure)) = 0,
     position('fn_ve_modulo(''plan_compra'')' in pg_get_functiondef('retail.guardar_plan_compra_minimo(uuid, uuid, integer)'::regprocedure)) > 0,
     position('for update' in pg_get_functiondef('retail.guardar_plan_compra_minimo(uuid, uuid, integer)'::regprocedure)) > 0,
     (select count(*) from pg_proc p where p.pronamespace = 'retail'::regnamespace and p.proname = 'guardar_plan_compra_minimo'),
     has_function_privilege('authenticated', 'retail.guardar_plan_compra_minimo(uuid, uuid, integer)', 'execute'),
     has_function_privilege('anon', 'retail.guardar_plan_compra_minimo(uuid, uuid, integer)', 'execute'));`,
  "t,t,t,1,t,f"
);

// C. DOS A LA VEZ (con COMMIT) --------------------------------------------------------------------------------------------
function sesion(sql) {
  return new Promise((resolver) => {
    const p = spawn("docker", PSQL, { stdio: ["pipe", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    p.stdout.on("data", (d) => (salida += d));
    p.stderr.on("data", (d) => (error += d));
    p.on("close", (codigo) => resolver({ codigo, salida: salida.trim(), error: error.trim() }));
    p.stdin.end(sql);
  });
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function dosALaVez() {
  const preparar = psql(`
    insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Prueba decisión 64 · dos a la vez', current_date, current_date + 30) returning id;
  `).trim().split("\n").filter(Boolean)[0];
  const plan = preparar.split("|")[0];
  const tiendas = psql(`select (select id from retail.ubicaciones where nombre = 'Tienda Lima') || '|' || (select id from retail.ubicaciones where nombre = 'Tienda Trujillo');`).trim();
  const [lima, tru] = tiendas.split("|");
  const llamada = (tienda) => `
    begin;
    set local search_path = retail, public, extensions;
    ${como(FELIPE)}
    select retail.guardar_plan_compra_minimo('${plan}', '${tienda}', 60);`;
  try {
    // A fija 60 % en Lima y tarda 2 s en confirmar; B, que empieza en ese momento, fija 60 % en Trujillo.
    const a = sesion(`${llamada(lima)}\nselect pg_sleep(2);\ncommit;`);
    await espera(700);
    const b = sesion(`${llamada(tru)}\ncommit;`);
    const [ra, rb] = await Promise.all([a, b]);
    const suma = psql(`select coalesce(sum(minimo_pct), 0) from retail.planes_compra_reparto where plan_id = '${plan}';`).trim();
    const obtenido = `A=${ra.codigo === 0 ? "ok" : "error"}, B=${rb.codigo === 0 ? "ok" : /sumar[ií]an 120/.test(rb.error) ? "rechazada por la suma" : `error: ${rb.error.split("\n")[0]}`}, suma=${suma}`;
    const esperado = "A=ok, B=rechazada por la suma, suma=60";
    anotar("C1 dos personas a la vez en tiendas distintas: la segunda espera, ve el mínimo de la primera y se rechaza", obtenido === esperado, esperado, obtenido);
  } finally {
    psql(`delete from retail.planes_compra_reparto where plan_id = '${plan}'; delete from retail.planes_compra where id = '${plan}';`);
  }
}

await dosALaVez();

console.log(`\n${casos - fallas}/${casos} pruebas en verde.`);
if (fallas > 0) process.exit(1);
