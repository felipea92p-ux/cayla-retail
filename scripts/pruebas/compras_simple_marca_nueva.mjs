#!/usr/bin/env node
/**
 * Prueba de la marca nueva de «Algo nuevo» (ADR-0480, Felipe 2026-10-24): `20261024214000_compras_marca_nueva_desde_la_compra.sql`.
 *
 * QUÉ PROMETE
 *   · El módulo es la llave: sin «Mis compras» (`ordenes_compra`) ni el Catálogo, no se crea (42501).
 *   · Con el módulo, la marca se crea y queda unida al proveedor de la compra; la Actividad anota quién la agregó.
 *   · Escrita otra vez (con otras mayúsculas o espacios), no se crea otra: devuelve la misma, con su nombre de verdad.
 *   · Una marca que ya existe con otro proveedor le suma este proveedor, sin crearse de nuevo.
 *   · Validaciones: nombre de 2 a 60 letras, proveedor activo; una marca desactivada no se reactiva desde aquí.
 *   · `anon` no la ejecuta.
 *
 * CÓMO. Sesión simulada con `request.jwt.claim.sub`, la migración pegada dos veces y ROLLBACK siempre.
 *
 * USO
 *   pnpm pruebas:compras-simple-marca                                        → contra el Postgres local (supabase_db_cayla-retail)
 *   node scripts/pruebas/compras_simple_marca_nueva.mjs --contenedor <otro>  → contra otro contenedor
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
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261024214000_compras_marca_nueva_desde_la_compra.sql"), "utf8").replace(
  /^set lock_timeout.*$/gm,
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
const como = (auth, clave) =>
  `reset role;\nset local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n` +
  `select set_config('request.headers', '${JSON.stringify(clave ? { "x-responsable-omitido": clave } : {})}', true) \\g /dev/null\n` +
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
-- Dos proveedores activos cualesquiera: el de la compra y otro.
select id as prov from retail.proveedores where activo order by nombre limit 1 \\gset
select id as otro from retail.proveedores where activo order by nombre offset 1 limit 1 \\gset
select set_config('t.prov', :'prov', true), set_config('t.otro', :'otro', true) \\g /dev/null
`;

const rolDeMicaela = (...modulos) => `
reset role;
insert into retail.roles (nombre) values ('ZZ Compradora marca nueva') returning id as rol \\gset
${modulos.map((m) => `insert into retail.rol_modulos (rol_id, modulo) values (:'rol', '${m}');`).join("\n")}
update retail.colaboradores set rol_id = :'rol' where persona_id = :'micaela';
`;
const MARCA = (nombre, prov = "current_setting('t.prov')::uuid") => `retail.registrar_marca_de_compra('${nombre}', ${prov})`;
const intento = (sql) => `pg_temp.intento($q$${sql}$q$)`;
const hint = (sql) => `split_part(${intento(sql)}, '|', 2)`;

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
  "sin «Mis compras» ni el Catálogo no se crea la marca (42501)",
  `${rolDeMicaela("existencias")}${como(MICAELA, "compra_rapida")}
select left(${intento(`select ${MARCA("Zeta Prueba Marca")}`)}, 5), ${hint(`select ${MARCA("Zeta Prueba Marca")}`)};`,
  "42501|ordenes_compra_sin_modulo",
);

caso(
  "con el módulo se crea, queda unida al proveedor y la Actividad la anota a nombre de quien compra",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select (${MARCA("Zeta Prueba Marca")}) as r \\gset
reset role;
select (:'r'::jsonb ->> 'nombre'), (:'r'::jsonb ->> 'nueva'),
       (select count(*) from retail.marca_proveedores where marca_id = (:'r'::jsonb ->> 'id')::uuid and proveedor_id = :'prov'),
       (select count(*) from retail.actividad where accion = 'marca_creada' and registro_id = :'r'::jsonb ->> 'id' and persona_id = :'micaela');`,
  "Zeta Prueba Marca|true|1|1",
);

caso(
  "escrita otra vez con otras mayúsculas o espacios, devuelve la misma marca con su nombre de verdad",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select (${MARCA("Zeta Prueba Marca")}) ->> 'id' as a \\gset
select (${MARCA("  zeta   PRUEBA marca ")}) as b \\gset
reset role;
select (:'b'::jsonb ->> 'id') = :'a', :'b'::jsonb ->> 'nombre', :'b'::jsonb ->> 'nueva',
       (select count(*) from retail.marcas where retail.fn_clave_texto(nombre) = retail.fn_clave_texto('Zeta Prueba Marca'));`,
  "t|Zeta Prueba Marca|false|1",
);

caso(
  "una marca que ya existe con otro proveedor le suma este, sin crearse de nuevo",
  `${rolDeMicaela("ordenes_compra")}${como(MICAELA, "compra_rapida")}
select (${MARCA("Zeta Prueba Marca", "current_setting('t.otro')::uuid")}) ->> 'id' as a \\gset
select (${MARCA("Zeta Prueba Marca")}) ->> 'id' as b \\gset
reset role;
select :'a' = :'b', (select count(*) from retail.marca_proveedores where marca_id = :'a'::uuid);`,
  "t|2",
);

caso(
  "nombre muy corto, sin proveedor o una marca desactivada: se rechaza y no queda nada",
  `${rolDeMicaela("ordenes_compra")}
reset role;
insert into retail.marcas (nombre, activo) values ('Zeta Apagada Prueba', false);
${como(MICAELA, "compra_rapida")}
select ${hint(`select ${MARCA("a")}`)}, ${hint(`select ${MARCA("Zeta Sin Proveedor", "null")}`)}, ${hint(`select ${MARCA("zeta apagada prueba")}`)};
reset role;
select count(*) from retail.marcas where nombre in ('a', 'Zeta Sin Proveedor');`,
  "marca_nombre|marca_sin_proveedor|marca_desactivada / 0",
);

caso(
  "anon no la ejecuta",
  `select has_function_privilege('anon', 'retail.registrar_marca_de_compra(text, uuid)', 'execute'),
       has_function_privilege('authenticated', 'retail.registrar_marca_de_compra(text, uuid)', 'execute');`,
  "f|t",
);

console.log(`\n${casos - fallas}/${casos} casos en verde`);
if (fallas) process.exit(1);
