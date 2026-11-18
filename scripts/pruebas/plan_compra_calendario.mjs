#!/usr/bin/env node
/**
 * Pruebas del calendario del Plan de campaña (ADR-0525) — migración `20261026190000_plan_compra_calendario.sql`: la tabla `plan_compra_calendario`, la columna
 * `planes_compra.calendario_id` y las funciones `fn_plan_compra_calendario`, `guardar_plan_compra_calendario`, `cambiar_uso_plan_compra_calendario`,
 * `quitar_plan_compra_calendario`, `restaurar_plan_compra_calendario` y `crear_plan_compra_propio`.
 *
 * LO QUE VIGILA. Que una campaña de Insignias tenga a lo sumo UNA fila y una propia su nombre y sus dos fechas; que una fecha que no existe (el 31 de abril) se rechace
 * y el 29 de febrero valga; que «pausada» sea la única con fecha de regreso, y futura; que quitar archive y restaurar devuelva lo que tenía (nada se borra); que el plan de una
 * campaña propia nazca con su vínculo, su nombre «<campaña> <año>» y las fechas del calendario llevadas al año (y a una propia la cruce de año se respete); que dos personas
 * a la vez sobre la misma campaña no choquen con el único; que cada puerta responda a la sesión de la tienda (el rol `authenticated`, no el dueño: ADR-0496 rompió a toda la
 * tienda 16 h por probar solo como dueño) y se cierre sin el módulo y a `anon`; y que la migración se pueda pegar dos veces.
 *
 * USO
 *   pnpm pruebas:plan-compra-calendario              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK; la concurrencia, con filas reales
 *                                                      que borra al terminar: solo toca lo que ella creó, «ZZ Cal concurrencia»)
 *   pnpm pruebas:plan-compra-calendario --base otra  → contra otra base del mismo contenedor
 */

