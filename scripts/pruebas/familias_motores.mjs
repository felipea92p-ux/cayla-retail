#!/usr/bin/env node
/**
 * Pruebas de la marca «entra a los motores» de una familia (Bolsas de despacho, actividad 1) contra el Postgres local — CAYLA V2.
 *
 * `familias.entra_a_motores` deja que un Líder saque una familia («Empaque») de los motores de decisión (piso, demanda, plan de compra,
 * Análisis, Frescura) sin sacarla de la caja ni del comprobante. Aquí se cuida lo que la base tiene que garantizar sola: que ninguna familia
 * existente cambie, que la pregunta única (`fn_categoria_entra_a_motores`) responda bien también ante lo que no sabe, y que solo un Líder
 * pueda cambiar la marca. Que cada motor la RESPETE lo prueban las suites de cada motor (actividades 2 y 3).
 *
 * La migración se carga dentro de cada caso (idempotente) y todo termina en ROLLBACK: corre igual con la base al día o sin ella y no deja
 * nada en el Postgres local compartido.
 *
 * USO
 *   pnpm pruebas:familias-motores              → contra la base `postgres` del stack local (`npx supabase start`)
 *   pnpm pruebas:familias-motores --base otra  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261010231000_familias_entran_a_motores.sql"), "utf8");
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora

function psql(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
    { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${sinControl(MIGRACION)}
set local search_path = retail, public, extensions;
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_estado text; v_msg text;
begin
  execute p_sql;
  return 'SIN_ERROR';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_msg = message_text;
  return v_estado || '|' || v_msg;
end;
$f$;
`;

let fallas = 0;
let casos = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${typeof esperado === "function" ? "(condición)" : esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}

caso(
  "C1 la columna nace not null con valor true y NINGUNA familia existente queda apagada",
  `select concat_ws(',',
     (select is_nullable || '/' || column_default from information_schema.columns
       where table_schema = 'retail' and table_name = 'familias' and column_name = 'entra_a_motores'),
     (select count(*) from retail.familias where not entra_a_motores),
     (select count(*) > 0 from retail.familias));`,
  "NO/true,0,t",
);

caso(
  "C2 la pregunta responde por la familia de la categoría; sin dato (null, inexistente, sin familia) sigue contando",
  `insert into retail.familias (codigo, nombre, entra_a_motores) values ('zz_empaque', 'ZZ Empaque', false);
   insert into retail.categorias (nombre, familia) values ('ZZ Bolsas', 'zz_empaque');
   insert into retail.categorias (nombre, familia) values ('ZZ Camisas', 'indumentaria');
   insert into retail.categorias (nombre, familia) values ('ZZ Sin familia', null);
   select concat_ws(',',
     retail.fn_categoria_entra_a_motores((select id from retail.categorias where nombre = 'ZZ Bolsas')),
     retail.fn_categoria_entra_a_motores((select id from retail.categorias where nombre = 'ZZ Camisas')),
     retail.fn_categoria_entra_a_motores((select id from retail.categorias where nombre = 'ZZ Sin familia')),
     retail.fn_categoria_entra_a_motores(null),
     retail.fn_categoria_entra_a_motores('00000000-0000-4000-8000-000000000000'));`,
  "f,t,t,t,t",
);

caso(
  "C3 apagar y volver a encender una familia cambia la respuesta al instante (un Líder)",
  `insert into retail.familias (codigo, nombre) values ('zz_empaque', 'ZZ Empaque');
   insert into retail.categorias (nombre, familia) values ('ZZ Bolsas', 'zz_empaque');
   select id as cat from retail.categorias where nombre = 'ZZ Bolsas' \\gset
   ${como(FELIPE)}
   select retail.fn_categoria_entra_a_motores(:'cat') as antes \\gset
   update retail.familias set entra_a_motores = false where codigo = 'zz_empaque';
   select retail.fn_categoria_entra_a_motores(:'cat') as apagada \\gset
   update retail.familias set entra_a_motores = true where codigo = 'zz_empaque';
   select concat_ws(',', :'antes', :'apagada', retail.fn_categoria_entra_a_motores(:'cat'));`,
  "t,f,t",
);

// Con el rol `authenticated` de verdad (el superusuario se salta la seguridad por fila). La política de escritura de `familias` es
// `fn_puede_editar_catalogo()` (líder, o quien ve Productos o Atributos): el seed le da esos módulos al rol Integrante, así que a
// Micaela se los quitamos dentro de la transacción (receta de `revisar_productos_pendientes.mjs`). Sin ellos toca 0 filas (o la base le
// niega el permiso, 42501) y la marca no cambia; el Líder, con el mismo rol, sí cambia 1 fila.
caso(
  "C4 quien no edita el catálogo no puede apagar una familia; un líder, con el mismo rol, sí",
  `create function pg_temp.filas(p_sql text) returns text language plpgsql as $f$
   declare n integer;
   begin
     execute p_sql;
     get diagnostics n = row_count;
     return n::text;
   exception when others then
     return sqlstate;
   end $f$;
   ${como(MICAELA)}
   delete from retail.rol_modulos where rol_id = retail.fn_mi_rol_id() and modulo in ('productos', 'atributos');
   set local role authenticated;
   select pg_temp.filas('update retail.familias set entra_a_motores = false where codigo = ''indumentaria''') as colab \\gset
   reset role;
   select entra_a_motores as quedo_colab from retail.familias where codigo = 'indumentaria' \\gset
   ${como(FELIPE)}
   set local role authenticated;
   select pg_temp.filas('update retail.familias set entra_a_motores = false where codigo = ''indumentaria''') as lider \\gset
   reset role;
   select concat_ws(',', :'colab', :'quedo_colab', :'lider', (select entra_a_motores from retail.familias where codigo = 'indumentaria'));`,
  (o) => /^(0|42501),t,1,f$/.test(o),
);

caso(
  "C5 nadie ejecuta la pregunta como anon, y una cuenta autenticada sí",
  `select has_function_privilege('anon', 'retail.fn_categoria_entra_a_motores(uuid)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_categoria_entra_a_motores(uuid)', 'execute');`,
  "false,true",
);

caso(
  "C6 la migración es idempotente: cargarla otra vez, con una familia ya apagada, no falla ni la vuelve a encender",
  `insert into retail.familias (codigo, nombre, entra_a_motores) values ('zz_empaque', 'ZZ Empaque', false);
   ${sinControl(MIGRACION)}
   select entra_a_motores from retail.familias where codigo = 'zz_empaque';`,
  "f",
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
