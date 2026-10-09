#!/usr/bin/env node
/**
 * Pruebas de la vara de CAYLA como respaldo de Frescura del piso (ADR-0208, actualización 2026-10-07; migración
 * `20261008120000_frescura_vara_cayla.sql`) — CAYLA V2.
 *
 * QUÉ PRUEBA.
 *   · LA ESCRITURA. Solo la llave de servicio guarda (`guardar_frescura_vara_cayla`): el líder recibe 42501 y sin claims (psql
 *     directo, `auth.role()` null) también. Reemplaza la foto entera: la categoría que una corrida no trae sale, la que trae se
 *     pisa; una corrida vacía no toca nada. El esquema niega una ventana que no es de la vara, más vendidas que unidades y un
 *     nivel inventado (23514), y una fila sin categoría (22023).
 *   · LA LECTURA. El líder lee la vara con sus cifras y sus observaciones (`fn_frescura_vara_cayla`); una cuenta de afuera
 *     recibe la pista `frescura_sin_permiso`, nunca cero filas; la tabla no se lee directo, ni el líder.
 *   · EL PARCHE. `fn_frescura_sede` deja pasar a la llave de servicio (el cron lee Trujillo sin persona) y sigue cerrada sin
 *     claims y para una cuenta de afuera; su cuerpo queda con uno de los dos md5 calculados. Re-pegar la migración es inofensivo.
 *
 * CÓMO. Mismo patrón que `capacidad_piso.mjs`: cada caso en su transacción con ROLLBACK (la base local la comparten varias
 * sesiones); la cuenta de afuera se crea DENTRO del caso. La sesión se simula con `request.jwt.claim.*` (lo que PostgREST hace
 * con cada petición); la llave de servicio, como en `sunat_reintento_por_cron.mjs` (`set local role service_role`).
 *
 * USO
 *   pnpm pruebas:frescura-vara-cayla              → contra la base `postgres` del stack local (la del CI)
 *   … --base otra                                 → contra otra base del mismo contenedor
 *   … --en-seco                                   → carga la migración dentro de cada caso (base sin ella)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const EN_SECO = process.argv.includes("--en-seco");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261008120000_frescura_vara_cayla.sql"), "utf8");

// Seed local: Felipe (líder).
const FELIPE = "22222222-2222-4222-8222-000000000001";
// Creada en cada caso: cuenta de Auth sin persona, sin colaborador, sin terminal.
const AFUERA = "33333333-3333-4333-8333-0000000000d2";

const MD5_DESPUES = ["2b9fde71c6e4ff7a55ca4f45e8a19935", "6ac58e3c841a724dc1ae4853d805ccf0"];

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] }
  );
}

function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

/** Todo lo que un caso necesita, dentro de su transacción. */
const PRELUDIO = `
begin;
${EN_SECO ? MIGRACION : ""}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
select id as tru from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
select id as cat1 from retail.categorias order by nombre limit 1 \\gset
select id as cat2 from retail.categorias order by nombre offset 1 limit 1 \\gset
insert into auth.users (id, aud, role, email) values ('${AFUERA}', 'authenticated', 'authenticated', 'afuera-vara@prueba.local');
`;

// Las tres sesiones. Las tres variables se fijan siempre: una que quede de la sesión anterior del mismo caso mentiría.
const como = (auth) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claim.role = 'authenticated';\n` +
  `set local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;
const COMO_CRON = `set local role service_role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claim.role = 'service_role';\n` +
  `set local request.jwt.claims = '{"role":"service_role"}';\n`;
const SIN_CLAIMS = `reset role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claim.role = '';\nset local request.jwt.claims = '';\n`;

let fallas = 0;
let casos = 0;
function registrar(nombre, obtenido, esperado) {
  casos++;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  const obtenido = r.ok ? r.salida : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  registrar(nombre, obtenido, esperado);
}