import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENEDOR_LOCAL = "supabase_db_cayla-retail";
const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const i = process.argv.indexOf("--base");
const BASE = i > 0 ? process.argv[i + 1] : "postgres";
const sinControl = (sql) => sql.replace(/^set lock_timeout.*$/m, "").replace(/^reset lock_timeout;$/m, "").replace(/^notify pgrst.*$/m, "");
const MIGRACION = sinControl(readFileSync(join(RAIZ, "supabase", "migrations", "20261026190000_plan_compra_calendario.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001";
const MICAELA = "22222222-2222-4222-8222-000000000003";

const ARGS_PSQL = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function correr(sql) {
  try {
    const salida = execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
    return { ok: true, salida: salida.trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

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
create function pg_temp.ok(p text) returns text language plpgsql as $$
begin
  if p <> 'SIN_ERROR' then raise exception 'la preparación del caso falló: %', p; end if;
  return p;
end $$;
-- Las campañas de Insignias de prueba las crea Felipe (líder): el disparador de \`etiquetas\` solo las deja «aprobadas» si quien las crea tiene la llave de campañas.
${como(FELIPE)}
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta) values ('ZZ Cal Navidad', 'campana', date '2026-12-11', date '2026-12-25') returning id as e1 \\gset
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta) values ('ZZ Cal Madre', 'campana', date '2026-05-10', date '2026-05-10') returning id as e2 \\gset
insert into retail.etiquetas (nombre, estilo) values ('ZZ Cal Neutra', 'neutral') returning id as e3 \\gset
select set_config('cal.e1', :'e1', true) as _1, set_config('cal.e2', :'e2', true) as _2, set_config('cal.e3', :'e3', true) as _3 \\gset
-- El interruptor: la campaña de Insignias \`n\` entra (activa) o no.
create function pg_temp.usa(p_etiqueta integer, p_uso text) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.cambiar_uso_plan_compra_calendario(null, %L, %L)', current_setting('cal.e' || p_etiqueta), p_uso));
end $$;
-- Guarda con todos los argumentos (null = sin él). p_destino: la insignia 'e1'/'e2'/'e3', un id de fila, o null para una propia nueva.
create function pg_temp.guarda(p_id text, p_etiqueta integer, p_nombre text, p_desde text, p_hasta text, p_uso text, p_pausa text, p_repite text, p_anio text) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_calendario(%L::uuid, %L::uuid, %L, %L, %L, %L, %L::date, %L, %L::integer)',
    p_id, case when p_etiqueta is null then null else current_setting('cal.e' || p_etiqueta) end, p_nombre, p_desde, p_hasta, p_uso, p_pausa, p_repite, p_anio));
end $$;
-- Una propia nueva con lo mínimo (activa, cada año).
create function pg_temp.propia(p_nombre text, p_desde text default '06-07', p_hasta text default '06-21') returns text language plpgsql as $$
begin
  return pg_temp.guarda(null, null, p_nombre, p_desde, p_hasta, 'activa', null, 'anual', null);
end $$;
-- Security definer: con el rol de la tienda la tabla no se lee, y las pruebas de puertas necesitan el id de una propia que ya existe.
create function pg_temp.id_de(p_nombre text) returns uuid language sql security definer as $$ select id from retail.plan_compra_calendario where nombre = p_nombre $$;
-- «Hoy» y «unos días más» como los cuenta la base (Lima), no el reloj del servidor: cerca de la medianoche difieren un día.
create function pg_temp.dias(p_n integer) returns text language sql as $$ select (retail.fn_hoy_lima() + p_n)::text $$;
`;
const FILAS = `(select count(*) from retail.plan_compra_calendario c where c.etiqueta_id in (current_setting('cal.e1')::uuid, current_setting('cal.e2')::uuid, current_setting('cal.e3')::uuid) or c.nombre like 'ZZ%')`;
const DE_INSIGNIA = (n) => `(select c.uso || ':' || coalesce(c.pausa_hasta::text, '-') || ':' || c.repite || ':' || coalesce(c.desde_md, '-') || ':' || (c.quitada_en is not null) from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e${n}')::uuid)`;

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
const codigo = (r) => `split_part(${r}, '|', 1)`;
const INSERT_DIRECTO = (cols, vals) => `insert into retail.plan_compra_calendario (${cols}, creada_por, actualizada_por) values (${vals}, (select id from public.personas limit 1), (select id from public.personas limit 1))`;

console.log("— El interruptor —");
caso(
  "I1 prender una campaña de Insignias sin decisión crea su fila (activa, cada año); apagarla actualiza la MISMA fila",
  `select pg_temp.ok(pg_temp.usa(1, 'activa')) as _1 \\gset
   select ${DE_INSIGNIA(1)} as a \\gset
   select pg_temp.ok(pg_temp.usa(1, 'no')) as _2 \\gset
   select :'a' || ',' || ${DE_INSIGNIA(1)} || ',' || ${FILAS};`,
  "activa:-:anual:-:false,no:-:anual:-:false,1",
);
caso(
  "I2 «pausada» no se elige con el interruptor (se elige en la hoja), y una campaña que no es de Insignias (neutral) o que no existe se rechaza",
  `select ${codigo("pg_temp.usa(1, 'pausada')")} || ',' || ${codigo("pg_temp.usa(3, 'activa')")} || ',' || ${codigo(`pg_temp.intento(format('select retail.cambiar_uso_plan_compra_calendario(null, %L, %L)', '00000000-0000-0000-0000-000000000000', 'activa'))`)} || ',' || ${codigo(`pg_temp.intento('select retail.cambiar_uso_plan_compra_calendario(null, null, ''activa'')')`)} || ',' || ${FILAS};`,
  "P0001,P0001,P0001,P0001,0",
);
caso(
  "I3 prender una pausada la reactiva y le quita su fecha de regreso",
  `select pg_temp.ok(pg_temp.guarda(null, 1, null, null, null, 'pausada', pg_temp.dias(30), 'anual', null)) as _1 \\gset
   select pg_temp.ok(pg_temp.usa(1, 'activa')) as _2 \\gset
   select ${DE_INSIGNIA(1)};`,
  "activa:-:anual:-:false",
);

console.log("\n— Guardar una campaña de Insignias —");
caso(
  "G1 pausada con regreso a futuro; las fechas del plan (más anchas) se guardan completas",
  `select pg_temp.ok(pg_temp.guarda(null, 1, null, '11-20', '12-31', 'pausada', pg_temp.dias(90), 'anual', null)) as _1 \\gset
   select (c.uso = 'pausada') || ',' || (c.pausa_hasta = retail.fn_hoy_lima() + 90) || ',' || c.desde_md || ',' || c.hasta_md || ',' || (c.nombre is null) from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e1')::uuid;`,
  "true,true,11-20,12-31,true",
);
caso(
  "G2 un regreso que no es posterior a hoy se rechaza; sin fecha, descansa hasta que la reactiven; un regreso en una campaña que no está pausada se descarta",
  `select ${codigo("pg_temp.guarda(null, 1, null, null, null, 'pausada', pg_temp.dias(0), 'anual', null)")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, null, null, 'pausada', pg_temp.dias(-3), 'anual', null)")} || ',' || ${FILAS} as a \\gset
   select pg_temp.ok(pg_temp.guarda(null, 1, null, null, null, 'pausada', null, 'anual', null)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda(null, 2, null, null, null, 'activa', pg_temp.dias(5), 'anual', null)) as _2 \\gset
   select :'a' || ',' || ${DE_INSIGNIA(1)} || ',' || ${DE_INSIGNIA(2)};`,
  "P0001,P0001,0,pausada:-:anual:-:false,activa:-:anual:-:false",
);
caso(
  "G3 las dos fechas o ninguna; una fecha que no existe (31 de abril) se rechaza y el 29 de febrero vale",
  `select ${codigo("pg_temp.guarda(null, 1, null, '11-20', null, 'activa', null, 'anual', null)")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, '04-31', '05-10', 'activa', null, 'anual', null)")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, '13-01', '05-10', 'activa', null, 'anual', null)")} || ',' || ${FILAS} as a \\gset
   select pg_temp.ok(pg_temp.guarda(null, 1, null, '02-29', '03-05', 'activa', null, 'anual', null)) as _1 \\gset
   select :'a' || ',' || ${DE_INSIGNIA(1)};`,
  "P0001,P0001,P0001,0,activa:-:anual:02-29:false",
);
caso(
  "G4 «cada año» no trae un año fijo y «solo un año» sí; un uso o una repetición que no existen se rechazan",
  `select ${codigo("pg_temp.guarda(null, 1, null, null, null, 'activa', null, 'anual', '2026')")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, null, null, 'activa', null, 'unica', null)")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, null, null, 'quizas', null, 'anual', null)")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, null, null, 'activa', null, 'siempre', null)")} || ',' || ${codigo("pg_temp.guarda(null, 1, null, null, null, 'activa', null, 'unica', '1999')")} || ',' || ${FILAS} as a \\gset
   select pg_temp.ok(pg_temp.guarda(null, 1, null, null, null, 'activa', null, 'unica', '2027')) as _1 \\gset
   select :'a' || ',' || (select c.repite || ':' || c.anio_unico from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e1')::uuid);`,
  "P0001,P0001,P0001,P0001,P0001,0,unica:2027",
);
caso(
  "G5 guardar la misma insignia dos veces actualiza la misma fila (nunca dos); el nombre que se mande para una insignia se ignora (el nombre es el de la insignia)",
  `select pg_temp.ok(pg_temp.guarda(null, 1, 'Otro nombre', null, null, 'activa', null, 'anual', null)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda(null, 1, 'Otro nombre', null, null, 'no', null, 'anual', null)) as _2 \\gset
   select ${FILAS} || ',' || (select c.nombre is null from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e1')::uuid);`,
  "1,true",
);

console.log("\n— Campañas propias —");
caso(
  "P1 una propia nueva trae nombre y las dos fechas; se guarda sin insignia y se lee con su nombre",
  `select pg_temp.ok(pg_temp.propia('ZZ Día del Padre')) as _1 \\gset
   select (c.etiqueta_id is null) || ',' || c.nombre || ',' || c.desde_md || ',' || c.hasta_md || ',' || c.uso from retail.plan_compra_calendario c where c.nombre = 'ZZ Día del Padre';`,
  "true,ZZ Día del Padre,06-07,06-21,activa",
);
caso(
  "P2 sin nombre, sin fechas, con un nombre repetido (con otras mayúsculas) o con el nombre de una insignia se rechaza",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select ${codigo("pg_temp.propia('')")} || ',' || ${codigo("pg_temp.guarda(null, null, 'ZZ Sin fechas', null, null, 'activa', null, 'anual', null)")} || ',' || ${codigo("pg_temp.propia('zz padre')")} || ',' || ${codigo("pg_temp.propia('ZZ  PADRE')")} || ',' || ${codigo("pg_temp.propia('ZZ Cal Navidad')")} || ',' || (select count(*) from retail.plan_compra_calendario c where c.nombre like 'ZZ%');`,
  "P0001,P0001,P0001,P0001,P0001,1",
);
caso(
  "P3 una propia se puede renombrar (sin chocar con otra) y cambiar de fechas, de uso y de repetición",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select pg_temp.ok(pg_temp.propia('ZZ Abuelo')) as _2 \\gset
   select ${codigo("pg_temp.guarda(pg_temp.id_de('ZZ Padre')::text, null, 'ZZ Abuelo', '06-07', '06-21', 'activa', null, 'anual', null)")} as choque \\gset
   select pg_temp.ok(pg_temp.guarda(pg_temp.id_de('ZZ Padre')::text, null, 'ZZ Padre del año', '06-01', '06-21', 'pausada', pg_temp.dias(60), 'unica', '2027')) as _3 \\gset
   select :'choque' || ',' || (select c.nombre || ':' || c.desde_md || ':' || c.uso || ':' || c.repite || ':' || c.anio_unico from retail.plan_compra_calendario c where c.nombre like 'ZZ Padre%');`,
  "P0001,ZZ Padre del año:06-01:pausada:unica:2027",
);
caso(
  "P4 una propia incompleta no se deja ni editando (sin las dos fechas)",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select ${codigo("pg_temp.guarda(pg_temp.id_de('ZZ Padre')::text, null, 'ZZ Padre', null, null, 'activa', null, 'anual', null)")} || ',' || (select c.desde_md from retail.plan_compra_calendario c where c.nombre = 'ZZ Padre');`,
  "P0001,06-07",
);

console.log("\n— Quitar y restaurar —");
caso(
  "Q1 quitar archiva (no borra): deja quién y cuándo; una quitada no se edita ni se prende hasta restaurarla; restaurar la devuelve con lo que tenía",
  `select pg_temp.ok(pg_temp.guarda(null, 1, null, '11-20', '12-31', 'pausada', pg_temp.dias(90), 'anual', null)) as _1 \\gset
   select (select retail.quitar_plan_compra_calendario(null, current_setting('cal.e1')::uuid)) is not null as _q \\gset
   select ((c.quitada_en is not null) || ',' || (c.quitada_por is not null) || ',' || c.uso) as quitada from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e1')::uuid \\gset
   select ${codigo("pg_temp.usa(1, 'activa')")} as a \\gset
   select ${codigo("pg_temp.guarda(null, 1, null, null, null, 'activa', null, 'anual', null)")} as b \\gset
   select (select retail.restaurar_plan_compra_calendario((select id from retail.plan_compra_calendario where etiqueta_id = current_setting('cal.e1')::uuid))) is not null as _r \\gset
   select :'quitada' || ',' || :'a' || ',' || :'b' || ',' ||
          (select c.uso || ':' || (c.pausa_hasta = retail.fn_hoy_lima() + 90) || ':' || c.repite || ':' || c.desde_md || ':' || (c.quitada_en is not null) from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e1')::uuid) || ',' || ${FILAS};`,
  "true,true,pausada,P0001,P0001,pausada:true:anual:11-20:false,1",
);
caso(
  "Q2 quitar una insignia sin decisión crea su fila, quitada y en «no»; quitar de nuevo no pisa el cuándo ni el quién de la primera vez",
  `select (select retail.quitar_plan_compra_calendario(null, current_setting('cal.e2')::uuid)) is not null as _a \\gset
   update retail.plan_compra_calendario set quitada_en = now() - interval '5 days' where etiqueta_id = current_setting('cal.e2')::uuid;
   select (select retail.quitar_plan_compra_calendario(null, current_setting('cal.e2')::uuid)) is not null as _b \\gset
   select ${DE_INSIGNIA(2)} || ',' || (select c.quitada_en = now() - interval '5 days' from retail.plan_compra_calendario c where c.etiqueta_id = current_setting('cal.e2')::uuid) || ',' || ${FILAS};`,
  "no:-:anual:-:true,true,1",
);
caso(
  "Q3 quitar una propia la archiva (el plan y su nombre quedan); restaurarla la devuelve; una campaña que no existe se rechaza",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select (select retail.quitar_plan_compra_calendario(pg_temp.id_de('ZZ Padre'), null)) is not null as _q \\gset
   select (select retail.restaurar_plan_compra_calendario(pg_temp.id_de('ZZ Padre'))) is not null as _r \\gset
   select ${codigo(`pg_temp.intento('select retail.quitar_plan_compra_calendario(''00000000-0000-0000-0000-000000000000'', null)')`)} || ',' || ${codigo(`pg_temp.intento('select retail.restaurar_plan_compra_calendario(''00000000-0000-0000-0000-000000000000'')')`)} || ',' || (select c.quitada_en is null from retail.plan_compra_calendario c where c.nombre = 'ZZ Padre');`,
  "P0001,P0001,true",
);

console.log("\n— El plan de una campaña propia —");
const PLAN_PROPIO = (anio, extra = "") => `pg_temp.intento(format('select retail.crear_plan_compra_propio(%L, ${anio}${extra})', pg_temp.id_de('ZZ Padre')))`;
caso(
  "N1 nace con su vínculo, su nombre «<campaña> <año>» y las fechas del calendario llevadas al año; la campaña pasa a activa",
  `select pg_temp.ok(pg_temp.guarda(null, null, 'ZZ Padre', '06-07', '06-21', 'no', null, 'anual', null)) as _1 \\gset
   select pg_temp.ok(${PLAN_PROPIO(2027)}) as _2 \\gset
   select p.nombre || ',' || p.desde || ',' || p.hasta || ',' || (p.calendario_id = pg_temp.id_de('ZZ Padre')) || ',' || (p.etiqueta_id is null) || ',' || (select c.uso from retail.plan_compra_calendario c where c.nombre = 'ZZ Padre')
     from retail.planes_compra p where p.calendario_id = pg_temp.id_de('ZZ Padre');`,
  "ZZ Padre 2027,2027-06-07,2027-06-21,true,true,activa",
);
caso(
  "N2 un plan por campaña propia y año: el mismo año otra vez se rechaza; otro año sí; un nombre que ya existe se rechaza",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select pg_temp.ok(${PLAN_PROPIO(2027)}) as _2 \\gset
   select ${codigo(PLAN_PROPIO(2027))} as a \\gset
   select ${PLAN_PROPIO(2028)} as b \\gset
   select ${codigo(PLAN_PROPIO(2029, ", ''ZZ Padre 2027''"))} as c \\gset
   select :'a' || ',' || :'b' || ',' || :'c' || ',' || (select count(*) from retail.planes_compra p where p.calendario_id = pg_temp.id_de('ZZ Padre'));`,
  "P0001,SIN_ERROR,P0001,2",
);
caso(
  "N3 el año es el del FIN de la campaña (como en la web y en el nombre del plan): una que cruza el año (20 dic a 6 ene) empieza en el año anterior; el 29 de febrero cae al 28 en un año que no es bisiesto",
  `select pg_temp.ok(pg_temp.propia('ZZ Fin de año', '12-20', '01-06')) as _1 \\gset
   select pg_temp.ok(pg_temp.propia('ZZ Bisiesto', '02-29', '03-05')) as _2 \\gset
   select (retail.crear_plan_compra_propio(pg_temp.id_de('ZZ Fin de año'), 2027)->>'id') as p1 \\gset
   select (retail.crear_plan_compra_propio(pg_temp.id_de('ZZ Bisiesto'), 2027)->>'id') as p2 \\gset
   select (select nombre || ':' || desde || '/' || hasta from retail.planes_compra where id = :'p1'::uuid) || ',' || (select desde || '/' || hasta from retail.planes_compra where id = :'p2'::uuid);`,
  "ZZ Fin de año 2027:2026-12-20/2027-01-06,2027-02-28/2027-03-05",
);
caso(
  "N6 las fechas que manda la web (las del calendario llevadas al año) mandan sobre las de la campaña; el nombre lleva el año del fin; y una que termina antes de empezar se rechaza",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select pg_temp.ok(pg_temp.intento(format('select retail.crear_plan_compra_propio(%L, 2027, null, date ''2027-05-20'', date ''2027-06-30'')', pg_temp.id_de('ZZ Padre')))) as _2 \\gset
   select ${codigo(`pg_temp.intento(format('select retail.crear_plan_compra_propio(%L, 2028, null, date ''2028-06-30'', date ''2028-06-01'')', pg_temp.id_de('ZZ Padre')))`)} as malas \\gset
   select (select nombre || ':' || desde || '/' || hasta from retail.planes_compra where calendario_id = pg_temp.id_de('ZZ Padre')) || ',' || :'malas';`,
  "ZZ Padre 2027:2027-05-20/2027-06-30,P0001",
);
caso(
  "N4 solo sirve para una propia vigente: una de Insignias, una quitada o una que no existe se rechazan",
  `select pg_temp.ok(pg_temp.usa(1, 'activa')) as _1 \\gset
   select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _2 \\gset
   select ${codigo(`pg_temp.intento(format('select retail.crear_plan_compra_propio(%L, 2027)', (select id from retail.plan_compra_calendario where etiqueta_id = current_setting('cal.e1')::uuid)))`)} as a \\gset
   select ${codigo(`pg_temp.intento('select retail.crear_plan_compra_propio(''00000000-0000-0000-0000-000000000000'', 2027)')`)} as b \\gset
   select (select retail.quitar_plan_compra_calendario(pg_temp.id_de('ZZ Padre'), null)) is not null as _q \\gset
   select :'a' || ',' || :'b' || ',' || ${codigo(PLAN_PROPIO(2027))};`,
  "P0001,P0001,P0001",
);
caso(
  "N5 un plan no puede ser de una insignia Y de una propia a la vez, ni dos del mismo año de la misma propia (escribiendo la tabla directo)",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select pg_temp.intento(format('insert into retail.planes_compra (nombre, desde, hasta, etiqueta_id, calendario_id) values (''ZZ doble'', date ''2027-06-01'', date ''2027-06-30'', %L, %L)', current_setting('cal.e1'), pg_temp.id_de('ZZ Padre'))) as a \\gset
   select pg_temp.intento(format('insert into retail.planes_compra (nombre, desde, hasta, calendario_id) values (''ZZ uno'', date ''2027-06-01'', date ''2027-06-30'', %L)', pg_temp.id_de('ZZ Padre'))) as ok1 \\gset
   select pg_temp.intento(format('insert into retail.planes_compra (nombre, desde, hasta, calendario_id) values (''ZZ dos'', date ''2027-07-01'', date ''2027-07-30'', %L)', pg_temp.id_de('ZZ Padre'))) as dos \\gset
   select split_part(:'a', '|', 1) || ',' || :'ok1' || ',' || split_part(:'dos', '|', 1);`,
  "23514,SIN_ERROR,23505",
);

console.log("\n— Lo que la tabla no deja —");
caso(
  "T1 la misma insignia dos veces (23505), una propia incompleta (23514), una insignia con nombre (23514), una propia completa entra y otra con el mismo nombre en otras mayúsculas no (23505)",
  `select ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id", "current_setting('cal.e1')::uuid")}$x$)`)} as ok \\gset
   select ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id", "current_setting('cal.e1')::uuid")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("nombre", "'ZZ sin fechas'")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, nombre", "current_setting('cal.e2')::uuid, 'ZZ con nombre'")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("nombre, desde_md, hasta_md", "'ZZ Uno', '01-01', '01-02'")}$x$)`)} as a \\gset
   select :'a' || ',' || ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("nombre, desde_md, hasta_md", "'zz uno', '01-01', '01-02'")}$x$)`)};`,
  "23505,23514,23514,SIN_ERROR,23505",
);
caso(
  "T2«solo un año» sin año, «cada año» con año, un regreso sin estar pausada, una sola fecha, una fecha mal escrita y una quitada sin autor se rechazan (23514)",
  `select ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, repite", "current_setting('cal.e1')::uuid, 'unica'")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, anio_unico", "current_setting('cal.e1')::uuid, 2027")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, pausa_hasta", "current_setting('cal.e1')::uuid, current_date + 3")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, desde_md", "current_setting('cal.e1')::uuid, '01-01'")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, desde_md, hasta_md", "current_setting('cal.e1')::uuid, '1-1', '12-31'")}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id, quitada_en", "current_setting('cal.e1')::uuid, now()")}$x$)`)};`,
  "23514,23514,23514,23514,23514,23514",
);
caso(
  "T3 con el rol de la tienda no se lee ni se escribe la tabla directo",
  `set local role authenticated;
   select ${codigo("pg_temp.intento('select 1 from retail.plan_compra_calendario')")} || ',' || ${codigo(`pg_temp.intento($x$${INSERT_DIRECTO("etiqueta_id", "current_setting('cal.e1')::uuid")}$x$)`)};`,
  "42501,42501",
);

