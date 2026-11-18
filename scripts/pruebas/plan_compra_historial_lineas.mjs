#!/usr/bin/env node
/**
 * Pruebas del historial de las líneas del Plan de campaña (ADR-0520) — migración `20261026171000_plan_compra_historial_de_lineas.sql`:
 * la tabla `planes_compra_lineas_historial`, `guardar_plan_compra_linea` con `p_propuesta` y la interna `fn_plan_compra_linea_al_historial`.
 *
 * LO QUE VIGILA. Que cada guardado de una categoría deje UNA fila con lo que quedó guardado, su versión, quién y la propuesta que mostró la
 * pantalla; que un guardado rechazado (o que el historial no pueda escribir) no deje NADA; que la fila no se pueda editar ni borrar ni
 * escribiendo la tabla; que una propuesta que no es un objeto o es enorme se rechace; que el guardado responda a la sesión de la tienda (el
 * rol `authenticated`, no el dueño: ADR-0496 rompió a toda la tienda 16 h por probar solo como dueño); y que la migración se pueda pegar dos
 * veces y se niegue a reemplazar una función que ya no es la que se leyó (md5).
 *
 * USO
 *   pnpm pruebas:plan-compra-historial-lineas              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK)
 *   pnpm pruebas:plan-compra-historial-lineas --base otra  → contra otra base del mismo contenedor
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");
const MIGRACION = sinControl(readFileSync(join(RAIZ, "supabase", "migrations", "20261026171000_plan_compra_historial_de_lineas.sql"), "utf8"));

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

// La migración se carga dentro de cada caso: corre igual con la base al día (la firma de 13 parámetros ya existe) o sin la nueva (la de 12).
const PRELUDIO = `
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
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
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Plan con historial', date '2026-12-01', date '2026-12-31') returning id as plan \\gset
insert into retail.categorias (nombre, familia) values ('PC Polos historial', 'indumentaria') returning id as cat \\gset
select set_config('pc.plan', :'plan', true) as _1, set_config('pc.cat', :'cat', true) as _2 \\gset
-- Guarda con los argumentos de la web nueva (con propuesta) o de la de antes (sin ella). p_version: la que leyó la hoja ('null' = no la manda).
-- p_extra: texto SQL que se suma a la llamada (otro descuento, otra curva).
create function pg_temp.guarda(p_normal integer default 120, p_propuesta text default null, p_version text default 'null', p_extra text default '') returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_linea(p_plan_id => %L, p_categoria_id => %L, p_flojo => 80, p_normal => %s, p_bueno => 180, p_precio => 79.90, p_costo => 32, p_recupero_pct => 50, p_version_esperada => %s%s%s)',
    current_setting('pc.plan'), current_setting('pc.cat'), p_normal, p_version,
    case when p_propuesta is null then '' else format(', p_propuesta => %L::jsonb', p_propuesta) end, p_extra));
end $$;
${como(FELIPE)}
`;
const HIST = `(select count(*) from retail.planes_compra_lineas_historial where plan_id = current_setting('pc.plan')::uuid and categoria_id = current_setting('pc.cat')::uuid)`;
const LINEAS = `(select count(*) from retail.planes_compra_lineas where plan_id = current_setting('pc.plan')::uuid and categoria_id = current_setting('pc.cat')::uuid)`;
const FILAS = `retail.planes_compra_lineas_historial h where h.plan_id = current_setting('pc.plan')::uuid and h.categoria_id = current_setting('pc.cat')::uuid`;
// Una fila escrita directo (como el dueño), para probar lo que la tabla no deja.
const FILA_DIRECTA = (version, normal, propuesta) =>
  `insert into retail.planes_compra_lineas_historial (plan_id, categoria_id, version, flojo, normal, bueno, precio, costo, recupero_pct, propuesta, guardado_por)
     values (current_setting('pc.plan')::uuid, current_setting('pc.cat')::uuid, ${version}, 1, ${normal}, 10, 50, 20, 50, ${propuesta}, (select id from public.personas limit 1))`;

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

console.log("— Guardar y recordar —");
caso(
  "H1 una categoría nueva deja UNA fila: versión 1, lo guardado, quién lo guardó y la propuesta tal cual",
  `select pg_temp.guarda(120, '{"v":1,"normal":118}') as r \\gset
   select :'r' || ',' || ${HIST} || ',' || (select h.version || ',' || h.normal || ',' || (h.propuesta->>'normal') || ',' ||
       (h.guardado_por = (select l.actualizado_por from retail.planes_compra_lineas l where l.plan_id = h.plan_id and l.categoria_id = h.categoria_id))
     from ${FILAS});`,
  "SIN_ERROR,1,1,120,118,true",
);
caso(
  "H2 guardar otra vez con otro normal deja una segunda fila (versión 2) y la primera no cambia",
  `select pg_temp.guarda(120, '{"tag":"A"}') as r1 \\gset
   select pg_temp.guarda(150, '{"tag":"B"}') as r2 \\gset
   select (select string_agg(h.version || ':' || h.normal || ':' || (h.propuesta->>'tag'), ',' order by h.version) from ${FILAS});`,
  "1:120:A,2:150:B",
);
caso(
  "H3 el doble clic (el mismo guardado dos veces) deja dos filas con versiones seguidas e iguales: no se esconde lo que pasó",
  `select pg_temp.guarda(120, '{"tag":"A"}') as r1 \\gset
   select pg_temp.guarda(120, '{"tag":"A"}') as r2 \\gset
   select (select count(*) || ',' || min(h.version) || ',' || max(h.version) || ',' || count(distinct h.normal) from ${FILAS});`,
  "2,1,2,1",
);
caso(
  "H4 la web de antes (sin propuesta) guarda igual y la fila queda sin propuesta",
  `select pg_temp.guarda(120) as r \\gset
   select :'r' || ',' || ${HIST} || ',' || (select h.propuesta is null from ${FILAS});`,
  "SIN_ERROR,1,true",
);
caso(
  "H5 un null de JSON cuenta como sin propuesta",
  `select pg_temp.guarda(120, 'null') as r \\gset
   select :'r' || ',' || (select h.propuesta is null from ${FILAS});`,
  "SIN_ERROR,true",
);
caso(
  "H6 el historial copia lo que QUEDÓ en la línea, no lo que se mandó: sin descuento en la llamada se conserva el 20 % guardado",
  `select pg_temp.guarda(120, null, 'null', ', p_descuento_pct => 20') as r1 \\gset
   select pg_temp.guarda(130) as r2 \\gset
   select (select string_agg(h.descuento_pct::text, ',' order by h.version) from ${FILAS});`,
  "20.00,20.00",
);

caso(
  "H7 la ruta de la web de ahora (con la versión que leyó la hoja; 0 = no había plan) también escribe: fila versión 1 con su propuesta",
  `select pg_temp.guarda(120, '{"tag":"A"}', '0') as r \\gset
   select :'r' || ',' || ${HIST} || ',' || (select h.version || ':' || (h.propuesta->>'tag') from ${FILAS});`,
  "SIN_ERROR,1,1:A",
);

console.log("\n— Todo o nada —");
caso(
  "A1 un guardado rechazado (curva con una talla que no es de la categoría) no deja ni línea ni historial",
  `select split_part(pg_temp.guarda(120, '{"tag":"A"}', 'null', $x$, p_curva => '{"00000000-0000-0000-0000-000000000000":100}'::jsonb$x$), '|', 1) || ',' || ${HIST} || ',' || ${LINEAS};`,
  "P0001,0,0",
);
caso(
  "A2 si otra persona guardó entre medio (PT409) no se escribe historial: queda solo lo que había",
  `select pg_temp.guarda(120, '{"tag":"A"}', '0') as r1 \\gset
   select split_part(pg_temp.guarda(130, '{"tag":"B"}', '0'), '|', 1) || ',' || ${HIST};`,
  "PT409,1",
);
caso(
  "A3 si el historial no se puede escribir, la línea tampoco se guarda (la base no deja una sin la otra)",
  `alter table retail.planes_compra_lineas_historial add constraint zz_no_escribir check (false) not valid;
   select split_part(pg_temp.guarda(120, '{"tag":"A"}'), '|', 1) || ',' || ${LINEAS} || ',' || ${HIST};`,
  "23514,0,0",
);

console.log("\n— La propuesta —");
caso(
  "Q1 una propuesta que no es un objeto (lista, texto, número) se rechaza y no guarda nada",
  `select split_part(pg_temp.guarda(120, '[1,2]'), '|', 1) || ',' || split_part(pg_temp.guarda(120, '"hola"'), '|', 1) || ',' || split_part(pg_temp.guarda(120, '5'), '|', 1) || ',' || ${HIST} || ',' || ${LINEAS};`,
  "P0001,P0001,P0001,0,0",
);
caso(
  "Q2 cabe hasta 8 192 caracteres: con 8 192 justos guarda; con uno más se rechaza",
  `select pg_temp.guarda(120, jsonb_build_object('x', repeat('a', 8183))::text) as r1 \\gset
   select :'r1' || ',' || split_part(pg_temp.guarda(121, jsonb_build_object('x', repeat('a', 8184))::text), '|', 1) || ',' || ${HIST};`,
  "SIN_ERROR,P0001,1",
);

console.log("\n— Lo que la tabla no deja —");
caso(
  "T1 ni el dueño edita ni borra una fila del historial (42501)",
  `select pg_temp.guarda(120, '{"tag":"A"}') as r \\gset
   select split_part(pg_temp.intento('update retail.planes_compra_lineas_historial set normal = 1'), '|', 1) || ',' ||
          split_part(pg_temp.intento('delete from retail.planes_compra_lineas_historial'), '|', 1) || ',' || ${HIST};`,
  "42501,42501,1",
);
caso(
  "T2 escribiendo la tabla directo: propuesta que no es objeto, escenarios desordenados (23514) y la misma versión dos veces (23505)",
  `select pg_temp.intento($x$${FILA_DIRECTA(1, 5, "'{}'::jsonb")}$x$) as ok \\gset
   select split_part(pg_temp.intento($x$${FILA_DIRECTA(2, 5, "'[1]'::jsonb")}$x$), '|', 1) || ',' ||
          split_part(pg_temp.intento($x$${FILA_DIRECTA(3, 99, "null")}$x$), '|', 1) || ',' ||
          split_part(pg_temp.intento($x$${FILA_DIRECTA(1, 5, "null")}$x$), '|', 1);`,
  "23514,23514,23505",
);
caso(
  "T3 con el rol de la tienda no se lee ni se escribe el historial directo",
  `set local role authenticated;
   select split_part(pg_temp.intento('select 1 from retail.planes_compra_lineas_historial'), '|', 1) || ',' ||
          split_part(pg_temp.intento($x$${FILA_DIRECTA(1, 5, "null")}$x$), '|', 1);`,
  "42501,42501",
);

console.log("\n— Puertas —");
caso(
  "P1 con el rol de la tienda (authenticated, no el dueño) el guardado escribe su fila de historial",
  `set local role authenticated;
   select pg_temp.guarda(120, '{"tag":"A"}') as r \\gset
   reset role;
   select :'r' || ',' || ${HIST};`,
  "SIN_ERROR,1",
);
caso(
  "P2 sin el módulo (Micaela) guardar da 42501 y no escribe nada",
  `${como(MICAELA)}
   select split_part(pg_temp.guarda(120, '{"tag":"A"}'), '|', 1) || ',' || ${HIST} || ',' || ${LINEAS};`,
  "42501,0,0",
);
caso(
  "P3 la interna no está a la vista (ni anon ni la tienda); guardar: la tienda sí, anon no",
  `select has_function_privilege('anon', 'retail.fn_plan_compra_linea_al_historial(uuid,jsonb)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_linea_al_historial(uuid,jsonb)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric,jsonb)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.guardar_plan_compra_linea(uuid,uuid,integer,integer,integer,numeric,numeric,integer,jsonb,text,integer,numeric,jsonb)', 'execute');`,
  "false,false,false,true",
);
caso(
  "P4 queda UNA sola guardar_plan_compra_linea (la de 12 parámetros ya no existe), de 13, security definer y con search_path fijo",
  `select count(*) || ',' || max(p.pronargs) || ',' || bool_and(p.prosecdef) || ',' || bool_and(p.proconfig::text like '%search_path%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_plan_compra_linea';`,
  "1,13,true,true",
);

console.log("\n— La migración —");
caso(
  "M1 pegarla dos veces deja lo mismo: sin error, una sola función, un solo disparador",
  `select pg_temp.intento($mig$${MIGRACION}$mig$) as r \\gset
   select :'r' || ',' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'guardar_plan_compra_linea') || ',' ||
          (select count(*) from pg_trigger where tgrelid = 'retail.planes_compra_lineas_historial'::regclass and not tgisinternal);`,
  "SIN_ERROR,1,1",
);
caso(
  "M2 si la función que reemplaza cambió desde que se leyó (md5), no aplica nada y lo dice",
  `drop function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric, jsonb);
   create function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric)
     returns jsonb language sql as $s$ select null::jsonb $s$;
   select pg_temp.intento($mig$${MIGRACION}$mig$);`,
  (o) => o.startsWith("P0001|retail.guardar_plan_compra_linea cambió desde que se escribió esta migración"),
);
caso(
  "M3 si la base todavía no tiene el descuento (ninguna de las dos firmas), avisa que esta va después",
  `drop function retail.guardar_plan_compra_linea(uuid, uuid, integer, integer, integer, numeric, numeric, integer, jsonb, text, integer, numeric, jsonb);
   select pg_temp.intento($mig$${MIGRACION}$mig$);`,
  (o) => o.startsWith("P0001|retail.guardar_plan_compra_linea no existe con la firma del descuento"),
);

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