/** Una fila para guardar, con la categoría leída de la base (`:'cat1'`, `:'cat2'`). */
const fila = (cat, extra = {}) => {
  const f = { tiendas: 3, ventana_dias: 60, vendidas: 28, unidades: 31, nivel: "solido", observaciones: [[86400, 1, 1], [864000, 0, 2]], ...extra };
  return `jsonb_build_object('categoria_id', :'${cat}', 'tiendas', ${f.tiendas}, 'ventana_dias', ${f.ventana_dias}, 'vendidas', ${f.vendidas}, 'unidades', ${f.unidades}, 'nivel', ${f.nivel === null ? "null" : `'${f.nivel}'`}, 'observaciones', '${JSON.stringify(f.observaciones)}'::jsonb)`;
};
const guardar = (...filas) => `select retail.guardar_frescura_vara_cayla(jsonb_build_array(${filas.join(", ")})) ->> 'filas';`;
const guardarVacio = `select retail.guardar_frescura_vara_cayla('[]'::jsonb) ->> 'filas';`;
// `%L::jsonb`: el valor jsonb viaja como literal entre comillas dentro del texto que `intento` ejecuta (con `%s` iría sin comillas).
const intentoGuardar = (...filas) => `select split_part(pg_temp.intento(format('select retail.guardar_frescura_vara_cayla(jsonb_build_array(${filas.map(() => "%L::jsonb").join(", ")}))', ${filas.join(", ")})), '|', 1);`;
/** Lo que lee quien ve Frescura: una línea por categoría «cat1|cat2, tiendas,ventana,vendidas,nivel,puntos». */
const leer = `select (case when categoria_id = :'cat1' then 'cat1' else 'cat2' end) || ',' || tiendas || ',' || ventana_dias || ',' || trim_scale(vendidas) || ',' || coalesce(nivel, 'null') || ',' || jsonb_array_length(observaciones)
  from retail.fn_frescura_vara_cayla() order by 1;`;

// ===========================================================================
// 1. LA ESCRITURA (solo el servidor) Y LA LECTURA (quien ve Frescura)
// ===========================================================================

caso(
  "la llave de servicio guarda una categoría y el líder la lee con sus cifras y sus 2 observaciones",
  COMO_CRON + guardar(fila("cat1")) + "\n" + como(FELIPE) + leer,
  "1\ncat1,3,60,28,solido,2"
);
caso(
  "la corrida siguiente reemplaza la foto entera: la categoría que no trae sale, la que trae se pisa",
  COMO_CRON + guardar(fila("cat1"), fila("cat2")) + "\n" + guardar(fila("cat2", { vendidas: 5, unidades: 9, nivel: "pocos_datos", observaciones: [[3600, 1, 5]] })) + "\n" + como(FELIPE) + leer,
  "2\n1\ncat2,3,60,5,pocos_datos,1"
);
caso(
  "una corrida vacía no toca nada: la foto anterior sigue",
  COMO_CRON + guardar(fila("cat1")) + "\n" + guardarVacio + "\n" + como(FELIPE) + leer,
  "1\n0\ncat1,3,60,28,solido,2"
);
caso("el líder (una cuenta, por PostgREST) NO guarda: 42501", como(FELIPE) + `set local role authenticated;\n` + intentoGuardar(fila("cat1")), "42501");
caso("sin claims (psql directo, auth.role() null) tampoco guarda: 42501", SIN_CLAIMS + intentoGuardar(fila("cat1")), "42501");
caso(
  "el esquema niega una ventana que no es de la vara, más vendidas que unidades y un nivel inventado: 23514",
  COMO_CRON +
    intentoGuardar(fila("cat1", { ventana_dias: 45 })) + "\n" +
    intentoGuardar(fila("cat1", { vendidas: 40, unidades: 31 })) + "\n" +
    intentoGuardar(fila("cat1", { nivel: "regular" })),
  "23514\n23514\n23514"
);
caso(
  "una fila sin categoría, o con observaciones que no son una lista, se rechaza entera (22023) y no deja nada a medias",
  COMO_CRON +
    `select split_part(pg_temp.intento($q$select retail.guardar_frescura_vara_cayla('[{"tiendas":3,"ventana_dias":60,"vendidas":1,"unidades":1,"observaciones":[]}]'::jsonb)$q$), '|', 1);\n` +
    `select split_part(pg_temp.intento(format($q$select retail.guardar_frescura_vara_cayla(jsonb_build_array(jsonb_build_object('categoria_id', %L, 'tiendas', 3, 'ventana_dias', 60, 'vendidas', 1, 'unidades', 1, 'observaciones', '{}'::jsonb)))$q$, :'cat1')), '|', 1);\n` +
    como(FELIPE) + `select count(*) from retail.fn_frescura_vara_cayla();`,
  "22023\n22023\n0"
);
caso(
  "una cuenta de AFUERA no lee la vara: la pista frescura_sin_permiso, nunca cero filas; la tabla directo, ni el líder (42501)",
  COMO_CRON + guardar(fila("cat1")) + "\n" + como(AFUERA) + `select split_part(pg_temp.intento('select * from retail.fn_frescura_vara_cayla()'), '|', 2);\n` +
    como(FELIPE) + `set local role authenticated;\nselect split_part(pg_temp.intento('select count(*) from retail.frescura_vara_cayla'), '|', 1);`,
  "1\nfrescura_sin_permiso\n42501"
);

