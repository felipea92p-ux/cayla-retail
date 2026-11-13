#!/usr/bin/env node
/**
 * Prueba del vigía de rendimiento (`20261113194000_vigia_de_rendimiento.sql`, ADR-0656).
 *
 * EL PROBLEMA. Un vigía que resta mal da números que parecen reales: una función que «bajó a 140 ms» porque se restó contra una foto
 * de antes de un reinicio, o que «subió» porque se contaron llamadas dos veces. Y uno que guarda el texto de las consultas filtraría
 * datos del negocio a una tabla. Esta prueba exige que las restas sean exactas y que solo queden nombres y números.
 *
 * QUÉ CUBRE
 *   A. Quién: la llave de servicio y el SQL Editor toman la foto; una colaboradora y el Admin no. El Admin lee el antes y el después;
 *      la colaboradora no; sin sesión, ni se llama. Nadie con sesión lee las tablas directo.
 *   B. Las restas son exactas: 3 llamadas entre dos fotos son 3, las 2 siguientes son 2, y una hora sin llamadas no deja fila. Una
 *      tabla leída cuenta con su nombre; lo que corre `postgres` (SQL Editor, migraciones) y lo que va dentro de un `do` no cuentan.
 *      Control: sin la función, la llave de servicio no ve el texto de esas consultas (la foto lo ve por ser `security definer`).
 *   C. `ms_max` es un récord: la llamada lenta de la primera foto, vacío cuando nada superó lo anterior, y el máximo nuevo cuando sí.
 *   D. Un reinicio de pg_stat_statements entre dos fotos: la siguiente cuenta desde el reinicio, entera, nunca resta. Lo mismo con
 *      una consulta que pg_stat_statements tiró y volvió a crear (menos llamadas que antes, o `stats_since` distinto).
 *   E. Dos fotos a la vez: la segunda vuelve sin hacer nada (`ya_corriendo`).
 *   F. El antes y el después: medias ponderadas por llamadas, la foto que cruza el pegado no entra en ningún lado, el orden es por
 *      costo, y la ventana va de 1 hora a 90 días.
 *   G. Solo nombres y números: las únicas columnas de texto son nombres, tipos, roles y la llave de la consulta; un texto con
 *      espacios no entra como nombre, y `postgres` no entra como rol. Volver a pegar la migración es inocuo.
 *   H. Como la llama el cron: por PostgREST, cuyas sesiones cargan `safeupdate` (rechaza un DELETE o UPDATE sin WHERE). Dos fotos
 *      seguidas con la llave de servicio, y el control: la versión de 20261113194000 falla ahí con «DELETE requires a WHERE clause»,
 *      como falló cada hora en producción el 2026-11-13.
 *
 * CÓMO. Cada caso en su transacción con ROLLBACK, con la migración pegada antes (en local la prueba aunque no esté aplicada; en el CI,
 * donde ya está, prueba además que se puede volver a pegar). Las llamadas medidas son a funciones y tablas `zz_vigia_*_<sufijo>` que nacen
 * dentro de la transacción: nadie más las puede llamar, así que los conteos son exactos aunque la base local la usen otras sesiones.
 * pg_stat_statements no es transaccional: lo que cuenta queda contado aunque la transacción se deshaga (y nunca se reinicia).
 *
 * USO
 *   pnpm pruebas:vigia-rendimiento
 *   RETAIL_CONTENEDOR_PG=<otra pila> pnpm pruebas:vigia-rendimiento   (si la base compartida va atrás de main)
 */

import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
// Las dos, en su orden: la segunda deja la función sin DELETE a secas (safeupdate, caso H).
const MIGRACION_ORIGINAL = readFileSync(join(RAIZ, "supabase", "migrations", "20261113194000_vigia_de_rendimiento.sql"), "utf8");
const MIGRACION = [MIGRACION_ORIGINAL, readFileSync(join(RAIZ, "supabase", "migrations", "20261113233000_vigia_rendimiento_sin_delete_a_secas.sql"), "utf8")].join("\n");
const CONTENEDOR_LOCAL = process.env.RETAIL_CONTENEDOR_PG ?? "supabase_db_cayla-retail";
const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // colaboradora — Tienda Trujillo (seed)