console.log("\n— Leer —");
caso(
  "L1 la lectura trae la marca soportado, el hoy de Lima y cada fila con sus planes (los de las propias, con año y si están archivados)",
  `select pg_temp.ok(pg_temp.usa(1, 'activa')) as _1 \\gset
   select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _2 \\gset
   select pg_temp.ok(${PLAN_PROPIO(2027)}) as _3 \\gset
   select (r->>'soportado') || ',' || ((r->>'hoy')::date = retail.fn_hoy_lima()) || ',' ||
          (select count(*) from jsonb_array_elements(r->'filas') f where f->>'etiqueta_id' = current_setting('cal.e1')) || ',' ||
          (select (f->'planes'->0->>'anio') || ':' || (f->'planes'->0->>'archivado') || ':' || (f->>'nombre') from jsonb_array_elements(r->'filas') f where f->>'nombre' = 'ZZ Padre')
     from (select retail.fn_plan_compra_calendario() as r) q;`,
  "true,true,1,2027:false:ZZ Padre",
);
caso(
  "L2 una quitada sale marcada (la web la esconde, no la pierde) y dice quién la tocó por su nombre, no por su id",
  `select pg_temp.ok(pg_temp.propia('ZZ Padre')) as _1 \\gset
   select (select retail.quitar_plan_compra_calendario(pg_temp.id_de('ZZ Padre'), null)) is not null as _2 \\gset
   select (f->>'quitada') || ',' || ((f->>'por') is not null and (f->>'por') !~ '^[0-9a-f-]{36}$')
     from (select jsonb_array_elements((retail.fn_plan_compra_calendario())->'filas') as f) q where f->>'nombre' = 'ZZ Padre';`,
  "true,true",
);

