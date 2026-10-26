#!/usr/bin/env node
/**
 * Pruebas del descuento de la campaña en el Plan (ADR-0499) — migración `20261024215000_plan_compra_descuento_de_la_campana.sql`:
 * la columna `planes_compra_lineas.descuento_pct`, `guardar_plan_compra_linea` con `p_descuento_pct` y `fn_plan_compra_descuento`.
 *
 * LO QUE VIGILA. Que un descuento imposible (negativo, de 100 % o más) no se pueda guardar ni escribiendo la tabla; que la web de antes
 * (sin el parámetro) no borre un descuento ya guardado; que dos personas con descuentos distintos no se pisen (B4); que el sugerido de la
 * campaña sea el mayor % que alcanza a la categoría y diga de dónde sale; y que la lectura responda a la sesión de la tienda (el rol
 * `authenticated`, no el dueño: ADR-0496 rompió a toda la tienda 16 h por probar solo como dueño).
 *
 * USO
 *   pnpm pruebas:plan-compra-descuento              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK)
 *   pnpm pruebas:plan-compra-descuento --base otra  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const MIGRACION = readFileSync(join(RAIZ, "supabase", "migrations", "20261024215000_plan_compra_descuento_de_la_campana.sql"), "utf8");
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

// La base de local ya trae B1–B5 y lo demás del plan; la migración nueva se carga dentro de cada caso (idempotente: corre igual con la base
// al día o sin la nueva).
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
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Plan con descuento', date '2026-12-01', date '2026-12-31') returning id as plan \\gset
insert into retail.categorias (nombre, familia) values ('PC Polos descuento', 'indumentaria') returning id as cat \\gset
-- Guarda con los argumentos de la web nueva (descuento) o de la de antes (sin él).
create function pg_temp.guarda(p_desc text, p_version text default 'null') returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_linea(p_plan_id => %L, p_categoria_id => %L, p_flojo => 80, p_normal => 120, p_bueno => 180, p_precio => 79.90, p_costo => 32, p_recupero_pct => 50, p_version_esperada => %s %s)',
    current_setting('pc.plan'), current_setting('pc.cat'), p_version, case when p_desc is null then '' else ', p_descuento_pct => ' || p_desc end));
end $$;
select set_config('pc.plan', :'plan', true) as _1, set_config('pc.cat', :'cat', true) as _2 \\gset
${como(FELIPE)}
`;
const DESCUENTO_GUARDADO = `(select descuento_pct from retail.planes_compra_lineas where plan_id = current_setting('pc.plan')::uuid and categoria_id = current_setting('pc.cat')::uuid)`;
// Una campaña aprobada con 20 % para la categoría de la prueba y ligada al plan.
const CAMPANA = `
reset role;
insert into retail.etiquetas (nombre, estilo) values ('ZZ Campaña descuento (prueba)', 'campana') returning id as camp \\gset
select retail.actualizar_campana_etiqueta(:'camp', 20, date '2026-12-11', date '2026-12-25', array[:'cat']::uuid[]);
update retail.planes_compra set etiqueta_id = :'camp' where id = :'plan';
${como(FELIPE)}
`;
const SUGERIDO = `(select s from jsonb_array_elements(retail.fn_plan_compra_descuento(:'plan')->'sugeridos') s where s->>'categoria_id' = :'cat')`;

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

console.log("— Guardar el descuento —");
caso("G1 el descuento se guarda y se lee tal cual (12,5 %)", `select pg_temp.guarda('12.5') as r1 \\gset\nselect :'r1' || ',' || ${DESCUENTO_GUARDADO};`, "SIN_ERROR,12.50");
caso("G2 una categoría nueva sin descuento en la llamada queda en 0", `select pg_temp.guarda(null) as r1 \\gset\nselect :'r1' || ',' || ${DESCUENTO_GUARDADO};`, "SIN_ERROR,0.00");
caso(
  "G3 la web de antes (sin el parámetro) NO borra un descuento ya guardado",
  `select pg_temp.guarda('20') as r1 \\gset\nselect pg_temp.guarda(null) as r2 \\gset\nselect :'r1' || ',' || :'r2' || ',' || ${DESCUENTO_GUARDADO};`,
  "SIN_ERROR,SIN_ERROR,20.00",
);
caso("G4 la web nueva sí lo cambia, y 0 lo quita", `select pg_temp.guarda('20') as r1 \\gset\nselect pg_temp.guarda('0') as r2 \\gset\nselect :'r1' || ',' || :'r2' || ',' || ${DESCUENTO_GUARDADO};`, "SIN_ERROR,SIN_ERROR,0.00");
caso(
  "G5 100 %, más de 100 y negativo se rechazan con su mensaje y no guardan nada",
  `select concat_ws(' / ', split_part(pg_temp.guarda('100'), '|', 2), split_part(pg_temp.guarda('-5'), '|', 2), (select count(*) from retail.planes_compra_lineas where categoria_id = :'cat')::text);`,
  "El descuento de la campaña va de 0 % a menos de 100 %. / El descuento de la campaña va de 0 % a menos de 100 %. / 0",
);
caso(
  "G6 99,99 % cabe; 99,999 se redondea a 100 y se rechaza (la base no deja un precio en cero)",
  `select pg_temp.guarda('99.99') || ',' || split_part(pg_temp.guarda('99.999'), '|', 1);`,
  "SIN_ERROR,P0001",
);

console.log("\n— Lo que la tabla no deja —");
caso(
  "T1 escribir la tabla directo con 100 % o con negativo lo frena el CHECK",
  `select pg_temp.guarda('10');
   reset role;
   select split_part(pg_temp.intento('update retail.planes_compra_lineas set descuento_pct = 100'), '|', 1) || ',' ||
          split_part(pg_temp.intento('update retail.planes_compra_lineas set descuento_pct = -1'), '|', 1);`,
  "23514,23514",
);

console.log("\n— Dos personas a la vez (B4) —");
caso(
  "V1 un descuento distinto de lo que otra persona guardó entre medio NO se pisa (PT409); lo mismo, sí pasa",
  `select pg_temp.guarda('10', '0');
   select split_part(pg_temp.guarda('25', '0'), '|', 1) || ',' || split_part(pg_temp.guarda('10', '0'), '|', 1) || ',' || ${DESCUENTO_GUARDADO};`,
  "PT409,SIN_ERROR,10.00",
);

console.log("\n— Lo que sugiere la campaña —");
caso(
  "S1 la campaña da 20 % a la categoría: se sugiere 20, de la campaña, con sus fechas, sin días ni tiendas",
  `${CAMPANA}select concat_ws(',', ${SUGERIDO}->>'descuento_pct', ${SUGERIDO}->>'origen', ${SUGERIDO}->>'desde', ${SUGERIDO}->>'hasta', coalesce(${SUGERIDO}->>'dias_semana', 'sin'), coalesce(${SUGERIDO}->>'solo_en', 'sin'));`,
  "20.00,campana,2026-12-11,2026-12-25,sin,sin",
);
caso(
  "S2 una oferta activa de 35 % para esa categoría gana a la de siempre; trae sus días y su nombre",
  `${CAMPANA}select retail.guardar_campana_regla(null, :'camp', 'ZZ Martes y jueves', 35, date '2026-12-15', date '2026-12-16', array[2,4]::smallint[], array[:'cat']::uuid[], '{}'::uuid[], false, '{}'::uuid[], true);
   select concat_ws(',', ${SUGERIDO}->>'descuento_pct', ${SUGERIDO}->>'origen', ${SUGERIDO}->>'fuente', ${SUGERIDO}->>'dias_semana');`,
  "35.00,oferta,ZZ Martes y jueves,[2, 4]",
);
caso(
  "S3 una oferta que dejaría FUERA la categoría no la toca: sigue el 20 % de siempre",
  `${CAMPANA}select retail.guardar_campana_regla(null, :'camp', 'ZZ Fuera', 50, date '2026-12-15', date '2026-12-16', null, '{}'::uuid[], array[:'cat']::uuid[], false, '{}'::uuid[], true);
   select ${SUGERIDO}->>'descuento_pct' || ',' || (${SUGERIDO}->>'origen');`,
  "20.00,campana",
);
caso(
  "S4 una oferta fuera de las fechas del plan no cuenta",
  `${CAMPANA}reset role;
   update retail.planes_compra set desde = date '2026-12-01', hasta = date '2026-12-05' where id = :'plan';
   insert into retail.campana_reglas (etiqueta_id, nombre, porcentaje, desde, hasta, estado, creada_por, activada_por, activada_en)
     values (:'camp', 'ZZ Tarde', 60, date '2026-12-20', date '2026-12-22', 'activa', null, null, now()) ;`.replace(
    "creada_por, activada_por, activada_en)\n     values (:'camp', 'ZZ Tarde', 60, date '2026-12-20', date '2026-12-22', 'activa', null, null, now())",
    "creada_por, activada_por, activada_en)\n     values (:'camp', 'ZZ Tarde', 60, date '2026-12-20', date '2026-12-22', 'activa', (select id from public.personas limit 1), (select id from public.personas limit 1), now())",
  ) + `\n   ${como(FELIPE)}select ${SUGERIDO}->>'descuento_pct';`,
  "20.00",
);
caso(
  "S5 si la campaña rige solo en una tienda, la función lo dice (solo_en)",
  `${CAMPANA}reset role;
   select id as tienda from retail.ubicaciones where nombre = 'Tienda Trujillo' \\gset
   insert into retail.campana_sedes (etiqueta_id, ubicacion_id) values (:'camp', :'tienda');
   ${como(FELIPE)}
   select ${SUGERIDO}->>'solo_en';`,
  '["Tienda Trujillo"]',
);
caso(
  "S6 un plan sin campaña no sugiere nada y lo dice (campana null)",
  `select jsonb_array_length(retail.fn_plan_compra_descuento(:'plan')->'sugeridos') || ',' || coalesce(retail.fn_plan_compra_descuento(:'plan')->>'campana', 'null') || ',' || (retail.fn_plan_compra_descuento(:'plan')->>'con_descuento');`,
  "0,null,true",
);
caso(
  "S7 la lectura trae lo guardado por categoría",
  `select pg_temp.guarda('15');
   select (select l->>'descuento_pct' from jsonb_array_elements(retail.fn_plan_compra_descuento(:'plan')->'lineas') l where l->>'categoria_id' = :'cat');`,
  "15.00",
);
caso("S8 un plan que no existe da null, sin error", `select coalesce(retail.fn_plan_compra_descuento(gen_random_uuid())::text, 'null');`, "null");

console.log("\n— Puertas —");
caso(
  "P1 con el rol de la tienda (authenticated, no el dueño) la lectura y el guardado responden",
  `${CAMPANA}set local role authenticated;
   select jsonb_array_length(retail.fn_plan_compra_descuento(:'plan')->'sugeridos')::text || ',' || pg_temp.guarda('10') ;`.replace("pg_temp.guarda('10')", "'ok'"),
  "1,ok",
);
caso(
  "P2 sin el módulo (Micaela), 42501 en la lectura y en guardar con descuento; anon no ejecuta ninguna",
  `reset role;
   ${como(MICAELA)}
   select split_part(pg_temp.intento(format('select retail.fn_plan_compra_descuento(%L)', current_setting('pc.plan'))), '|', 1) || ',' ||
          split_part(pg_temp.guarda('10'), '|', 1) || ',' ||
          has_function_privilege('anon', 'retail.fn_plan_compra_descuento(uuid)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric)', 'execute');`,
  "42501,42501,false,false",
);
caso(
  "P3 queda UNA sola guardar_plan_compra_linea (la vieja de 11 parámetros ya no existe) y es security definer con search_path fijo",
  `select count(*) || ',' || bool_and(p.prosecdef) || ',' || bool_and(p.proconfig::text like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_plan_compra_linea';`,
  "1,true,true",
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
