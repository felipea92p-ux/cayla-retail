#!/usr/bin/env node
/**
 * Pruebas de «agregar una talla o un color desde Nueva orden» — migración `20261031172000_produccion_agregar_variantes_al_modelo.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que `agregar_variantes_a_modelo` crea las variantes que faltan (una talla en cada color del modelo, o un color en cada talla) con el
 * precio y el costo de su hermana y sin stock, y que NO deja: duplicar lo que ya existe, reclamar una variante desactivada, usar una talla que la
 * categoría no habilita ni un color apagado, mezclar «Sin color» con color o «Única» con tallas, ni que lo use quien no opera el Taller o no edita el catálogo.
 *
 * Cada caso corre en su propia transacción con ROLLBACK, y la migración se carga dentro de cada caso (así se prueba que se puede pegar otra vez).
 *
 * QUÉ PRUEBA
 *   T  UNA TALLA NUEVA: crea una variante por color, con precio y costo de su hermana, activas y sin stock; la segunda vez avisa que ya está.
 *   C  UN COLOR NUEVO: crea una variante por talla; un color apagado o inventado no entra.
 *   R  LAS REGLAS: talla no habilitada, ni talla ni color o las dos, talla única, sin color, desactivada, modelo sin variantes o inexistente.
 *   P  LOS PERMISOS: sin el módulo Producción, sin sesión, y quien opera el Taller pero no edita el catálogo.
 *   V  LA VERSIÓN: el producto sube de versión (Editar producto avisa a quien lo tenga abierto) y el stock no se toca.
 *   S  LA FORMA: se vuelve a cargar encima sin error.
 *
 * LO QUE ESTA PRUEBA NO HACE: dos personas agregando la misma talla a la vez (el candado por modelo la serializa), ni la pantalla.
 *
 * USO
 *   node scripts/pruebas/produccion_agregar_variantes_al_modelo.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_agregar_variantes_al_modelo.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_agregar_variantes_al_modelo.mjs --base otra                 → contra otra base del mismo contenedor
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
const CONTENEDOR = arg("--contenedor", "supabase_db_cayla-retail");
const BASE = arg("--base", "postgres");
const sinCandadosDePegado = (sql) => sql.replace(/^set lock_timeout.*$/gm, "").replace(/^reset lock_timeout;$/gm, "");
const MIGRACION = sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", "20261031172000_produccion_agregar_variantes_al_modelo.sql"), "utf8"));

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed): no ve Producción
const SIN_CUENTA = "22222222-2222-4222-8222-0000000000ff"; // una sesión que no es de nadie

const ARGS_PSQL = ["exec", "-i", CONTENEDOR, "psql", "-q", "-U", "postgres", "-d", BASE, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-F", "|", "-f", "-"];
function psql(sql) {
  return execFileSync("docker", ARGS_PSQL, { input: sql, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
}
function correr(sql) {
  try {
    return { ok: true, salida: psql(sql).trim() };
  } catch (e) {
    return { ok: false, mensaje: `${e.stderr ?? ""}${e.message ?? ""}` };
  }
}
const como = (auth) => `set local request.jwt.claim.sub = '${auth}';\nset local request.jwt.claims = '{"sub":"${auth}","role":"authenticated"}';\n`;

const ENVOLTURAS = `
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
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create function pg_temp.agrega(p_taller uuid, p_prod uuid, p_talla uuid, p_color text) returns text language sql as $f$
  select pg_temp.eh(pg_temp.intento(format('select retail.agregar_variantes_a_modelo(%L, %L, %L, %L)', p_taller, p_prod, p_talla, p_color))) $f$;
`;

// Un modelo de prueba por caso: Blusa con dos colores (ACH 100/40 y ALB 120/50) y dos tallas (S, M) de su categoría. Todo dentro de la transacción.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${ENVOLTURAS}
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select categoria_id as cat from retail.categoria_tallas ct join retail.categorias c on c.id = ct.categoria_id
  where (select count(*) from retail.categoria_tallas x where x.categoria_id = ct.categoria_id) >= 4 limit 1 \\gset
select array_agg(talla_id order by talla_id) as tallas_cat from retail.categoria_tallas where categoria_id = :'cat' \\gset
select (:'tallas_cat'::text[])[1] as t_s, (:'tallas_cat'::text[])[2] as t_m, (:'tallas_cat'::text[])[3] as t_l \\gset
select id as t_fuera from retail.tallas t where not exists (select 1 from retail.categoria_tallas x where x.categoria_id = :'cat' and x.talla_id = t.id) limit 1 \\gset
select codigo as c_activo from retail.colores where activo and codigo not in ('ACH', 'ALB') order by codigo limit 1 \\gset
select codigo as c_apagado from retail.colores where not activo order by codigo limit 1 \\gset
${MIGRACION}
insert into retail.productos (referencia, categoria_id) values ('Blusa Prueba Agregar', :'cat') returning id as prod \\gset
insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values
  (:'prod', 'ACH', :'t_s', 100, 40), (:'prod', 'ACH', :'t_m', 100, 40), (:'prod', 'ALB', :'t_s', 120, 50), (:'prod', 'ALB', :'t_m', 120, 50);
select version as v0 from retail.productos where id = :'prod' \\gset
${como(FELIPE)}
`;

let casos = 0;
let fallas = 0;
function caso(nombre, sql, esperado) {
  casos++;
  const r = correr(`${PRELUDIO}\n${sql}\nrollback;\n`);
  const obtenido = r.ok ? r.salida.split("\n").filter(Boolean).pop() : `ERROR: ${r.mensaje.split("\n").find((l) => /ERROR|error/.test(l)) ?? r.mensaje.slice(0, 300)}`;
  if (obtenido === esperado) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallas++;
    console.log(`  ✗ ${nombre}\n      esperado: ${esperado}\n      obtenido: ${obtenido}`);
  }
}

// T. UNA TALLA NUEVA ------------------------------------------------------------------------------------------------------------
caso(
  "T1 agregar la talla L crea una variante por color, activas, con el precio y el costo de su hermana (el del mismo color) y sin stock",
  `select retail.agregar_variantes_a_modelo(:'taller', :'prod', :'t_l'::uuid, null)::text as n \\gset
   select concat_ws(',', :'n',
     (select string_agg(v.color_codigo || '=' || v.precio || '/' || v.costo || '/' || v.activo, ' ' order by v.color_codigo) from retail.variantes v where v.producto_id = :'prod' and v.talla_id = :'t_l'),
     (select count(*) from retail.variantes where producto_id = :'prod' and activo),
     (select count(*) from retail.stock s join retail.variantes v on v.id = s.variante_id where v.producto_id = :'prod' and s.cantidad <> 0),
     (select count(*) from retail.movimientos m join retail.variantes v on v.id = m.variante_id where v.producto_id = :'prod'));`,
  "2,ACH=100.00/40.00/true ALB=120.00/50.00/true,6,0,0"
);
caso(
  "T2 la talla nueva recibe su código (el trigger de siempre) y la segunda vez avisa que ya está, sin duplicar",
  `select retail.agregar_variantes_a_modelo(:'taller', :'prod', :'t_l'::uuid, null) \\gset
   select concat_ws(',',
     (select count(*) from retail.variantes where producto_id = :'prod' and talla_id = :'t_l' and codigo is not null),
     pg_temp.agrega(:'taller', :'prod', :'t_l'::uuid, null),
     (select count(*) from retail.variantes where producto_id = :'prod' and talla_id = :'t_l'));`,
  "2,P0001|agregar_variante_ya_existe,2"
);
caso(
  "T3 una variante que ya existía solo en un color (a medias) se completa: crea solo la que falta",
  `insert into retail.productos (referencia, categoria_id) values ('Blusa A Medias Prueba', :'cat') returning id as medias \\gset
   insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values
     (:'medias', 'ACH', :'t_s', 100, 40), (:'medias', 'ALB', :'t_s', 120, 50), (:'medias', 'ACH', :'t_m', 100, 40);
   select retail.agregar_variantes_a_modelo(:'taller', :'medias', :'t_m'::uuid, null)::text as n \\gset
   select concat_ws(',', :'n', (select count(*) from retail.variantes where producto_id = :'medias' and talla_id = :'t_m'));`,
  "1,2"
);

// C. UN COLOR NUEVO -------------------------------------------------------------------------------------------------------------
caso(
  "C1 agregar un color crea una variante por talla del modelo con el precio y el costo de la hermana de esa talla (la de mayor precio), activas",
  `select retail.agregar_variantes_a_modelo(:'taller', :'prod', null, :'c_activo')::text as n \\gset
   select concat_ws(',', :'n',
     (select count(*) from retail.variantes v where v.producto_id = :'prod' and v.color_codigo = :'c_activo' and v.talla_id in (:'t_s'::uuid, :'t_m'::uuid)),
     (select string_agg(distinct v.precio || '/' || v.costo || '/' || v.activo, ' ') from retail.variantes v where v.producto_id = :'prod' and v.color_codigo = :'c_activo'),
     (select count(*) from retail.variantes where producto_id = :'prod' and activo));`,
  "2,2,120.00/50.00/true,6"
);
caso(
  "C2 un color apagado o inventado no entra; la segunda vez avisa que ya está",
  `select retail.agregar_variantes_a_modelo(:'taller', :'prod', null, :'c_activo') \\gset
   select concat_ws(',',
     pg_temp.agrega(:'taller', :'prod', null, :'c_apagado'),
     pg_temp.agrega(:'taller', :'prod', null, 'NOEXISTE'),
     pg_temp.agrega(:'taller', :'prod', null, :'c_activo'));`,
  "P0001|agregar_variante_color_inactivo,P0001|agregar_variante_color_inactivo,P0001|agregar_variante_ya_existe"
);

// R. LAS REGLAS -----------------------------------------------------------------------------------------------------------------
caso(
  "R1 una talla que la categoría no habilita no entra; ni talla ni color, o las dos a la vez, tampoco",
  `select concat_ws(',',
     pg_temp.agrega(:'taller', :'prod', :'t_fuera'::uuid, null),
     pg_temp.agrega(:'taller', :'prod', null, null),
     pg_temp.agrega(:'taller', :'prod', :'t_l'::uuid, :'c_activo'),
     (select count(*) from retail.variantes where producto_id = :'prod'));`,
  "P0001|agregar_variante_talla_no_habilitada,P0001|agregar_variante_un_eje,P0001|agregar_variante_un_eje,4"
);
caso(
  "R2 un modelo en talla única no recibe una talla; un modelo sin color no recibe un color",
  `insert into retail.productos (referencia, categoria_id) values ('Correa Única Prueba', :'cat') returning id as unica \\gset
   insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'unica', 'ACH', null, 50, 20);
   insert into retail.productos (referencia, categoria_id) values ('Blusa Sin Color Prueba', :'cat') returning id as sincolor \\gset
   insert into retail.variantes (producto_id, color_codigo, talla_id, precio, costo) values (:'sincolor', null, :'t_s', 50, 20);
   select concat_ws(',',
     pg_temp.agrega(:'taller', :'unica', :'t_l'::uuid, null),
     pg_temp.agrega(:'taller', :'sincolor', null, :'c_activo'),
     pg_temp.agrega(:'taller', :'sincolor', :'t_l'::uuid, null));`,
  "P0001|agregar_variante_modelo_sin_talla,P0001|agregar_variante_modelo_sin_color,SIN_ERROR|"
);
caso(
  "R3 una combinación que existe pero está desactivada no se reclama: avisa y manda a Editar producto, sin crear nada",
  `update retail.variantes set activo = false where producto_id = :'prod' and color_codigo = 'ACH' and talla_id = :'t_m';
   select concat_ws(',',
     pg_temp.agrega(:'taller', :'prod', :'t_m'::uuid, null),
     (select count(*) from retail.variantes where producto_id = :'prod'));`,
  "P0001|agregar_variante_desactivada,4"
);
caso(
  "R4 un modelo sin ninguna variante activa o que no existe no recibe nada",
  `update retail.variantes set activo = false where producto_id = :'prod';
   select concat_ws(',',
     pg_temp.agrega(:'taller', :'prod', :'t_l'::uuid, null),
     pg_temp.agrega(:'taller', gen_random_uuid(), :'t_l'::uuid, null));`,
  "P0001|agregar_variante_sin_variantes,P0001|agregar_variante_modelo_inexistente"
);
caso(
  "R5 solo en el Taller: en una tienda no se agrega",
  `select id as tienda from retail.ubicaciones where tipo = 'tienda' and activo order by nombre limit 1 \\gset
   select pg_temp.agrega(:'tienda', :'prod', :'t_l'::uuid, null);`,
  "P0001|agregar_variante_no_es_taller"
);

// P. LOS PERMISOS ---------------------------------------------------------------------------------------------------------------
caso(
  "P1 quien no opera ese Taller (Micaela) o no tiene sesión no puede; nada se crea",
  `${como(MICAELA)}
   select pg_temp.agrega(:'taller', :'prod', :'t_l'::uuid, null) as p1 \\gset
   ${como(SIN_CUENTA)}
   select concat_ws(',', :'p1', pg_temp.agrega(:'taller', :'prod', :'t_l'::uuid, null));`,
  "42501|produccion_sin_taller,42501|produccion_sin_modulo"
);
caso(
  "P2 quien opera el Taller pero no edita el catálogo no puede (las variantes son del catálogo)",
  `-- Una cuenta con Producción y sin Productos ni Atributos: se simula con la llave de catálogo cerrada, dentro de la transacción (el ROLLBACK la devuelve).
   create or replace function retail.fn_puede_editar_catalogo() returns boolean language sql stable as $f$ select false $f$;
   select concat_ws(',', pg_temp.agrega(:'taller', :'prod', :'t_l'::uuid, null), pg_temp.agrega(:'taller', :'prod', null, :'c_activo'),
     (select count(*) from retail.variantes where producto_id = :'prod'));`,
  "42501|agregar_variante_sin_permiso,42501|agregar_variante_sin_permiso,4"
);

// V. LA VERSIÓN -----------------------------------------------------------------------------------------------------------------
caso(
  "V1 el producto sube de versión (Editar producto avisa a quien lo tenga abierto) y el stock no se toca",
  `select retail.agregar_variantes_a_modelo(:'taller', :'prod', :'t_l'::uuid, null) \\gset
   select concat_ws(',', (select version - :'v0'::int from retail.productos where id = :'prod'),
     (select count(*) from retail.stock s join retail.variantes v on v.id = s.variante_id where v.producto_id = :'prod'));`,
  "1,0"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la migración se vuelve a cargar encima sin error y la función sigue siendo una sola",
  `${MIGRACION}
   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail' and p.proname = 'agregar_variantes_a_modelo';`,
  "1"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
