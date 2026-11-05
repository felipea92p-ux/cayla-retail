#!/usr/bin/env node
/**
 * Pruebas del plazo de pedido del Plan (ADR-0499) — migración `20261024220000_plan_compra_plazo_para_llegar.sql`:
 * `planes_compra.dias_para_llegar` (con su autor), `guardar_plan_compra_plazo` y `fn_plan_compra_plazo`.
 *
 * LO QUE VIGILA. Que un plazo imposible (cero, negativo, de más de un año) no se pueda guardar ni escribiendo la tabla; que un plazo nunca
 * exista sin quién lo fijó; que quitarlo deje la campaña con el supuesto y anotado quién lo quitó; que solo lo toque quien tiene el módulo;
 * y que responda a la sesión de la tienda (el rol `authenticated`, no el dueño: ADR-0496).
 *
 * USO
 *   pnpm pruebas:plan-compra-plazo              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK)
 *   pnpm pruebas:plan-compra-plazo --base otra  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261024220000_plan_compra_plazo_para_llegar.sql"), "utf8");
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

function correr(sql) {
  try {
    const salida = execFileSync(
      "docker",
      ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"],
      { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

// La migración se carga dentro de cada caso (idempotente): corre igual con la base al día o sin la nueva.
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
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Plan con plazo', date '2026-12-01', date '2026-12-31') returning id as plan \\gset
select set_config('pc.plan', :'plan', true) as _1 \\gset
create function pg_temp.fija(p_dias text) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_plazo(%L, %s)', current_setting('pc.plan'), p_dias));
end $$;
${como(FELIPE)}
`;
const DIAS = `(select dias_para_llegar from retail.planes_compra where id = current_setting('pc.plan')::uuid)`;

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

console.log("— Fijar y quitar —");
caso("F1 un plan de antes no tiene plazo fijado y la lectura lo dice (soportado, null, sin autor)", `select retail.fn_plan_compra_plazo(:'plan')::text;`, (o) => /"soportado": true/.test(o) && /"dias_para_llegar": null/.test(o) && /"por": null/.test(o));
caso("F2 se fija en 21 días y se lee con quién lo fijó", `select pg_temp.fija('21') as r \\gset\nselect :'r' || ',' || (retail.fn_plan_compra_plazo(:'plan')->>'dias_para_llegar') || ',' || (retail.fn_plan_compra_plazo(:'plan')->>'por' is not null);`, "SIN_ERROR,21,true");
caso("F3 NULL lo quita (vuelve al supuesto) y deja anotado quién lo quitó", `select pg_temp.fija('21') as r1 \\gset\nselect pg_temp.fija('null') as r2 \\gset\nselect :'r1' || ',' || :'r2' || ',' || coalesce(${DIAS}::text, 'sin') || ',' || (select plazo_actualizado_por is not null from retail.planes_compra where id = current_setting('pc.plan')::uuid);`, "SIN_ERROR,SIN_ERROR,sin,true");
caso("F4 la última persona gana: 21 y después 30 deja 30", `select pg_temp.fija('21') as r1 \\gset\nselect pg_temp.fija('30') as r2 \\gset\nselect ${DIAS}::text;`, "30");
caso("F5 1 y 365 caben", `select pg_temp.fija('1') as r1 \\gset\nselect pg_temp.fija('365') as r2 \\gset\nselect :'r1' || ',' || :'r2' || ',' || ${DIAS};`, "SIN_ERROR,SIN_ERROR,365");

console.log("\n— Lo imposible —");
caso(
  "I1 cero, negativo y más de 365 se rechazan con su mensaje y no guardan nada",
  `select concat_ws(' / ', split_part(pg_temp.fija('0'), '|', 2), split_part(pg_temp.fija('-3'), '|', 2), split_part(pg_temp.fija('366'), '|', 2), coalesce(${DIAS}::text, 'sin'));`,
  "Los días para llegar van de 1 a 365 (o déjalo vacío para volver al supuesto de 14). / Los días para llegar van de 1 a 365 (o déjalo vacío para volver al supuesto de 14). / Los días para llegar van de 1 a 365 (o déjalo vacío para volver al supuesto de 14). / sin",
);
caso(
  "I2 escribir la tabla directo con 0 días, con 400, o con días y SIN autor lo frena el CHECK",
  `reset role;
   select split_part(pg_temp.intento(format('update retail.planes_compra set dias_para_llegar = 0, plazo_actualizado_por = (select id from public.personas limit 1), plazo_actualizado_en = now() where id = %L', current_setting('pc.plan'))), '|', 1) || ',' ||
          split_part(pg_temp.intento(format('update retail.planes_compra set dias_para_llegar = 400, plazo_actualizado_por = (select id from public.personas limit 1), plazo_actualizado_en = now() where id = %L', current_setting('pc.plan'))), '|', 1) || ',' ||
          split_part(pg_temp.intento(format('update retail.planes_compra set dias_para_llegar = 14 where id = %L', current_setting('pc.plan'))), '|', 1);`,
  "23514,23514,23514",
);
caso("I3 un plan que no existe: guardar da su mensaje y leer da null", `select split_part(pg_temp.intento('select retail.guardar_plan_compra_plazo(gen_random_uuid(), 14)'), '|', 2) || ',' || coalesce(retail.fn_plan_compra_plazo(gen_random_uuid())::text, 'null');`, "Ese plan de campaña no existe,null");

console.log("\n— Puertas —");
caso(
  "P1 con el rol de la tienda (authenticated, no el dueño) la lectura y el guardado responden",
  `set local role authenticated;
   select pg_temp.fija('18') as r \\gset
   select :'r' || ',' || (retail.fn_plan_compra_plazo(:'plan')->>'dias_para_llegar');`,
  "SIN_ERROR,18",
);
caso(
  "P2 sin el módulo (Micaela), 42501 al guardar y al leer; anon no ejecuta ninguna",
  `reset role;
   ${como(MICAELA)}
   select split_part(pg_temp.fija('18'), '|', 1) || ',' ||
          split_part(pg_temp.intento(format('select retail.fn_plan_compra_plazo(%L)', current_setting('pc.plan'))), '|', 1) || ',' ||
          has_function_privilege('anon', 'retail.guardar_plan_compra_plazo(uuid,integer)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.fn_plan_compra_plazo(uuid)', 'execute');`,
  "42501,42501,false,false",
);
caso(
  "P3 las dos funciones son security definer con search_path fijo",
  `select count(*) || ',' || bool_and(p.prosecdef) || ',' || bool_and(p.proconfig::text like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('guardar_plan_compra_plazo', 'fn_plan_compra_plazo');`,
  "2,true,true",
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
