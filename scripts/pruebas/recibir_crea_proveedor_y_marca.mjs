#!/usr/bin/env node
/**
 * Prueba de «crear proveedor y marca al recibir» (ADR-0635, Felipe 2026-11-09): `20261109230000_recibir_crea_proveedor_y_marca.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo Recibir mercadería es la llave: sin él, ninguna de las dos funciones crea nada (42501, `recibir_sin_modulo`).
 *   · Con solo Recibir (sin Proveedores ni Catálogo) se registra un proveedor con su razón social y, si se escribe, su RUC; la Actividad
 *     lo anota a nombre de quien recibe. Escrito otra vez (otras mayúsculas o espacios, o el mismo RUC), devuelve el mismo, sin duplicar.
 *   · Un RUC mal escrito se rechaza; el mismo nombre con otro RUC es otra empresa y se rechaza.
 *   · Con solo Recibir se crea una marca unida a su proveedor; escrita otra vez devuelve la misma y, con otro proveedor, le suma el vínculo.
 *     Nombre de 2 a 60 letras y proveedor activo; una marca desactivada no se reactiva desde aquí.
 *   · `anon` no las ejecuta.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:recibir-crea-proveedor-y-marca                                    → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/recibir_crea_proveedor_y_marca.mjs --contenedor <otro>     → contra otro contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : porDefecto;
};
const CONTENEDOR = arg("--contenedor", process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261109230000_recibir_crea_proveedor_y_marca.sql"), "utf8").replace(
  /^(set|reset) lock_timeout.*$/gm,
  "",
);

const MICAELA = "22222222-2222-4222-8222-000000000003"; // integrante — Tienda Trujillo

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
// Firma con la cuenta de la persona (la clave soltada del combo hace que firme ella misma).
const como = (auth) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify({ "x-responsable-omitido": "compra_rapida" })}', true) \\g /dev/null\n` +
  `set local role authenticated;\n`;

const PRELUDIO = `
begin;
${MIGRACION}
${MIGRACION}
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
grant execute on function pg_temp.intento(text) to authenticated;
select id as micaela from public.personas where auth_user_id = '${MICAELA}' \\gset
select id as prov from retail.proveedores where activo order by nombre limit 1 \\gset
select id as otro from retail.proveedores where activo order by nombre offset 1 limit 1 \\gset
select set_config('t.prov', :'prov', true), set_config('t.otro', :'otro', true) \\g /dev/null
`;

const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Recibe proveedor nuevo') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;
const PROV = (nombre, ruc = "null") => `retail.registrar_proveedor_de_recepcion('${nombre}', ${ruc})`;
const MARCA = (nombre, prov = "current_setting('t.prov')::uuid") => `retail.registrar_marca_de_recepcion('${nombre}', ${prov})`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;
// Dos RUC de 11 dígitos al azar en cada corrida: uno de una base de pruebas puede quedar ocupado por otra prueba.
const rucAlAzar = () => `'20${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}'`;
const RUC = rucAlAzar();
const OTRO_RUC = rucAlAzar();

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  let obtenido;
  try {
    obtenido = psql(`${PRELUDIO}${sql}\nrollback;`).trim().split("\n").filter(Boolean).join(" / ");
  } catch (e) {
    obtenido = `ERROR: ${String(e.stderr ?? e.message).split("\n").filter((l) => !l.includes("NOTICE")).slice(0, 4).join(" ")}`;
  }
  const ok = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (ok) console.log(`✓ ${nombre}`);
  else {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(ver la condición)" : esperado}\n    obtenido: ${obtenido}`);
  }
}

caso(
  "sin Recibir mercadería no se crea ni el proveedor ni la marca (42501)",
  `${rolDeMicaela("existencias")}${como(MICAELA)}
select left(${intento(`select * from ${PROV("Zeta Hilos Prueba")}`)}, 5), ${hint(`select * from ${PROV("Zeta Hilos Prueba")}`)}, ${hint(`select ${MARCA("Zeta Marca Prueba")}`)};`,
  "42501|recibir_sin_modulo|recibir_sin_modulo",
);

caso(
  "con solo Recibir se registra el proveedor sin RUC, y la Actividad lo anota a nombre de quien recibe",
  `${rolDeMicaela("recibir")}${como(MICAELA)}
select proveedor_id as p, proveedor_nombre as n, ya_existia as y from ${PROV("  Zeta   Hilos Prueba ")} \\gset
reset role;
select :'n', :'y', (select ruc is null and activo from retail.proveedores where id = :'p'::uuid),
       (select count(*) from retail.actividad where accion = 'proveedor_registrado' and registro_id = :'p' and persona_id = :'micaela');`,
  "Zeta Hilos Prueba|f|t|1",
);

caso(
  "escrito otra vez con otras mayúsculas devuelve el mismo, y con su RUC lo encuentra por el RUC",
  `${rolDeMicaela("recibir")}${como(MICAELA)}
select proveedor_id as a from ${PROV("Zeta Ruc Prueba", RUC)} \\gset
select proveedor_id as b, ya_existia as yb from ${PROV("ZETA ruc prueba")} \\gset
select proveedor_id as c, ya_existia as yc from ${PROV("Otro Nombre Cualquiera Prueba", RUC)} \\gset
reset role;
select :'a' = :'b', :'yb', :'a' = :'c', :'yc', (select count(*) from retail.proveedores where ruc = ${RUC});`,
  "t|t|t|t|1",
);

caso(
  "un RUC mal escrito, un nombre vacío o el mismo nombre con otro RUC se rechazan",
  `${rolDeMicaela("recibir")}${como(MICAELA)}
select proveedor_id from ${PROV("Zeta Ruc Prueba", RUC)} \\g /dev/null
select ${hint(`select * from ${PROV("Zeta Corto Prueba", "'123'")}`)}, ${hint(`select * from ${PROV("   ")}`)}, ${hint(`select * from ${PROV("zeta ruc prueba", OTRO_RUC)}`)};`,
  "proveedor_ruc_invalido|proveedor_sin_nombre|proveedor_nombre_en_uso",
);

caso(
  "con solo Recibir se crea la marca unida a su proveedor; otra vez es la misma, y con otro proveedor le suma el vínculo",
  `${rolDeMicaela("recibir")}${como(MICAELA)}
select (${MARCA("Zeta Marca Prueba")}) as r \\gset
select (${MARCA("  zeta MARCA prueba ", "current_setting('t.otro')::uuid")}) as s \\gset
reset role;
select :'r'::jsonb ->> 'nueva', :'s'::jsonb ->> 'nueva', (:'r'::jsonb ->> 'id') = (:'s'::jsonb ->> 'id'), :'s'::jsonb ->> 'nombre',
       (select count(*) from retail.marca_proveedores where marca_id = (:'r'::jsonb ->> 'id')::uuid),
       (select count(*) from retail.actividad where accion = 'marca_creada' and registro_id = :'r'::jsonb ->> 'id' and persona_id = :'micaela');`,
  "true|false|t|Zeta Marca Prueba|2|1",
);

caso(
  "marca: nombre muy corto, sin proveedor o desactivada se rechaza y no queda nada",
  `${rolDeMicaela("recibir")}
reset role;
insert into retail.marcas (nombre, activo) values ('Zeta Apagada Prueba', false);
${como(MICAELA)}
select ${hint(`select ${MARCA("a")}`)}, ${hint(`select ${MARCA("Zeta Sin Proveedor", "null")}`)}, ${hint(`select ${MARCA("zeta apagada prueba")}`)};
reset role;
select count(*) from retail.marcas where nombre in ('a', 'Zeta Sin Proveedor');`,
  "marca_nombre|marca_sin_proveedor|marca_desactivada / 0",
);

caso(
  "anon no las ejecuta",
  `select has_function_privilege('anon', 'retail.registrar_proveedor_de_recepcion(text, text)', 'execute'),
       has_function_privilege('anon', 'retail.registrar_marca_de_recepcion(text, uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.registrar_proveedor_de_recepcion(text, text)', 'execute'),
       has_function_privilege('authenticated', 'retail.registrar_marca_de_recepcion(text, uuid)', 'execute');`,
  "f|f|t|t",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