console.log("\n— Puertas —");
caso(
  "P1 con el rol de la tienda (authenticated, no el dueño) las seis funciones responden",
  `set local role authenticated;
   select pg_temp.usa(1, 'activa') as a \\gset
   select pg_temp.propia('ZZ Padre') as b \\gset
   select pg_temp.intento(format('select retail.crear_plan_compra_propio(%L, 2027)', pg_temp.id_de('ZZ Padre'))) as c \\gset
   select pg_temp.intento(format('select retail.quitar_plan_compra_calendario(%L, null)', pg_temp.id_de('ZZ Padre'))) as d \\gset
   select pg_temp.intento(format('select retail.restaurar_plan_compra_calendario(%L)', pg_temp.id_de('ZZ Padre'))) as e \\gset
   select (retail.fn_plan_compra_calendario() is not null)::text as f \\gset
   select :'a' || ',' || :'b' || ',' || :'c' || ',' || :'d' || ',' || :'e' || ',' || :'f';`,
  "SIN_ERROR,SIN_ERROR,SIN_ERROR,SIN_ERROR,SIN_ERROR,true",
);
caso(
  "P2 sin el módulo (Micaela) las seis dan 42501 y no escriben nada",
  `${como(MICAELA)}
   select ${codigo("pg_temp.usa(1, 'activa')")} || ',' || ${codigo("pg_temp.propia('ZZ Padre')")} || ',' ||
          ${codigo(`pg_temp.intento('select retail.crear_plan_compra_propio(''00000000-0000-0000-0000-000000000000'', 2027)')`)} || ',' ||
          ${codigo(`pg_temp.intento('select retail.quitar_plan_compra_calendario(''00000000-0000-0000-0000-000000000000'', null)')`)} || ',' ||
          ${codigo(`pg_temp.intento('select retail.restaurar_plan_compra_calendario(''00000000-0000-0000-0000-000000000000'')')`)} || ',' ||
          ${codigo(`pg_temp.intento('select retail.fn_plan_compra_calendario()')`)} || ',' || ${FILAS};`,
  "42501,42501,42501,42501,42501,42501,0",
);
caso(
  "P3 anon no ejecuta ninguna; la tienda ejecuta las seis y ninguna interna",
  `select has_function_privilege('anon', 'retail.fn_plan_compra_calendario()', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.guardar_plan_compra_calendario(uuid,uuid,text,text,text,text,date,text,integer)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.cambiar_uso_plan_compra_calendario(uuid,uuid,text)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.quitar_plan_compra_calendario(uuid,uuid)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.restaurar_plan_compra_calendario(uuid)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.crear_plan_compra_propio(uuid,integer,text,date,date)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_calendario()', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.guardar_plan_compra_calendario(uuid,uuid,text,text,text,text,date,text,integer)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.cambiar_uso_plan_compra_calendario(uuid,uuid,text)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.quitar_plan_compra_calendario(uuid,uuid)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.restaurar_plan_compra_calendario(uuid)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.crear_plan_compra_propio(uuid,integer,text,date,date)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_md_valido(text)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_md_en(text,integer)', 'execute');`,
  "false,false,false,false,false,false,true,true,true,true,true,true,false,false",
);
caso(
  "P4 las seis públicas son security definer con search_path fijo",
  `select count(*) || ',' || bool_and(p.prosecdef) || ',' || bool_and(p.proconfig::text like '%search_path%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('fn_plan_compra_calendario', 'guardar_plan_compra_calendario', 'cambiar_uso_plan_compra_calendario', 'quitar_plan_compra_calendario', 'restaurar_plan_compra_calendario', 'crear_plan_compra_propio');`,
  "6,true,true",
);