const argsPsql = ["exec", "-i", CONTENEDOR_LOCAL, "psql", "-q", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];

function psql(sql) {
  return execFileSync("docker", argsPsql, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}

// `pg_temp.intento(sql)` devuelve «ok» o el mensaje del error sin abortar la transacción. `pg_temp.cuantas_ve(patrón)`: cuántas
// consultas de pg_stat_statements con ese texto ve quien llama, o «sin permiso».
const PRELUDIO = `
create function pg_temp.intento(p_sql text) returns text language plpgsql as $f$
declare v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end $f$;
grant execute on function pg_temp.intento(text) to authenticated, anon, service_role;
create function pg_temp.cuantas_ve(p_patron text) returns text language plpgsql as $f$
declare v_n bigint;
begin
  execute 'select count(*) from extensions.pg_stat_statements where query like $1' into v_n using p_patron;
  return v_n::text;
exception when others then
  return 'sin permiso';
end $f$;
grant execute on function pg_temp.cuantas_ve(text) to service_role;
`;

// Lo que se mide: nace dentro de la transacción, así que nadie más lo llama. Lleva un sufijo nuevo en cada caso: tras un reinicio, la
// foto suma TODO lo que pg_stat_statements guarda con ese nombre desde el reinicio, también lo de una corrida anterior de esta prueba.
const sufijo = () => `_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PREPARAR = (s) => `
create function retail.zz_vigia_prueba${s}() returns void language sql as $f$ select $f$;
create function retail.zz_vigia_lenta${s}(p_ms int) returns void language plpgsql as $f$ begin perform pg_sleep(p_ms / 1000.0); end $f$;
create table retail.zz_vigia_tabla${s} (id int);
grant execute on function retail.zz_vigia_prueba${s}() to authenticated;
grant execute on function retail.zz_vigia_lenta${s}(int) to authenticated;
grant select on table retail.zz_vigia_tabla${s} to authenticated;
`;

/** Corre `sql` en una transacción que siempre se deshace, con la migración pegada antes. */
function correr(sql) {
  try {
    const salida = psql(`begin;\n${PRELUDIO}\n${MIGRACION}\nreset search_path;\n${sql}\nrollback;\n`);
    return { ok: true, lineas: salida.trim().split("\n").filter((x) => x !== "") };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}

const comoCuenta = (id) =>
  `set local role authenticated;\nset local request.jwt.claim.sub = '${id}';\nset local request.jwt.claim.role = 'authenticated';\n`;
const comoServicio = "set local role service_role;\nset local request.jwt.claim.sub = '';\nset local request.jwt.claim.role = 'service_role';\n";
const comoNadie = "reset role;\nreset request.jwt.claim.sub;\nreset request.jwt.claim.role;\n";
// Toma la foto como el trabajo programado, sin imprimir nada: así cada línea de la salida es de un `select` del caso.
const FOTO = `${comoServicio}do $c$ begin perform retail.fn_foto_rendimiento(); end $c$;\n${comoNadie}`;
const veces = (n, sql) => sql.repeat(n);
const LLAMAR = (s, n) => `${comoCuenta(MICAELA)}${veces(n, `select retail.zz_vigia_prueba${s}();\n`)}${comoNadie}`;
// Lo que dejó la última foto para lo de la prueba (sin el sufijo): nombre|tipo|rol|llamadas, o «nada».
const ULTIMA = (s) => `select coalesce(string_agg(f.nombre || '|' || f.tipo || '|' || f.rol || '|' || f.llamadas, ',' order by f.nombre), 'nada')
  from retail.rendimiento_fotos f where f.corrida_id = (select max(id) from retail.rendimiento_corridas) and f.nombre like 'zz_vigia%${s}';\n`
  .replaceAll("f.nombre || '|'", `replace(f.nombre, '${s}', '') || '|'`);

let fallos = 0;
function esperar(nombre, ok, detalle) {
  console.log(`${ok ? "✓" : "✗"} ${nombre}`);
  if (!ok) {
    fallos++;
    console.log(`   ${JSON.stringify(detalle).slice(0, 1200)}`);
  }
}
const ultima = (r) => (r.ok ? r.lineas[r.lineas.length - 1] : undefined);
const ultimas = (r, n) => (r.ok ? r.lineas.slice(-n) : []);

// A. Quién puede.
{
  const foto = `select pg_temp.intento($q$select retail.fn_foto_rendimiento()$q$);\n`;
  const leer = `select pg_temp.intento($q$select count(*) from retail.fn_rendimiento_antes_despues(now())$q$);\n`;
  const tabla = `select pg_temp.intento($q$select count(*) from retail.rendimiento_fotos$q$);\n`;
  const r = correr(`${comoCuenta(MICAELA)}${foto}${leer}${tabla}
${comoCuenta(FELIPE)}${foto}${leer}
${comoNadie}set local role anon;\n${leer}
${comoServicio}${foto}${leer}
${comoNadie}${foto}${leer}`);
  const [mFoto, mLeer, mTabla, fFoto, fLeer, anon, sFoto, sLeer, pFoto, pLeer] = ultimas(r, 10);
  esperar("una colaboradora no toma la foto ni lee el vigía ni sus tablas",
    /trabajo programado|permission denied/.test(mFoto) && /lo ve el Admin/.test(mLeer) && /permission denied/.test(mTabla), r);
  esperar("…el Admin tampoco toma la foto (no es suya), pero sí lee el antes y el después", /trabajo programado|permission denied/.test(fFoto) && fLeer === "ok", r);
  esperar("…sin sesión (anon), ni siquiera se puede llamar", /permission denied/.test(anon), r);
  esperar("…la llave de servicio y el SQL Editor (postgres sin sesión) toman la foto y leen", [sFoto, sLeer, pFoto, pLeer].every((x) => x === "ok"), r);
}

// B. Las restas son exactas, y qué cuenta.
{
  const s = sufijo();
  const r = correr(`${PREPARAR(s)}${FOTO}
${comoCuenta(MICAELA)}
select retail.zz_vigia_prueba${s}();
select retail.zz_vigia_prueba${s}();
select retail.zz_vigia_prueba${s}();
select count(*) from retail.zz_vigia_tabla${s};
do $d$ begin perform retail.zz_vigia_prueba${s}(); end $d$;
${comoNadie}
select retail.zz_vigia_prueba${s}();
select retail.zz_vigia_prueba${s}();
${FOTO}${ULTIMA(s)}
${LLAMAR(s, 2)}${FOTO}${ULTIMA(s)}
${FOTO}${ULTIMA(s)}
select string_agg(arranco_de_cero::text, ',' order by id) from retail.rendimiento_corridas;
${comoServicio}select pg_temp.cuantas_ve('%zz_vigia_prueba${s}%');
${comoNadie}select pg_temp.cuantas_ve('%zz_vigia_prueba${s}%');`);
  const [segunda, tercera, cuarta, deCero, servicioVe, postgresVe] = ultimas(r, 6);
  esperar("3 llamadas entre dos fotos son 3, y la tabla leída cuenta con su nombre y su tipo",
    segunda === "zz_vigia_prueba|funcion|authenticated|3,zz_vigia_tabla|tabla|authenticated|1", r);
  esperar("…lo que corre postgres (SQL Editor, migraciones) y lo que va dentro de un `do` no cuentan", !/postgres/.test(segunda ?? "postgres"), segunda);
  esperar("…las 2 siguientes son 2 (se resta contra la foto anterior)", tercera === "zz_vigia_prueba|funcion|authenticated|2", r);
  esperar("…y una hora sin llamadas no deja fila", cuarta === "nada", r);
  esperar("…solo la primera foto arranca de cero", deCero === "true,false,false,false", r);
  esperar("control: sin la función, la llave de servicio no ve el texto de esas consultas; postgres sí",
    ["0", "sin permiso"].includes(servicioVe) && Number(postgresVe) >= 1, { servicioVe, postgresVe });
}

// C. `ms_max` es un récord.
{
  const s = sufijo();
  const MAX = `select coalesce(f.ms_max::text, 'vacío') from retail.rendimiento_fotos f
  where f.corrida_id = (select max(id) from retail.rendimiento_corridas) and f.nombre = 'zz_vigia_lenta${s}';\n`;
  const lenta = (ms) => `${comoCuenta(MICAELA)}select retail.zz_vigia_lenta${s}(${ms});\n${comoNadie}`;
  const r = correr(`${PREPARAR(s)}${FOTO}${lenta(40)}${FOTO}${MAX}${lenta(1)}${FOTO}${MAX}${lenta(80)}${FOTO}${MAX}`);
  const [primera, sinRecord, record] = ultimas(r, 3);
  esperar("la primera foto de una consulta trae su llamada más lenta", Number(primera) >= 40 && Number(primera) < 2000, r);
  esperar("…si nada superó lo anterior, `ms_max` queda vacío (no se inventa el máximo de la hora)", sinRecord === "vacío", r);
  esperar("…y cuando una llamada lo supera, trae el máximo nuevo", Number(record) >= 80 && Number(record) < 2000, r);
}

// D. Reinicios: de pg_stat_statements entero, o de una sola consulta.
{
  const s = sufijo();
  const LLAMADAS = `select f.llamadas from retail.rendimiento_fotos f
  where f.corrida_id = (select max(id) from retail.rendimiento_corridas) and f.nombre = 'zz_vigia_prueba${s}';\n`;
  const r = correr(`${PREPARAR(s)}${FOTO}${LLAMAR(s, 2)}${FOTO}
-- Como si alguien hubiera reiniciado pg_stat_statements después de la última foto.
update retail.rendimiento_corridas set reinicio = '2000-01-01' where id = (select max(id) from retail.rendimiento_corridas);
${LLAMAR(s, 1)}${FOTO}
select c.arranco_de_cero || '|' || (c.desde = c.reinicio) || '|' || f.llamadas
  from retail.rendimiento_corridas c join retail.rendimiento_fotos f on f.corrida_id = c.id and f.nombre = 'zz_vigia_prueba${s}'
 where c.id = (select max(id) from retail.rendimiento_corridas);
-- Como si pg_stat_statements la hubiera tirado y vuelto a crear: la memoria dice más llamadas de las que hay.
update retail.rendimiento_estado set llamadas = 999 where nombre = 'zz_vigia_prueba${s}';
${LLAMAR(s, 1)}${FOTO}${LLAMADAS}
-- O empezó a contar en otro momento (stats_since, Postgres 17).
update retail.rendimiento_estado set cuenta_desde = '2000-01-01' where nombre = 'zz_vigia_prueba${s}';
${LLAMAR(s, 1)}${FOTO}${LLAMADAS}`);
  const [reinicio, menos, otroInicio] = ultimas(r, 3);
  esperar("tras un reinicio entre dos fotos, la siguiente arranca de cero desde el reinicio y cuenta entero (2 + 1 = 3)", reinicio === "true|true|3", r);
  esperar("…una consulta con menos llamadas que en la memoria se cuenta entera (4), no resta", menos === "4", r);
  esperar("…y una que empezó a contar en otro momento, también (5)", otroInicio === "5", r);
}

// E. Dos fotos a la vez: una conexión toma el candado (y se deshace), la otra corre mientras tanto.
{
  const tenedor = spawn("docker", argsPsql, { stdio: ["pipe", "pipe", "pipe"] });
  tenedor.stdin.end(`begin;\nselect pg_advisory_xact_lock(hashtext('retail.fn_foto_rendimiento'));\nselect pg_sleep(4);\nrollback;\n`);
  await new Promise((listo) => setTimeout(listo, 1500));
  const r = correr(`select retail.fn_foto_rendimiento() ->> 'motivo';`);
  await new Promise((listo) => tenedor.on("close", listo));
  esperar("si otra foto ya está en curso, la segunda vuelve sin hacer nada", ultima(r) === "ya_corriendo", r);
}

// F. El antes y el después, con fotos armadas a mano (año 2000: no se cruzan con ninguna de verdad).
{
  const r = correr(`
create temp table fotos_prueba (nombre text, desde timestamptz, hasta timestamptz, llamadas bigint, ms numeric, ms_max numeric, bloques bigint);
insert into fotos_prueba values
  ('zz_f', '2000-01-01 09:00+00', '2000-01-01 10:00+00', 10, 1000, null, 5000),
  ('zz_f', '2000-01-01 10:00+00', '2000-01-01 11:00+00', 30, 3600, 400, 15000),
  ('zz_f', '2000-01-01 11:30+00', '2000-01-01 12:30+00', 100, 100000, 3000, 999999),
  ('zz_f', '2000-01-01 13:00+00', '2000-01-01 14:00+00', 20, 400, 30, 1000),
  ('zz_f', '2000-01-01 14:00+00', '2000-01-01 15:00+00', 20, 400, null, 1000),
  ('zz_g', '2000-01-01 10:00+00', '2000-01-01 11:00+00', 1, 99999, 99999, 10),
  ('zz_h', '2000-01-20 10:00+00', '2000-01-20 11:00+00', 5, 50, 10, 10);
with c as (
  insert into retail.rendimiento_corridas (hecha_en, desde, arranco_de_cero, consultas)
  select distinct hasta, desde, false, 1 from fotos_prueba returning id, desde, hecha_en)
insert into retail.rendimiento_fotos (corrida_id, desde, hasta, nombre, tipo, rol, llamadas, ms_total, ms_media, ms_max, filas,
                                      bloques_compartidos, bloques_disco)
select c.id, f.desde, f.hasta, f.nombre, 'funcion', 'authenticated', f.llamadas, f.ms, f.ms / f.llamadas, f.ms_max, 0, f.bloques, 0
from fotos_prueba f join c on c.hecha_en = f.hasta and c.desde = f.desde;
select concat_ws('|', antes_llamadas, antes_ms_media, antes_bloques_por_llamada, despues_llamadas, despues_ms_media,
                 despues_bloques_por_llamada, cambio_ms_pct, despues_ms_max)
  from retail.fn_rendimiento_antes_despues('2000-01-01 12:00+00', 'zz_f');
select string_agg(nombre, ',' order by n) from retail.fn_rendimiento_antes_despues('2000-01-01 12:00+00') with ordinality as t(nombre, tipo, a, b, c, d, e, f, g, h, n);
select pg_temp.intento($q$select * from retail.fn_rendimiento_antes_despues('2000-01-01', null, interval '10 minutes')$q$);
select pg_temp.intento($q$select * from retail.fn_rendimiento_antes_despues('2000-01-01', null, interval '91 days')$q$);
select pg_temp.intento($q$select * from retail.fn_rendimiento_antes_despues(null)$q$);`);
  const [f, orden, corta, larga, sinDesde] = ultimas(r, 5);
  esperar("medias ponderadas por llamadas (115 → 20 ms, 500 → 50 bloques, −83 %); la foto que cruza el pegado no entra",
    f === "40|115.0|500.0|40|20.0|50.0|-83|30.0", r);
  esperar("…todas juntas, de la que más le costó a la base hacia abajo, y lo de fuera de la ventana no sale", orden === "zz_g,zz_f", r);
  esperar("…la ventana va de 1 hora a 90 días, y sin el momento del pegado no hay comparación",
    /1 hora a 90 días/.test(corta) && /1 hora a 90 días/.test(larga) && /p_desde/.test(sinDesde), r);
}

// G. Solo nombres y números, y volver a pegar.
{
  const r = correr(`${MIGRACION}
reset search_path;
select string_agg(table_name || '.' || column_name, ',' order by table_name, column_name)
  from information_schema.columns
 where table_schema = 'retail' and table_name like 'rendimiento\\_%' and data_type = 'text';
select pg_temp.intento($q$insert into retail.rendimiento_corridas (hecha_en, desde, arranco_de_cero, consultas) values (now(), now(), true, 0)$q$);
with c as (insert into retail.rendimiento_corridas (hecha_en, desde, arranco_de_cero, consultas) values (now(), now(), true, 0) returning id)
select pg_temp.intento(format($q$insert into retail.rendimiento_fotos (corrida_id, desde, hasta, nombre, tipo, rol, llamadas, ms_total,
  ms_media, filas, bloques_compartidos, bloques_disco) values (%s, now(), now(), 'select * from ventas', 'funcion', 'authenticated', 1, 1, 1, 0, 0, 0)$q$, c.id))
  || '|' ||
  pg_temp.intento(format($q$insert into retail.rendimiento_fotos (corrida_id, desde, hasta, nombre, tipo, rol, llamadas, ms_total,
  ms_media, filas, bloques_compartidos, bloques_disco) values (%s, now(), now(), 'fn_x', 'funcion', 'postgres', 1, 1, 1, 0, 0, 0)$q$, c.id))
  from c;`);
  const [columnas, corrida, rechazos] = ultimas(r, 3);
  esperar("las únicas columnas de texto son la llave de la consulta, nombres, tipos y roles: ni el texto ni los parámetros",
    columnas === "rendimiento_estado.entrada,rendimiento_estado.nombre,rendimiento_estado.rol,rendimiento_estado.tipo,"
      + "rendimiento_fotos.nombre,rendimiento_fotos.rol,rendimiento_fotos.tipo", r);
  esperar("…un texto con espacios no entra como nombre, y `postgres` no entra como rol", /check/.test(rechazos?.split("|")[0] ?? "") && /check/.test(rechazos?.split("|")[1] ?? ""), rechazos);
  esperar("volver a pegar la migración es inocuo", r.ok && corrida === "ok", r);
}

// H. Como la llama el cron: por PostgREST, que carga `safeupdate`. `postgres` no puede cargar la librería; `supabase_admin` sí.
{
  const comoElCron = (migracion) => {
    const sql = `begin;\nload 'safeupdate';\n${migracion}\nreset search_path;\nreset lock_timeout;\n${comoServicio}
select 'foto|' || (retail.fn_foto_rendimiento() ->> 'ok');
select 'foto|' || (retail.fn_foto_rendimiento() ->> 'ok');
rollback;\n`;
    try {
      const salida = execFileSync("docker", argsPsql.map((a, i) => (i === argsPsql.indexOf("-U") + 1 ? "supabase_admin" : a)), {
        input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"],
      });
      return salida.trim().split("\n").filter((x) => x.startsWith("foto|"));
    } catch (e) {
      return [`error|${e.stderr ?? e.message}`];
    }
  };
  const ahora = comoElCron(MIGRACION);
  esperar("con safeupdate cargado (como el cron por PostgREST), dos fotos seguidas salen bien", ahora.join(",") === "foto|true,foto|true", ahora);
  const antes = comoElCron(MIGRACION_ORIGINAL);
  esperar("control: la versión de 20261113194000 falla ahí con «DELETE requires a WHERE clause»", /DELETE requires a WHERE clause/.test(antes.join(",")), antes);
}

console.log(fallos ? `\n${fallos} caso(s) fallaron` : "\nTodo en verde");
process.exit(fallos ? 1 : 0);
