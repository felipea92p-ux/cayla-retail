#!/usr/bin/env node
/**
 * Pruebas de las versiones del Plan de campaña y del precio de la plata (ADR-0523) — migración `20261026184000_plan_compra_versiones_y_precio_de_la_plata.sql`:
 * la columna `planes_compra.precio_de_la_plata`, la tabla `planes_compra_versiones` y las cinco funciones (`fn_plan_compra_versiones`, `fn_plan_compra_version`,
 * `guardar_plan_compra_version`, `usar_plan_compra_con_tope`, `restaurar_plan_compra_version`).
 *
 * LO QUE VIGILA. Que cada cambio grande del plan (guardar una versión, usar el plan con tope, volver a una versión) deje su versión EN LA MISMA transacción o no cambie
 * nada; que «volver» NO borre nada (crea una versión nueva, deja las de después y no toca las categorías que se armaron después); que la versión automática de antes
 * de un cambio guarde lo que ninguna versión recordaba; que dos personas a la vez queden en fila sin repetir ni saltar números; que la fila no se pueda editar ni
 * borrar ni escribiendo la tabla; que cada puerta responda a la sesión de la tienda (el rol `authenticated`, no el dueño: ADR-0496 rompió a toda la tienda 16 h por
 * probar solo como dueño) y se cierre sin el módulo y a `anon`; y que la migración se pueda pegar dos veces y se niegue si falta el historial de ADR-0520.
 *
 * USO
 *   pnpm pruebas:plan-compra-versiones              → contra la base `postgres` del stack local (cada caso en su transacción con ROLLBACK; la concurrencia, con filas
 *                                                     reales que borra al terminar: solo toca lo que ella creó, «ZZ Plan versiones concurrencia»)
 *   pnpm pruebas:plan-compra-versiones --base otra  → contra otra base del mismo contenedor
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
const MIGRACION = sinControl(readFileSync(join(RAIZ, "supabase", "migrations", "20261026184000_plan_compra_versiones_y_precio_de_la_plata.sql"), "utf8"));

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

// La migración se carga dentro de cada caso: corre igual con la base al día o sin ella.
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
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Plan versiones', date '2026-12-01', date '2026-12-31') returning id as plan \\gset
insert into retail.categorias (nombre, familia) values ('PC Polos versiones', 'indumentaria') returning id as cat1 \\gset
insert into retail.categorias (nombre, familia) values ('PC Faldas versiones', 'indumentaria') returning id as cat2 \\gset
insert into retail.categorias (nombre, familia) values ('PC Casacas versiones', 'indumentaria') returning id as cat3 \\gset
select set_config('pc.plan', :'plan', true) as _1, set_config('pc.cat1', :'cat1', true) as _2, set_config('pc.cat2', :'cat2', true) as _3, set_config('pc.cat3', :'cat3', true) as _4 \\gset
-- Guarda (o cambia) el normal de una categoría con la ruta de siempre (security definer, la sesión de Felipe).
create function pg_temp.linea(p_cat integer, p_normal integer default 120) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_linea(p_plan_id => %L, p_categoria_id => %L, p_flojo => 80, p_normal => %s, p_bueno => 180, p_precio => 79.90, p_costo => 32, p_recupero_pct => 50)',
    current_setting('pc.plan'), current_setting('pc.cat' || p_cat), p_normal));
end $$;
create function pg_temp.guarda_v(p_nota text default null) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.guardar_plan_compra_version(%L, %L, 100, 5000.5)', current_setting('pc.plan'), p_nota));
end $$;
create function pg_temp.usa(p_precio text default '0.1', p_tope text default '20000', p_nota text default null) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.usar_plan_compra_con_tope(%L, %s, %s, %L, 90, 4000, 100, 5000)', current_setting('pc.plan'), p_precio, p_tope, p_nota));
end $$;
create function pg_temp.restaura(p_numero integer, p_nota text default null) returns text language plpgsql as $$
begin
  return pg_temp.intento(format('select retail.restaurar_plan_compra_version(%L, %s, %L, 90, 4000, 100, 5000)', current_setting('pc.plan'), p_numero, p_nota));
end $$;
create function pg_temp.ok(p text) returns text language plpgsql as $$
begin
  if p <> 'SIN_ERROR' then raise exception 'la preparación del caso falló: %', p; end if;
  return p;
end $$;
${como(FELIPE)}
`;
const PLAN = `current_setting('pc.plan')::uuid`;
const VERS = `(select count(*) from retail.planes_compra_versiones where plan_id = ${PLAN})`;
const LISTA = `(select string_agg(v.numero || ':' || v.origen || ':' || coalesce(v.restaurada_de::text, '-'), ',' order by v.numero) from retail.planes_compra_versiones v where v.plan_id = ${PLAN})`;
const LINEA = (n, campo) => `(select l.${campo} from retail.planes_compra_lineas l where l.plan_id = ${PLAN} and l.categoria_id = current_setting('pc.cat${n}')::uuid)`;
const HOY = `(select p.precio_de_la_plata || '/' || coalesce(p.tope_inversion::text, '-') from retail.planes_compra p where p.id = ${PLAN})`;
// Una fila escrita directo (como el dueño), para probar lo que la tabla no deja.
const FILA_DIRECTA = (numero, extra = "") =>
  `insert into retail.planes_compra_versiones (plan_id, numero, origen, precio_de_la_plata, lineas, huella, creada_por ${extra ? ", " + extra.columnas : ""})
     values (${PLAN}, ${numero}, ${extra ? extra.origen : "'manual'"}, ${extra && extra.precio !== undefined ? extra.precio : "0"}, ${extra && extra.lineas ? extra.lineas : "'[]'::jsonb"}, 'h', (select id from public.personas limit 1) ${extra ? ", " + extra.valores : ""})`;

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

console.log("— Guardar una versión —");
caso(
  "G1 un plan sin categorías no tiene qué guardar como versión (se rechaza y no escribe nada)",
  `select ${codigo("pg_temp.guarda_v('x')")} || ',' || ${VERS};`,
  "P0001,0",
);
caso(
  "G2 la primera versión: número 1, a mano, con su nota y lo que la pantalla mostró; su huella es la del plan de hoy",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.guarda_v('Primer plan') as r \\gset
   select :'r' || ',' || (select v.numero || ':' || v.origen || ':' || v.nota || ':' || v.prendas || ':' || v.inversion || ':' || jsonb_array_length(v.lineas) from retail.planes_compra_versiones v where v.plan_id = ${PLAN}) || ',' ||
          ((retail.fn_plan_compra_versiones(${PLAN}))->>'huella_actual' = (select v.huella from retail.planes_compra_versiones v where v.plan_id = ${PLAN}));`,
  "SIN_ERROR,1:manual:Primer plan:100:5000.50:1,true",
);
caso(
  "G3 otra versión sin que nada cambiara se rechaza (el doble clic no deja dos)",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.guarda_v('A') as r1 \\gset
   select ${codigo("pg_temp.guarda_v('A otra vez')")} || ',' || ${VERS};`,
  "P0001,1",
);
caso(
  "G4 tras cambiar una categoría sí se puede guardar otra versión: el 2, y la huella de hoy cambió",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.guarda_v('A') as r1 \\gset
   select pg_temp.ok(pg_temp.linea(1, 150)) as _2 \\gset
   select pg_temp.guarda_v('B') as r2 \\gset
   select ${LISTA} || ',' || (select count(distinct huella) from retail.planes_compra_versiones where plan_id = ${PLAN});`,
  "1:manual:-,2:manual:-,2",
);
caso(
  "G5 la numeración no salta ni repite: tres versiones, 1·2·3",
  `select pg_temp.ok(pg_temp.linea(1, 110)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('a')) as _a \\gset
   select pg_temp.ok(pg_temp.linea(1, 120)) as _2 \\gset
   select pg_temp.ok(pg_temp.guarda_v('b')) as _b \\gset
   select pg_temp.ok(pg_temp.linea(2, 130)) as _3 \\gset
   select pg_temp.ok(pg_temp.guarda_v('c')) as _c \\gset
   select ${LISTA};`,
  "1:manual:-,2:manual:-,3:manual:-",
);
caso(
  "G6 una nota de 121 letras, o cifras negativas, se rechazan y no escriben",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select ${codigo("pg_temp.guarda_v(repeat('x', 121))")} || ',' || ${codigo(`pg_temp.intento(format('select retail.guardar_plan_compra_version(%L, null, -1, 5)', current_setting('pc.plan')))`)} || ',' || ${VERS};`,
  "P0001,P0001,0",
);
caso(
  "G7 una nota de 120 letras justas cabe",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.guarda_v(repeat('x', 120)) as r \\gset
   select :'r' || ',' || ${VERS};`,
  "SIN_ERROR,1",
);

console.log("\n— Usar el plan con tope —");
caso(
  "U1 sin versiones: guarda la de antes (automática, con λ 0 y sin tope) y la nueva (con tope); el plan queda con el precio de la plata y el tope, y el rastro del tope",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.usa('0.1', '20000', 'Plan con tope de 20 mil') as r \\gset
   select :'r' || ',' || ${LISTA} || ',' || ${HOY} || ',' ||
          (select v.precio_de_la_plata || '/' || coalesce(v.tope::text, '-') from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 1) || ',' ||
          (select v.precio_de_la_plata || '/' || v.tope || '/' || v.nota from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 2) || ',' ||
          (select p.tope_actualizado_por is not null from retail.planes_compra p where p.id = ${PLAN});`,
  "SIN_ERROR,1:automatica:-,2:plan_con_tope:-,0.100/20000.00,0.000/-,0.100/20000.00/Plan con tope de 20 mil,true",
);
caso(
  "U2 la versión automática dice qué es y trae lo que la pantalla mostraba antes",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.usa()) as _2 \\gset
   select (select v.nota || ':' || v.prendas || ':' || v.inversion from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 1);`,
  "Antes de usar el plan con tope:100:5000.00",
);
caso(
  "U3 si el plan ya estaba versionado, NO se guarda otra automática: solo la nueva",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Punto')) as _2 \\gset
   select pg_temp.usa() as r \\gset
   select :'r' || ',' || ${LISTA};`,
  "SIN_ERROR,1:manual:-,2:plan_con_tope:-",
);
caso(
  "U4 usarlo con el mismo precio y el mismo tope no cambia nada: se rechaza y no escribe",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.usa('0.1', '20000')) as _2 \\gset
   select ${codigo("pg_temp.usa('0.1', '20000')")} || ',' || ${VERS};`,
  "P0001,2",
);
caso(
  "U5 el precio de la plata fuera de −1 a 50 y un tope que no es mayor que cero se rechazan",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select ${codigo("pg_temp.usa('51', '20000')")} || ',' || ${codigo("pg_temp.usa('-1.5', '20000')")} || ',' || ${codigo("pg_temp.usa('0.1', '0')")} || ',' || ${codigo("pg_temp.usa('0.1', '-5')")} || ',' || ${VERS} || ',' || ${HOY};`,
  "P0001,P0001,P0001,P0001,0,0.000/-",
);
caso(
  "U6 los extremos valen: −1 y 50",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.usa('-1', '20000') as a \\gset
   select pg_temp.usa('50', '21000') as b \\gset
   select :'a' || ',' || :'b' || ',' || ${HOY};`,
  "SIN_ERROR,SIN_ERROR,50.000/21000.00",
);
caso(
  "U7 un plan sin categorías no tiene plan que ajustar al tope",
  `select ${codigo("pg_temp.usa()")} || ',' || ${VERS} || ',' || ${HOY};`,
  "P0001,0,0.000/-",
);
caso(
  "U8 la foto de la versión trae las categorías con sus supuestos",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.linea(2, 90)) as _2 \\gset
   select pg_temp.ok(pg_temp.usa()) as _3 \\gset
   select (select jsonb_array_length(v.lineas) || ':' || (select string_agg((e->>'normal'), ',' order by e->>'categoria_id') from jsonb_array_elements(v.lineas) e) from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 2) ~ '^2:(120,90|90,120)$';`,
  "t",
);

console.log("\n— Volver a una versión —");
caso(
  "R1 vuelve a como estaba: las categorías, el precio de la plata y el tope; y deja una versión NUEVA que dice de cuál vuelve (las demás siguen)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.linea(2, 90)) as _2 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _3 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _4 \\gset
   select pg_temp.ok(pg_temp.linea(2, 95)) as _5 \\gset
   select pg_temp.ok(pg_temp.usa('0.2', '15000')) as _6 \\gset
   select pg_temp.restaura(1) as r \\gset
   select :'r' || ',' || ${LINEA(1, "normal")} || ',' || ${LINEA(2, "normal")} || ',' || ${HOY} || ',' || ${LISTA};`,
  "SIN_ERROR,120,90,0.000/-,1:manual:-,2:automatica:-,3:plan_con_tope:-,4:restauracion:1",
);
caso(
  "R2 volver NO borra: las versiones de después siguen en la lista, intactas",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _3 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Cambio')) as _4 \\gset
   select (select v.huella from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 2) as h2 \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _5 \\gset
   select ${VERS} || ',' || (select v.huella = :'h2' from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 2);`,
  "3,true",
);
caso(
  "R3 la versión de volver trae el texto de la web, o «Volví a la versión N» si no se escribió nada; y la foto es la del plan ya vuelto",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _3 \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _4 \\gset
   select (select v.nota from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 3) || ',' ||
          ((select v.huella from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 3) = (retail.fn_plan_compra_versiones(${PLAN}))->>'huella_actual');`,
  "Volví a la versión 1,true",
);
caso(
  "R4 las categorías que se armaron DESPUÉS de esa versión no se tocan (no estaban en su foto)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _3 \\gset
   select pg_temp.ok(pg_temp.linea(3, 90)) as _4 \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _5 \\gset
   select ${LINEA(1, "normal")} || ',' || ${LINEA(3, "normal")};`,
  "120,90",
);
caso(
  "R5 el plan que ya está como esa versión no tiene a qué volver (se rechaza y no escribe)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select ${codigo("pg_temp.restaura(1)")} || ',' || ${VERS};`,
  "P0001,1",
);
caso(
  "R6 si lo único distinto son categorías que se armaron después, tampoco hay a qué volver: se rechaza y deshace TODO (ni la automática queda)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(3, 90)) as _3 \\gset
   select ${codigo("pg_temp.restaura(1)")} || ',' || ${VERS} || ',' || ${LINEA(3, "normal")};`,
  "P0001,1,90",
);
caso(
  "R7 una versión que no existe se rechaza",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select ${codigo("pg_temp.restaura(9)")} || ',' || ${VERS};`,
  "P0001,0",
);
caso(
  "R8 solo se reescribe lo que cambió: una categoría igual no sube su versión ni suma al historial",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.linea(2, 90)) as _2 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _3 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _4 \\gset
   select (select l.version from retail.planes_compra_lineas l where l.plan_id = ${PLAN} and l.categoria_id = current_setting('pc.cat2')::uuid) as v2antes \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _5 \\gset
   select (select l.version from retail.planes_compra_lineas l where l.plan_id = ${PLAN} and l.categoria_id = current_setting('pc.cat2')::uuid) = :v2antes::integer;`,
  "t",
);
caso(
  "R9 lo que se reescribe deja su fila en el historial de la categoría (con su versión nueva)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _3 \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _4 \\gset
   select (select string_agg(h.version || ':' || h.normal, ',' order by h.version) from retail.planes_compra_lineas_historial h where h.plan_id = ${PLAN} and h.categoria_id = current_setting('pc.cat1')::uuid);`,
  "1:120,2:170,3:120",
);
caso(
  "R10 se puede volver a una versión que fue una vuelta (la restaurada_de siempre es anterior)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _3 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Cambio')) as _4 \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _5 \\gset
   select pg_temp.restaura(2) as r \\gset
   select :'r' || ',' || ${LINEA(1, "normal")} || ',' || ${LISTA};`,
  "SIN_ERROR,170,1:manual:-,2:manual:-,3:restauracion:1,4:restauracion:2",
);
caso(
  "R11 volver a una versión sin tope deja el plan sin tope (y con el precio de la plata de esa versión)",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Sin tope')) as _2 \\gset
   select pg_temp.ok(pg_temp.usa('0.3', '12000')) as _3 \\gset
   select pg_temp.ok(pg_temp.restaura(1)) as _4 \\gset
   select ${HOY};`,
  "0.000/-",
);

console.log("\n— Todo o nada —");
caso(
  "A1 si la versión no se puede escribir, «usar» no deja a medias: ni el precio de la plata ni el tope cambian",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   alter table retail.planes_compra_versiones add constraint zz_no_escribir check (false) not valid;
   select ${codigo("pg_temp.usa()")} || ',' || ${VERS} || ',' || ${HOY};`,
  "23514,0,0.000/-",
);
caso(
  "A2 si la versión no se puede escribir, «volver» no deja las categorías a medias",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Base')) as _2 \\gset
   select pg_temp.ok(pg_temp.linea(1, 170)) as _3 \\gset
   alter table retail.planes_compra_versiones add constraint zz_no_escribir check (false) not valid;
   select ${codigo("pg_temp.restaura(1)")} || ',' || ${LINEA(1, "normal")};`,
  "23514,170",
);

console.log("\n— Lo que la tabla no deja —");
caso(
  "T1 ni el dueño edita ni borra una versión (42501)",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('x')) as _2 \\gset
   select ${codigo("pg_temp.intento('update retail.planes_compra_versiones set nota = ''otra''')")} || ',' || ${codigo("pg_temp.intento('delete from retail.planes_compra_versiones')")} || ',' || ${VERS};`,
  "42501,42501,1",
);
caso(
  "T2 escribiendo la tabla directo: el mismo número dos veces (23505), una restauración sin decir de cuál (23514), una que no es restauración y lo dice (23514), una que vuelve a una posterior (23514)",
  `select pg_temp.intento($x$${FILA_DIRECTA(1)}$x$) as ok \\gset
   select ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(1)}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(2, { columnas: "restaurada_de", origen: "'restauracion'", valores: "null" })}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(3, { columnas: "restaurada_de", origen: "'manual'", valores: "1" })}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(4, { columnas: "restaurada_de", origen: "'restauracion'", valores: "9" })}$x$)`)};`,
  "23505,23514,23514,23514",
);
caso(
  "T3 el precio de la plata fuera de −1…50, la foto que no es una lista, la nota de 121 letras y un origen desconocido se rechazan",
  `select ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(1, { columnas: "restaurada_de", origen: "'manual'", valores: "null", precio: "51" })}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(2, { columnas: "restaurada_de", origen: "'manual'", valores: "null", lineas: "'{}'::jsonb" })}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(3, { columnas: "nota", origen: "'manual'", valores: "repeat('x', 121)" })}$x$)`)} || ',' ||
          ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(4, { columnas: "restaurada_de", origen: "'inventado'", valores: "null" })}$x$)`)};`,
  "23514,23514,23514,23514",
);
caso(
  "T4 el precio de la plata del plan no pasa de 50 ni baja de −1 (escribiendo la tabla directo)",
  `select ${codigo(`pg_temp.intento(format('update retail.planes_compra set precio_de_la_plata = 51 where id = %L', current_setting('pc.plan')))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('update retail.planes_compra set precio_de_la_plata = -1.5 where id = %L', current_setting('pc.plan')))`)} || ',' || ${HOY};`,
  "23514,23514,0.000/-",
);
caso(
  "T5 el plan de siempre arranca con el precio de la plata en 0 (la columna nueva no cambia ningún plan existente)",
  `select (select count(*) from retail.planes_compra where precio_de_la_plata <> 0 and nombre = 'ZZ Plan versiones') || ',' || ${HOY};`,
  "0,0.000/-",
);

console.log("\n— Leer —");
caso(
  "L1 la lista va de la más nueva a la más vieja, SIN las fotos, con lo de hoy (precio de la plata y tope) y la marca soportado",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Una')) as _2 \\gset
   select pg_temp.ok(pg_temp.usa('0.1', '20000')) as _3 \\gset
   select (r->>'soportado') || ',' || (r->>'precio_de_la_plata') || ',' || (r->>'tope') || ',' ||
          (select string_agg(e->>'numero', ',' order by ord) from jsonb_array_elements(r->'versiones') with ordinality t(e, ord)) || ',' ||
          (select bool_or(e ? 'lineas') from jsonb_array_elements(r->'versiones') e)
     from (select retail.fn_plan_compra_versiones(${PLAN}) as r) q;`,
  "true,0.100,20000.00,2,1,false",
);
caso(
  "L2 la huella del plan de hoy sigue a la última versión mientras nada cambie y se separa de ella en cuanto alguien guarda una categoría",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Una')) as _2 \\gset
   select ((retail.fn_plan_compra_versiones(${PLAN}))->>'huella_actual') = (select v.huella from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 1) as antes \\gset
   select pg_temp.ok(pg_temp.linea(1, 121)) as _3 \\gset
   select :'antes' || ',' || (((retail.fn_plan_compra_versiones(${PLAN}))->>'huella_actual') = (select v.huella from retail.planes_compra_versiones v where v.plan_id = ${PLAN} and v.numero = 1));`,
  "t,false",
);
caso(
  "L3 una versión con su foto: trae las categorías; una que no existe y un plan que no existe dan null",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Una')) as _2 \\gset
   select jsonb_array_length((retail.fn_plan_compra_version(${PLAN}, 1))->'lineas') || ',' || (retail.fn_plan_compra_version(${PLAN}, 7) is null) || ',' ||
          (retail.fn_plan_compra_versiones('00000000-0000-0000-0000-000000000000') is null);`,
  "1,true,true",
);
caso(
  "L4 la lista dice quién y cuándo (el nombre de la persona, no su id)",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('Una')) as _2 \\gset
   select ((retail.fn_plan_compra_versiones(${PLAN}))->'versiones'->0->>'por') is not null and ((retail.fn_plan_compra_versiones(${PLAN}))->'versiones'->0->>'por') !~ '^[0-9a-f-]{36}$';`,
  "t",
);

console.log("\n— Puertas —");
caso(
  "P1 con el rol de la tienda (authenticated, no el dueño) las tres que escriben y las dos que leen funcionan",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _0 \\gset
   set local role authenticated;
   select pg_temp.guarda_v('Una') as a \\gset
   select pg_temp.ok(pg_temp.linea(1, 130)) as _1 \\gset
   select pg_temp.usa('0.1', '20000') as b \\gset
   select pg_temp.restaura(1) as c \\gset
   select (retail.fn_plan_compra_versiones(${PLAN}) is not null)::text as d \\gset
   select (retail.fn_plan_compra_version(${PLAN}, 1) is not null)::text as e \\gset
   reset role;
   select :'a' || ',' || :'b' || ',' || :'c' || ',' || :'d' || ',' || :'e';`,
  "SIN_ERROR,SIN_ERROR,SIN_ERROR,true,true",
);
caso(
  "P2 sin el módulo (Micaela) las cinco dan 42501 y no escriben nada",
  `select pg_temp.ok(pg_temp.linea(1, 120)) as _0 \\gset
   ${como(MICAELA)}
   select ${codigo("pg_temp.guarda_v('x')")} || ',' || ${codigo("pg_temp.usa()")} || ',' || ${codigo("pg_temp.restaura(1)")} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_versiones(%L)', current_setting('pc.plan')))`)} || ',' ||
          ${codigo(`pg_temp.intento(format('select retail.fn_plan_compra_version(%L, 1)', current_setting('pc.plan')))`)} || ',' || ${VERS};`,
  "42501,42501,42501,42501,42501,0",
);
caso(
  "P3 anon no ejecuta ninguna; la tienda ejecuta las cinco y ninguna interna",
  `select has_function_privilege('anon', 'retail.fn_plan_compra_versiones(uuid)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.fn_plan_compra_version(uuid,integer)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.guardar_plan_compra_version(uuid,text,integer,numeric)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.usar_plan_compra_con_tope(uuid,numeric,numeric,text,integer,numeric,integer,numeric)', 'execute') || ',' ||
          has_function_privilege('anon', 'retail.restaurar_plan_compra_version(uuid,integer,text,integer,numeric,integer,numeric)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_versiones(uuid)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_version(uuid,integer)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.guardar_plan_compra_version(uuid,text,integer,numeric)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.usar_plan_compra_con_tope(uuid,numeric,numeric,text,integer,numeric,integer,numeric)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.restaurar_plan_compra_version(uuid,integer,text,integer,numeric,integer,numeric)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_lineas_json(uuid)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_huella(jsonb,numeric,numeric)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_nueva_version(uuid,text,text,integer,integer,numeric,uuid)', 'execute') || ',' ||
          has_function_privilege('authenticated', 'retail.fn_plan_compra_proteger_lo_de_hoy(uuid,text,integer,numeric,uuid)', 'execute');`,
  "false,false,false,false,false,true,true,true,true,true,false,false,false,false",
);
caso(
  "P4 las cinco públicas son security definer con search_path fijo (las internas, no)",
  `select count(*) || ',' || bool_and(p.prosecdef) || ',' || bool_and(p.proconfig::text like '%search_path%')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'retail' and p.proname in ('fn_plan_compra_versiones', 'fn_plan_compra_version', 'guardar_plan_compra_version', 'usar_plan_compra_con_tope', 'restaurar_plan_compra_version');`,
  "5,true,true",
);
caso(
  "P5 con el rol de la tienda no se lee ni se escribe la tabla directo",
  `select pg_temp.ok(pg_temp.linea(1)) as _1 \\gset
   select pg_temp.ok(pg_temp.guarda_v('x')) as _2 \\gset
   set local role authenticated;
   select ${codigo("pg_temp.intento('select 1 from retail.planes_compra_versiones')")} || ',' || ${codigo(`pg_temp.intento($x$${FILA_DIRECTA(9)}$x$)`)};`,
  "42501,42501",
);

console.log("\n— La migración —");
caso(
  "M1 pegarla dos veces deja lo mismo: sin error, una sola de cada función, un solo disparador y una sola columna",
  `select pg_temp.intento($mig$${MIGRACION}$mig$) as r \\gset
   select :'r' || ',' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname in ('fn_plan_compra_versiones', 'fn_plan_compra_version', 'guardar_plan_compra_version', 'usar_plan_compra_con_tope', 'restaurar_plan_compra_version', 'fn_plan_compra_lineas_json', 'fn_plan_compra_huella', 'fn_plan_compra_nueva_version', 'fn_plan_compra_proteger_lo_de_hoy')) || ',' ||
          (select count(*) from pg_trigger where tgrelid = 'retail.planes_compra_versiones'::regclass and not tgisinternal) || ',' ||
          (select count(*) from information_schema.columns where table_schema = 'retail' and table_name = 'planes_compra' and column_name = 'precio_de_la_plata');`,
  "SIN_ERROR,9,1,1",
);
caso(
  "M2 sin el historial de ADR-0520 (la restauración lo necesita) no aplica nada y lo dice",
  `drop function retail.fn_plan_compra_linea_al_historial(uuid, jsonb);
   select pg_temp.intento($mig$${MIGRACION}$mig$);`,
  (o) => o.startsWith("P0001|retail.fn_plan_compra_linea_al_historial no existe"),
);

// ------------------------------------------------------------------------------------------------------------------------------------------------
// Dos personas a la vez: filas REALES (la transacción de cada caso no alcanza), dos sesiones de psql en paralelo. Lo que crea lo borra al terminar,
// sin tocar nada más (la tabla de versiones no deja borrar: el borrado va con `session_replication_role = replica`, solo para estas filas de prueba).
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
set session_replication_role = replica;
delete from retail.planes_compra_versiones where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Plan versiones concurrencia');
delete from retail.planes_compra_lineas_historial where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Plan versiones concurrencia');
delete from retail.planes_compra_lineas where plan_id in (select id from retail.planes_compra where nombre = 'ZZ Plan versiones concurrencia');
delete from retail.planes_compra where nombre = 'ZZ Plan versiones concurrencia';
delete from retail.categorias where nombre = 'PC Concurrencia versiones';
set session_replication_role = origin;
`;
  correr(`${LIMPIAR}`);
  const montaje = correr(`
set search_path = retail, public, extensions;
${MIGRACION}
insert into retail.planes_compra (nombre, desde, hasta) values ('ZZ Plan versiones concurrencia', date '2026-12-01', date '2026-12-31');
insert into retail.categorias (nombre, familia) values ('PC Concurrencia versiones', 'indumentaria');
begin;
${como(FELIPE)}
select retail.guardar_plan_compra_linea(p_plan_id => (select id from retail.planes_compra where nombre = 'ZZ Plan versiones concurrencia'),
  p_categoria_id => (select id from retail.categorias where nombre = 'PC Concurrencia versiones'), p_flojo => 80, p_normal => 120, p_bueno => 180, p_precio => 79.90, p_costo => 32, p_recupero_pct => 50);
commit;`);
  if (!montaje.ok) {
    fallas++;
    console.log(`✗ C1 montar la concurrencia\n    ${montaje.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? montaje.mensaje}`);
    return;
  }
  const PLAN_SQL = `(select id from retail.planes_compra where nombre = 'ZZ Plan versiones concurrencia')`;
  const sesion = (precio, tope) => `begin;\n${como(FELIPE)}\nselect retail.usar_plan_compra_con_tope(${PLAN_SQL}, ${precio}, ${tope}, 'Sesión ${precio}', 10, 100, 10, 100);\ncommit;`;
  // Cuatro llamadas distintas a la vez: todas cambian algo, así que todas deben entrar, en fila.
  const rs = await Promise.all([sesion("0.1", "20000"), sesion("0.2", "21000"), sesion("0.3", "22000"), sesion("0.4", "23000")].map(correrAsync));
  const lista = correr(`select string_agg(v.numero || ':' || v.origen, ',' order by v.numero) || ',' || (select count(*) from retail.planes_compra_versiones x where x.plan_id = ${PLAN_SQL}) || ',' ||
      (select count(distinct numero) from retail.planes_compra_versiones x where x.plan_id = ${PLAN_SQL}) || ',' ||
      (select p.precio_de_la_plata || '/' || p.tope_inversion from retail.planes_compra p where p.id = ${PLAN_SQL}) || ',' ||
      (select (retail.fn_plan_compra_lineas_json(${PLAN_SQL}) is not null) and (select v2.huella from retail.planes_compra_versiones v2 where v2.plan_id = ${PLAN_SQL} order by v2.numero desc limit 1) = retail.fn_plan_compra_huella(retail.fn_plan_compra_lineas_json(${PLAN_SQL}), (select precio_de_la_plata from retail.planes_compra where id = ${PLAN_SQL}), (select tope_inversion from retail.planes_compra where id = ${PLAN_SQL})))
    from retail.planes_compra_versiones v where v.plan_id = ${PLAN_SQL};`);
  correr(LIMPIAR);
  const todasEntraron = rs.every((r) => r.ok);
  // 4 sesiones: una automática (la primera, porque el plan tenía una categoría sin versión) + 4 «plan con tope» = 5 versiones, numeradas 1 a 5 sin repetir.
  const esperado = (o) => /^1:automatica,2:plan_con_tope,3:plan_con_tope,4:plan_con_tope,5:plan_con_tope,5,5,0\.\d00\/2\d000\.00,true$/.test(o);
  if (todasEntraron && lista.ok && esperado(lista.salida)) {
    console.log("✓ C1 cuatro «usar el plan con tope» a la vez entran en fila: 1 automática + 4 versiones, numeradas 1 a 5 sin repetir, y el plan queda como la última");
  } else {
    fallas++;
    console.log(`✗ C1 cuatro «usar el plan con tope» a la vez\n    esperado: 5 versiones 1..5 sin repetir, la última igual al plan de hoy\n    obtenido: ${lista.ok ? lista.salida : lista.mensaje}\n    sesiones: ${rs.map((r) => (r.ok ? "ok" : r.mensaje.split("\n").find((l) => l.includes("ERROR")))).join(" | ")}`);
  }
}
await concurrencia();

console.log(`\n${casos - fallas}/${casos} casos bien.`);
if (fallas > 0) process.exit(1);