console.log("\n— La migración —");
caso(
  "M1 pegarla dos veces deja lo mismo: sin error, una sola de cada función, un solo índice por regla y una sola columna",
  `select pg_temp.intento($mig$${MIGRACION}$mig$) as r \\gset
   select :'r' || ',' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('fn_plan_compra_calendario', 'guardar_plan_compra_calendario', 'cambiar_uso_plan_compra_calendario', 'quitar_plan_compra_calendario', 'restaurar_plan_compra_calendario', 'crear_plan_compra_propio', 'fn_plan_compra_md_valido', 'fn_plan_compra_md_en')) || ',' ||
          (select count(*) from pg_indexes where schemaname = 'retail' and indexname in ('plan_compra_calendario_una_por_insignia', 'plan_compra_calendario_nombre_propio', 'planes_compra_una_por_propia_y_anio')) || ',' ||
          (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'planes_compra' and column_name = 'calendario_id') || ',' ||
          (select count(*) from pg_constraint where conname = 'planes_compra_insignia_o_propia');`,
  "SIN_ERROR,8,3,1,1",
);

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Dos personas a la vez: filas REALES, dos sesiones de psql en paralelo. Lo que crea lo borra al terminar, sin tocar nada más.
// ------------------------------------------------------------------------------------------------------------------------------------------------
console.log("\n— Dos personas a la vez —");
function correrAsync(sql) {
  return new Promise((resolver) => {
    const p = execFile("docker", ARGS_PSQL, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => resolver({ ok: !err, salida: (stdout ?? "").trim(), mensaje: `${stderr ?? ""}${err?.message ?? ""}` }));
    p.stdin.end(sql);
  });
}
async function concurrencia() {
  casos++;
  const LIMPIAR = `
delete from retail.plan_compra_calendario where etiqueta_id in (select id from retail.etiquetas where nombre = 'ZZ Cal concurrencia') or nombre ilike 'ZZ Cal concurrencia%';
delete from retail.etiquetas where nombre = 'ZZ Cal concurrencia';
`;
  correr(LIMPIAR);
  const montaje = correr(`
set search_path = retail, public, extensions;
${MIGRACION}
begin;
${como(FELIPE)}
insert into retail.etiquetas (nombre, estilo, vigente_desde, vigente_hasta) values ('ZZ Cal concurrencia', 'campana', date '2026-12-11', date '2026-12-25');
commit;`);
  if (!montaje.ok) {
    fallas++;
    console.log(`✗ C1 montar la concurrencia\n    ${montaje.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? montaje.mensaje}`);
    return;
  }
  const E = `(select id from retail.etiquetas where nombre = 'ZZ Cal concurrencia')`;
  const sesion = (uso) => `begin;\n${como(FELIPE)}\nselect retail.cambiar_uso_plan_compra_calendario(null, ${E}, '${uso}');\ncommit;`;
  const propia = (nombre) => `begin;\n${como(FELIPE)}\nselect retail.guardar_plan_compra_calendario(null, null, '${nombre}', '06-07', '06-21', 'activa', null, 'anual', null);\ncommit;`;
  // Cuatro personas prenden o apagan la MISMA campaña de Insignias sin fila, a la vez: nadie debe chocar con el único; queda UNA fila. Y dos crean la misma propia a la vez: una entra y la otra recibe el mensaje claro.
  const rs = await Promise.all([sesion("activa"), sesion("no"), sesion("activa"), sesion("no"), propia("ZZ Cal concurrencia Padre"), propia("zz cal concurrencia padre")].map(correrAsync));
  const cuenta = correr(`select (select count(*) from retail.plan_compra_calendario where etiqueta_id = ${E}) || ',' || (select count(*) from retail.plan_compra_calendario where nombre ilike 'ZZ Cal concurrencia%');`);
  correr(LIMPIAR);
  const insignias = rs.slice(0, 4);
  const propias = rs.slice(4);
  const bien =
    insignias.every((r) => r.ok) &&
    propias.filter((r) => r.ok).length === 1 &&
    propias.filter((r) => !r.ok && /Ya hay una campaña con ese nombre/.test(r.mensaje)).length === 1 &&
    cuenta.ok &&
    cuenta.salida === "1,1";
  if (bien) {
    console.log("✓ C1 cuatro interruptores a la vez sobre la misma insignia dejan UNA fila (nadie choca); dos propias con el mismo nombre a la vez: una entra y la otra recibe el mensaje claro");
  } else {
    fallas++;
    console.log(`✗ C1 la concurrencia del calendario\n    esperado: 4 ok · una propia entra y la otra «Ya hay una campaña con ese nombre» · filas 1,1\n    obtenido: ${cuenta.ok ? cuenta.salida : cuenta.mensaje}\n    sesiones: ${rs.map((r) => (r.ok ? "ok" : (r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? "error"))).join(" | ")}`);
  }
}
await concurrencia();

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