// ===========================================================================
// 2. EL PARCHE DE fn_frescura_sede
// ===========================================================================

caso(
  "la llave de servicio (el cron) lee la frescura de Trujillo sin persona: la lectura vuelve con su forma",
  COMO_CRON + `select jsonb_typeof(retail.fn_frescura_sede(:'tru', 120)) || ',' || (retail.fn_frescura_sede(:'tru', 120) ? 'separa_piso');`,
  "object,true"
);
caso(
  "sin claims (auth.role() null) fn_frescura_sede sigue cerrada; una cuenta de afuera también",
  SIN_CLAIMS + `select split_part(pg_temp.intento(format('select retail.fn_frescura_sede(%L, 120)', :'tru')), '|', 2);\n` +
    como(AFUERA) + `select split_part(pg_temp.intento(format('select retail.fn_frescura_sede(%L, 120)', :'tru')), '|', 2);`,
  "frescura_sin_permiso\nfrescura_sin_permiso"
);
caso(
  "el líder sigue leyendo su sede como antes",
  como(FELIPE) + `select jsonb_typeof(retail.fn_frescura_sede(:'tru', 120));`,
  "object"
);
caso(
  "el cuerpo de fn_frescura_sede es uno de los dos calculados (md5 «después»), y re-pegar la migración lo deja igual",
  `select md5(p.prosrc) in ('${MD5_DESPUES[0]}', '${MD5_DESPUES[1]}') from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');\n` +
    MIGRACION + "\n" +
    `select md5(p.prosrc) in ('${MD5_DESPUES[0]}', '${MD5_DESPUES[1]}') from pg_proc p where p.oid = to_regprocedure('retail.fn_frescura_sede(uuid, integer)');\n` +
    `select has_function_privilege('service_role', 'retail.fn_frescura_sede(uuid, integer)', 'execute');`,
  // La línea vacía del medio es el `select pg_temp.reemplazar_anclado(…)` de la migración, que devuelve void.
  "t\n\nt\nt"
);

// ===========================================================================

function main() {
  try {
    execFileSync("docker", ["exec", CONTENEDOR_LOCAL, "true"]);
  } catch {
    console.error(`No se pudo hablar con el contenedor ${CONTENEDOR_LOCAL}. Levanta el stack local con \`npx supabase start\`.`);
    process.exit(1);
  }
  console.log(`\n${casos - fallas} de ${casos} casos en verde${EN_SECO ? " (en seco)" : ""}.`);
  process.exit(fallas > 0 ? 1 : 0);
}

main();
