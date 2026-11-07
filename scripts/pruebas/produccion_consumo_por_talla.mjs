#!/usr/bin/env node
/**
 * Pruebas del consumo de tela POR TALLA de una orden (ADR-0513, actividad 2) — migración `20261026151000_produccion_consumo_por_talla.sql`, sobre
 * `20261026035000` (editar tela y avíos de una orden abierta). CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden pueda decir cuánto lleva CADA TALLA (una M gasta más que una S) y que el plan sea la suma por talla × prendas de esa talla
 * × (1 + merma de la tela); que sin consumo por talla todo siga EXACTAMENTE igual (mismo plan, mismos rechazos); que lo malo se rechace con su motivo
 * (falta una talla, una talla que la orden no fabrica, un número roto) y sin dejar nada a medias; que abrir, editar y la lectura de la orden lo guarden y
 * lo devuelvan; que una fila cuyo consumo por talla cambió se corrija aunque el promedio sea el mismo; y que lo declarado en el modelo lleve `por_talla`.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; las migraciones se cargan dentro de cada caso: así se prueba que se pueden pegar otra vez).
 *   T  ABRIR:   por talla de un color y de toda la orden; sin por talla = lo de siempre; el modelo queda con `por_talla` declarado.
 *   V  VALIDAR: falta una talla, talla ajena, texto roto, cero, no es objeto, color ajeno; `null` equivale a «sin por talla».
 *   G  GUARDAR: la fila nueva, el mismo envío no cambia nada, pasar a una cifra (mismo promedio) SÍ corrige.
 *   L  LEER:    la orden en una sola lectura devuelve el consumo por talla.
 *   F  FIJAR:   «Dejar como el del modelo» con por talla, y con una cifra la limpia.
 *   M  LA MIGRACIÓN: se vuelve a cargar sin error y todo sigue funcionando.
 *
 * USO
 *   node scripts/pruebas/produccion_consumo_por_talla.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_consumo_por_talla.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_consumo_por_talla.mjs --base otra                 → contra otra base del mismo contenedor
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
const leerMig = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION_EDITAR = leerMig("20261026035000_produccion_editar_tela_y_avios_de_la_orden.sql");
const MIGRACION = leerMig("20261026151000_produccion_consumo_por_talla.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)
const MICAELA = "22222222-2222-4222-8222-000000000003"; // Integrante de Tienda Trujillo (seed)

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

// Envolturas que nunca abortan el caso: devuelven «OK:…» o «<sqlstate>|<hint>|<mensaje>».
const ENVOLTURAS = `
create function pg_temp.eh(p text) returns text language sql as $f$ select split_part(p, '|', 1) || '|' || split_part(p, '|', 2) $f$;
create table pg_temp.ultima (id uuid);
create function pg_temp.abre(p_apertura jsonb, p_fases jsonb, p_insumos jsonb default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_fila record;
begin
  for v_fila in select r.id, r.numero from retail.abrir_orden_produccion(p_apertura, p_fases, p_insumos) r loop
    delete from pg_temp.ultima; insert into pg_temp.ultima values (v_fila.id);
    return 'OK:' || v_fila.numero;
  end loop;
  return 'SIN_FILA';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
-- Guarda la lista sobre la última orden abierta: «OK:agregadas,corregidas,quitadas» o «<sqlstate>|<hint>|<mensaje>».
create function pg_temp.guarda(p_insumos jsonb, p_orden uuid default null) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text; v_r jsonb;
begin
  v_r := retail.guardar_insumos_orden(coalesce(p_orden, (select id from pg_temp.ultima)), p_insumos);
  return 'OK:' || (v_r ->> 'agregadas') || ',' || (v_r ->> 'corregidas') || ',' || (v_r ->> 'quitadas');
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: lino (5 % de merma), botones y un modelo del seed con al menos dos colores y dos tallas (los dos primeros de cada una).
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION_EDITAR}
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('TL-LINO', 'Lino Talla Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('TL-BOTON', 'Botón Talla Prueba', 'avio', 'unidad') returning id as boton \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
    and (select count(distinct v.talla_id) from retail.variantes v where v.producto_id = p.id and v.activo) >= 2
  order by p.created_at limit 1 \\gset
select v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null group by 1 order by 1 limit 1 \\gset
select v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' group by 1 order by 1 limit 1 \\gset
select t.id as ta1, t.valor as t1 from retail.tallas t where t.id in (select talla_id from retail.variantes where producto_id = :'prod' and activo) order by t.id limit 1 \\gset
select t.id as ta2, t.valor as t2 from retail.tallas t where t.id in (select talla_id from retail.variantes where producto_id = :'prod' and activo) and t.id <> :'ta1' order by t.id limit 1 \\gset
select v.id as v11 from retail.variantes v where v.producto_id = :'prod' and v.color_codigo = :'c1' and v.talla_id = :'ta1' and v.activo limit 1 \\gset
select v.id as v12 from retail.variantes v where v.producto_id = :'prod' and v.color_codigo = :'c1' and v.talla_id = :'ta2' and v.activo limit 1 \\gset
select v.id as v21 from retail.variantes v where v.producto_id = :'prod' and v.color_codigo = :'c2' and v.talla_id = :'ta1' and v.activo limit 1 \\gset
select v.id as v22 from retail.variantes v where v.producto_id = :'prod' and v.color_codigo = :'c2' and v.talla_id = :'ta2' and v.activo limit 1 \\gset
${como(FELIPE)}
`;

// La orden: color 1 → 10 de la talla 1 y 20 de la talla 2; color 2 → 5 y 15. En total 15 de la talla 1 y 35 de la talla 2 (50 prendas).
const APERTURA = (extra = "") => `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text${extra},
  'lineas', jsonb_build_array(
    jsonb_build_object('variante_id', :'v11', 'cantidad', '10'), jsonb_build_object('variante_id', :'v12', 'cantidad', '20'),
    jsonb_build_object('variante_id', :'v21', 'cantidad', '5'), jsonb_build_object('variante_id', :'v22', 'cantidad', '15')))`;
const FASE = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${FASE("corte")}, ${FASE("costura")}, ${FASE("acabado")})`;

// Una fila de la lista. `consumo` = una cifra (texto) o [talla 1, talla 2]. El color es 'c1', 'c2', null (toda la orden) o un texto entre comillas.
const COLOR = (c) => (c === null ? "null::text" : c.startsWith("'") ? c : `:'${c}'`);
const TALLAS_JSON = ([a, b], extra = "") => `jsonb_build_object(:'t1', '${a}', :'t2', '${b}'${extra})`;
const FILA = (insumo, color, consumo) =>
  Array.isArray(consumo)
    ? `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${COLOR(color)}, 'consumo_por_talla', ${TALLAS_JSON(consumo)})`
    : `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${COLOR(color)}, 'consumo_por_prenda', '${consumo}')`;
const LISTA = (...filas) => `jsonb_build_array(${filas.map((f) => FILA(...f)).join(", ")})`;
// Lo que quedó en la orden: «TL-LINO:c1:1.333:42.000:1.000/1.500».
const PLAN = `(select coalesce(string_agg(i.codigo || ':' || case when pi.color_codigo = :'c1' then 'c1' when pi.color_codigo = :'c2' then 'c2' else '-' end || ':' || pi.consumo_por_prenda || ':' || pi.cantidad_plan || ':'
     || coalesce((pi.consumo_por_talla ->> :'t1') || '/' || (pi.consumo_por_talla ->> :'t2'), '-'), ' ' order by i.codigo, pi.color_codigo), 'vacío')
   from retail.produccion_insumos pi join retail.insumos i on i.id = pi.insumo_id where pi.produccion_id = (select id from pg_temp.ultima))`;
const MODELO = `(select coalesce(c.tela_por_prenda || ':' || coalesce((c.por_talla ->> :'t1') || '/' || (c.por_talla ->> :'t2'), '-') || ':' || c.fuente, 'sin') from retail.producto_consumos c where c.producto_id = :'prod')`;
const ABRE = (lista, extra = "") => `select pg_temp.abre(${APERTURA(extra)}, ${ESPINA}, ${lista}) as r \\gset`;
const ABRE_SIN_TELA = `select pg_temp.abre(${APERTURA()}, ${ESPINA}) as r \\gset`;

let fallas = 0;
let casos = 0;
function anotar(nombre, bien, esperado, obtenido) {
  casos++;
  if (!bien) {
    fallas++;
    console.log(`✗ ${nombre}\n    esperado: ${esperado}\n    obtenido: ${obtenido}`);
  } else {
    console.log(`✓ ${nombre}`);
  }
}
function caso(nombre, sql, esperado) {
  const r = correr(`${PRELUDIO}${sql}\nrollback;`);
  if (process.env.MD_DEBUG && !r.ok) console.log(r.mensaje);
  const obtenido = r.ok ? r.salida.split("\n").at(-1) : `ERROR_DE_SCRIPT ${r.mensaje.split("\n").find((l) => l.includes("ERROR")) ?? r.mensaje}`;
  const bien = typeof esperado === "function" ? esperado(obtenido) : obtenido === esperado;
  anotar(nombre, bien, typeof esperado === "function" ? "(condición)" : esperado, obtenido);
}

// T. ABRIR ----------------------------------------------------------------------------------------------------------------------
caso(
  "T1 lino por talla en el primer color (talla 1: 1.0, talla 2: 1.5; 10 y 20 prendas): plan = (10×1.0 + 20×1.5) × 1.05 = 42.000, el consumo por prenda es el promedio (1.333) y el modelo queda con la cifra por talla",
  `${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]]))}
   select concat_ws('|', :'r', ${PLAN}, ${MODELO});`,
  (o) => /^OK:\d+\|TL-LINO:c1:1\.333:42\.000:1\.000\/1\.500\|1\.333:1\.000\/1\.500:declarado$/.test(o)
);
caso(
  "T2 SIN consumo por talla todo queda como siempre: 1.2 × 30 × 1.05 = 37.8, sin cifra por talla, y el modelo sin cifra por talla",
  `${ABRE(LISTA(["lino", "c1", "1.2"]))}
   select concat_ws('|', :'r', ${PLAN}, ${MODELO});`,
  (o) => /^OK:\d+\|TL-LINO:c1:1\.200:37\.800:-\|1\.200:-:declarado$/.test(o)
);
caso(
  "T3 una fila de TODA la orden (color vacío) suma las dos tallas de todos los colores: 15 de la talla 1 y 35 de la 2 → (15×1.0 + 35×2.0) × 1.05 = 89.25, promedio 1.700",
  `${ABRE(LISTA(["lino", null, ["1.0", "2.0"]]))}
   select concat_ws('|', :'r', ${PLAN});`,
  (o) => /^OK:\d+\|TL-LINO:-:1\.700:89\.250:1\.000\/2\.000$/.test(o)
);
caso(
  "T4 el segundo color cuenta SUS prendas (5 y 15): (5×1.0 + 15×1.5) × 1.05 = 28.875; y dos colores pueden llevar cifras distintas de la misma tela",
  `${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]], ["lino", "c2", ["1.0", "1.5"]], ["boton", null, "4"]))}
   select concat_ws('|', :'r', ${PLAN});`,
  (o) => /^OK:\d+\|TL-BOTON:-:4\.000:200\.000:- TL-LINO:c1:1\.333:42\.000:1\.000\/1\.500 TL-LINO:c2:1\.375:28\.875:1\.000\/1\.500$/.test(o)
);

// V. VALIDAR --------------------------------------------------------------------------------------------------------------------
const MAL = (consumoPorTalla, color = "c1") =>
  `pg_temp.eh(pg_temp.abre(${APERTURA()}, ${ESPINA}, jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', ${COLOR(color)}, 'consumo_por_talla', ${consumoPorTalla}))))`;
caso(
  "V1 falta la cifra de una talla que la fila fabrica → insumo_consumo_invalido; y no queda ninguna orden escrita",
  `select concat_ws('|', ${MAL("jsonb_build_object(:'t1', '1.0')")}, (select count(*) from pg_temp.ultima));`,
  "P0001|insumo_consumo_invalido|0"
);
caso(
  "V2 una talla que la orden no fabrica → insumo_talla_ajena",
  `select ${MAL("jsonb_build_object(:'t1', '1.0', :'t2', '1.5', 'XXL9', '2.0')")};`,
  "P0001|insumo_talla_ajena"
);
caso(
  "V3 una cifra que no es número, un cero y un tope pasado → insumo_consumo_invalido (los tres, sin dejar nada)",
  `select concat_ws(',', ${MAL("jsonb_build_object(:'t1', 'abc', :'t2', '1.5')")}, ${MAL("jsonb_build_object(:'t1', '0', :'t2', '1.5')")}, ${MAL("jsonb_build_object(:'t1', '1.0', :'t2', '10000')")});`,
  "P0001|insumo_consumo_invalido,P0001|insumo_consumo_invalido,P0001|insumo_consumo_invalido"
);
caso(
  "V4 si el consumo por talla no es un objeto (una lista, un número) → insumo_consumo_invalido",
  `select concat_ws(',', ${MAL("'[1, 2]'::jsonb")}, ${MAL("'1.5'::jsonb")});`,
  "P0001|insumo_consumo_invalido,P0001|insumo_consumo_invalido"
);
caso(
  "V5 un color que la orden no fabrica sigue rechazándose antes que nada (insumo_color_ajeno), también con consumo por talla",
  `select ${MAL("jsonb_build_object(:'t1', '1.0', :'t2', '1.5')", "'ZZZ'")};`,
  "P0001|insumo_color_ajeno"
);
caso(
  "V6 un consumo por talla en JSON null equivale a «sin consumo por talla»: manda el consumo por prenda (1.2 → 37.8) y nada queda como por talla",
  `select pg_temp.abre(${APERTURA()}, ${ESPINA}, jsonb_build_array(jsonb_build_object('insumo_id', :'lino', 'color_codigo', :'c1', 'consumo_por_prenda', '1.2', 'consumo_por_talla', 'null'::jsonb))) as r \\gset
   select concat_ws('|', :'r', ${PLAN});`,
  (o) => /^OK:\d+\|TL-LINO:c1:1\.200:37\.800:-$/.test(o)
);

// G. GUARDAR --------------------------------------------------------------------------------------------------------------------
caso(
  "G1 una orden abierta sin tela declara el lino por talla: 42.000 y el modelo queda con la cifra por talla (como al abrir); enviar lo mismo otra vez no cambia nada",
  `${ABRE_SIN_TELA}
   select pg_temp.guarda(${LISTA(["lino", "c1", ["1.0", "1.5"]])}) as g1 \\gset
   select pg_temp.guarda(${LISTA(["lino", "c1", ["1.0", "1.5"]])}) as g2 \\gset
   select concat_ws('|', :'g1', :'g2', ${PLAN}, ${MODELO});`,
  "OK:1,0,0|OK:0,0,0|TL-LINO:c1:1.333:42.000:1.000/1.500|1.333:1.000/1.500:declarado"
);
caso(
  "G2 corregir solo UNA talla (la 2 de 1.5 a 1.6) corrige la fila y recalcula el plan: (10×1.0 + 20×1.6) × 1.05 = 44.1",
  `${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]]))}
   select pg_temp.guarda(${LISTA(["lino", "c1", ["1.0", "1.6"]])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN});`,
  "OK:0,1,0|TL-LINO:c1:1.400:44.100:1.000/1.600"
);
caso(
  "G3 pasar de por talla a UNA cifra con el mismo promedio (1.333) corrige la fila aunque el promedio no cambie: queda sin cifra por talla (aproximado) y con el plan de una cifra",
  `${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]]))}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.333"])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN});`,
  "OK:0,1,0|TL-LINO:c1:1.333:41.990:-"
);
caso(
  "G4 y al revés: de una cifra a por talla corrige la fila y el plan pasa a ser la suma por talla",
  `${ABRE(LISTA(["lino", "c1", "1.333"]))}
   select pg_temp.guarda(${LISTA(["lino", "c1", ["1.0", "1.5"]])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN});`,
  "OK:0,1,0|TL-LINO:c1:1.333:42.000:1.000/1.500"
);

// L. LEER -----------------------------------------------------------------------------------------------------------------------
caso(
  "L1 la orden en una sola lectura devuelve el consumo por talla de cada fila (y null donde es una cifra)",
  `${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]], ["lino", "c2", "1.2"]))}
   select concat_ws('|', :'r', (select string_agg(coalesce((i -> 'consumo_por_talla' ->> :'t1') || '/' || (i -> 'consumo_por_talla' ->> :'t2'), 'null'), ' ' order by i ->> 'color_codigo')
     from jsonb_array_elements(retail.fn_orden_produccion((select id from pg_temp.ultima)) -> 'insumos') i));`,
  (o) => /^OK:\d+\|1\.000\/1\.500 null$/.test(o)
);

// F. FIJAR EN EL MODELO ---------------------------------------------------------------------------------------------------------
caso(
  "F1 «Dejar este consumo como el del modelo» con consumo por talla corrige lo que el modelo ya decía, incluida su cifra por talla",
  `insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente) values (:'prod', 1.350, 'declarado');
   ${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]]), ", 'fijar_consumo_modelo', true")}
   select concat_ws('|', :'r', ${MODELO});`,
  (o) => /^OK:\d+\|1\.333:1\.000\/1\.500:declarado$/.test(o)
);
caso(
  "F2 y con una sola cifra, el modelo queda sin cifra por talla (se limpia la anterior)",
  `insert into retail.producto_consumos (producto_id, tela_por_prenda, por_talla, fuente) values (:'prod', 1.350, jsonb_build_object(:'t1', 1.0, :'t2', 1.5), 'declarado');
   ${ABRE(LISTA(["lino", "c1", "1.2"]), ", 'fijar_consumo_modelo', true")}
   select concat_ws('|', :'r', ${MODELO});`,
  (o) => /^OK:\d+\|1\.200:-:declarado$/.test(o)
);
caso(
  "F3 sin pedirlo, lo que el modelo ya declara NO se pisa (la orden con por talla no cambia su cifra)",
  `insert into retail.producto_consumos (producto_id, tela_por_prenda, fuente) values (:'prod', 1.350, 'declarado');
   ${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]]))}
   select concat_ws('|', :'r', ${MODELO});`,
  (o) => /^OK:\d+\|1\.350:-:declarado$/.test(o)
);

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se puede pegar otra vez sin error y el consumo por talla sigue funcionando",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   ${ABRE(LISTA(["lino", "c1", ["1.0", "1.5"]]))}
   select concat_ws('|', :'r', ${PLAN});`,
  (o) => /^OK:\d+\|TL-LINO:c1:1\.333:42\.000:1\.000\/1\.500$/.test(o)
);

console.log(`\n${casos - fallas}/${casos} casos bien${fallas ? ` — ${fallas} en rojo` : ""} (contenedor: ${CONTENEDOR})`);
process.exit(fallas ? 1 : 0);
