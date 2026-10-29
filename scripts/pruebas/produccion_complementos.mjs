#!/usr/bin/env node
/**
 * Pruebas de «los complementos de la prenda» (forro, otra tela) en la orden de producción (ADR-0563, actividad 1) — migración
 * `20261029021000_produccion_complementos_de_la_orden.sql`. CAYLA V2.
 *
 * LO QUE VIGILA. Que una orden pueda llevar, además de la tela principal de cada color, un forro o una segunda tela SIN que el modelo aprenda mal: un complemento no declara el
 * consumo del modelo (`producto_consumos`) y sus metros no suman a «lo medido» al pasar un lote al stock (`producto_consumo_medido`); su costo y su consumo anotado cuentan como
 * los de cualquier material. Una orden que no manda `complemento` queda exactamente como estaba. Cambiar el rol de una fila que ya estaba no mueve su plan.
 *
 * QUÉ PRUEBA (cada caso en su transacción con ROLLBACK; la migración se carga dentro de cada caso: así se prueba que se puede pegar otra vez).
 *   M  LA MIGRACIÓN: columna, función nueva, una sola copia de cada función, y las migraciones de ANTES (150000, 151000, 152000) se pueden volver a cargar encima.
 *   A  ABRIR: un forro (con la tela del modelo después de él) marca la fila y NO declara el modelo; sin `complemento` todo queda como siempre; un valor ilegible se rechaza.
 *   G  GUARDAR: agregar un complemento; cambiar solo el rol de una fila (cuenta como corregida, no mueve el plan, repetirlo no cambia nada); rol + consumo cuentan una vez.
 *   C  PASAR AL STOCK: lo medido es solo de la tela principal (69 m, no 109); el costo del forro entra a la orden; el control sin la marca mide los 109; una misma tela principal en
 *      un color y complemento en otro no aporta a lo medido y el cierre sigue.
 *   L  LA LECTURA: `fn_orden_produccion` devuelve `es_complemento` por fila.
 *   S  LA FORMA: seguridad de las funciones tocadas y de la nueva (anon no).
 *
 * LO QUE ESTA PRUEBA NO HACE: dos sesiones a la vez (cada caso es una sola transacción; ver `ci-paridad.test.ts`).
 *
 * USO
 *   node scripts/pruebas/produccion_complementos.mjs                             → contra el stack local compartido (todo con ROLLBACK)
 *   node scripts/pruebas/produccion_complementos.mjs --contenedor supabase_db_x  → contra otro stack
 *   node scripts/pruebas/produccion_complementos.mjs --base otra                 → contra otra base del mismo contenedor
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
const leer = (nombre) => sinCandadosDePegado(readFileSync(join(RAIZ, "supabase", "migrations", nombre), "utf8"));
const MIGRACION = leer("20261029021000_produccion_complementos_de_la_orden.sql");

const FELIPE = "22222222-2222-4222-8222-000000000001"; // líder y Admin (seed)

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

// Envolturas que nunca abortan el caso: devuelven «OK…» o «<sqlstate>|<hint>|<mensaje>».
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
create function pg_temp.avanza(p_fase uuid, p_lineas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.registrar_avance(p_fase, p_lineas, null);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
create function pg_temp.cierra(p_oid uuid, p_buenas jsonb) returns text language plpgsql as $f$
declare v_estado text; v_hint text; v_msg text;
begin
  perform retail.cerrar_produccion(p_oid, p_buenas, null, null, null, true);
  return 'OK';
exception when others then
  get stacked diagnostics v_estado = returned_sqlstate, v_hint = pg_exception_hint, v_msg = message_text;
  return v_estado || '|' || coalesce(v_hint, '') || '|' || v_msg;
end;
$f$;
`;

// Datos propios: lino (tela, 5 % de merma), forro (tela, sin merma), botones (avío) y el modelo del seed con sus dos colores.
const PRELUDIO = `
set client_min_messages = warning;
begin;
set local search_path = retail, public, extensions;
${MIGRACION}
set local search_path = retail, public, extensions;
${ENVOLTURAS}
insert into retail.insumos (codigo, nombre, tipo, unidad_medida, merma_pct) values ('CO-LINO', 'Lino Complemento Prueba', 'tela', 'metro', 0.05) returning id as lino \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CO-FORRO', 'Forro Complemento Prueba', 'tela', 'metro') returning id as forro \\gset
insert into retail.insumos (codigo, nombre, tipo, unidad_medida) values ('CO-BOTON', 'Botón Complemento Prueba', 'avio', 'unidad') returning id as boton \\gset
select p.id as felipe_p from public.personas p where p.auth_user_id = '${FELIPE}' \\gset
select id as taller from retail.ubicaciones where tipo = 'taller' and activo order by nombre limit 1 \\gset
select p.id as prod from retail.productos p
  where p.es_prueba is not true and p.estado <> 'descontinuado'
    and (select count(distinct v.color_codigo) from retail.variantes v where v.producto_id = p.id and v.activo and v.color_codigo is not null) >= 2
  order by p.created_at limit 1 \\gset
select v.id as v1, v.color_codigo as c1 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null order by v.color_codigo, v.id limit 1 \\gset
select v.id as v2, v.color_codigo as c2 from retail.variantes v where v.producto_id = :'prod' and v.activo and v.color_codigo is not null and v.color_codigo <> :'c1' order by v.color_codigo, v.id limit 1 \\gset
delete from retail.producto_consumos where producto_id = :'prod';
${como(FELIPE)}
`;

// La apertura de siempre: 30 del primer color y 20 del segundo (50 prendas).
const APERTURA = `jsonb_build_object(
  'ubicacion_id', :'taller', 'producto_id', :'prod', 'es_muestra', false, 'fecha_entrega', (retail.fn_hoy_lima() + 10)::text,
  'lineas', jsonb_build_array(jsonb_build_object('variante_id', :'v1', 'cantidad', '30'), jsonb_build_object('variante_id', :'v2', 'cantidad', '20')))`;
const TALLER = (clave) => `jsonb_build_object('clave', '${clave}', 'quien', 'taller')`;
const ESPINA = `jsonb_build_array(${TALLER("corte")}, ${TALLER("costura")}, ${TALLER("acabado")})`;
const L = (...pares) => `jsonb_build_array(${pares.map(([v, n]) => `jsonb_build_object('variante_id', :'${v}', 'cantidad', '${n}')`).join(", ")})`;

// Una fila de la lista: [insumo, color, consumo, complemento?]. El color es 'c1', 'c2' o null (toda la orden). `complemento` puede ser true, false, o un texto crudo (para probar un valor ilegible).
const FILA = (insumo, color, consumo, complemento) => {
  const marca = complemento === undefined ? "" : typeof complemento === "string" ? `, 'complemento', '${complemento}'` : `, 'complemento', ${complemento}`;
  return `jsonb_build_object('insumo_id', :'${insumo}', 'color_codigo', ${color === null ? "null::text" : `:'${color}'`}, 'consumo_por_prenda', '${consumo}'${marca})`;
};
const LISTA = (...filas) => `jsonb_build_array(${filas.map((f) => FILA(...f)).join(", ")})`;
// Lo que quedó en la orden, legible: «CO-FORRO:-:C:0.900:45.000 CO-LINO:c1:P:1.200:37.800» (material:color:rol:consumo:plan; P = principal, C = complemento).
const PLAN = `(select coalesce(string_agg(i.codigo || ':' || case when pi.color_codigo = :'c1' then 'c1' when pi.color_codigo = :'c2' then 'c2' else '-' end || ':' || case when pi.es_complemento then 'C' else 'P' end
     || ':' || pi.consumo_por_prenda || ':' || pi.cantidad_plan, ' ' order by i.codigo, pi.color_codigo), 'vacío')
   from retail.produccion_insumos pi join retail.insumos i on i.id = pi.insumo_id where pi.produccion_id = (select id from pg_temp.ultima))`;
const DECLARADO = `coalesce((select tela_por_prenda::text from retail.producto_consumos where producto_id = :'prod'), 'sin')`;
const ABRE = (lista) => `select pg_temp.abre(${APERTURA}, ${ESPINA}, ${lista}) as r \\gset`;
const ABRE_SIN_TELA = `select pg_temp.abre(${APERTURA}, ${ESPINA}) as r \\gset`;

// Para pasar un lote al stock: la orden con su lista, las tres fases de punta a punta, un lote de cada tela y el costo de las prendas.
const FLUJO = (lista) => `${ABRE(lista)}
   select id as oid from pg_temp.ultima \\gset
   select id as f_corte from retail.produccion_fases where produccion_id = :'oid' and clave = 'corte' \\gset
   select id as f_cost from retail.produccion_fases where produccion_id = :'oid' and clave = 'costura' \\gset
   select id as f_acab from retail.produccion_fases where produccion_id = :'oid' and clave = 'acabado' \\gset
   select pg_temp.avanza(:'f_corte', ${L(["v1", 30], ["v2", 20])}) as a0 \\gset
   select pg_temp.avanza(:'f_cost', ${L(["v1", 30], ["v2", 20])}) as a1 \\gset
   select pg_temp.avanza(:'f_acab', ${L(["v1", 30], ["v2", 20])}) as a2 \\gset
   update retail.variantes set costo = 4.50 where id in (:'v1', :'v2');
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'lino', :'taller', 200, 12.50, 'compra') returning id as lote_lino \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id) values (:'lino', :'lote_lino', :'taller', 'compra', 200, 12.50, :'felipe_p');
   insert into retail.insumo_lotes (insumo_id, ubicacion_id, cantidad_ingresada, costo_unitario, origen) values (:'forro', :'taller', 200, 8, 'compra') returning id as lote_forro \\gset
   insert into retail.movimientos_insumo (insumo_id, insumo_lote_id, ubicacion_id, tipo, cantidad, costo_unitario, usuario_id) values (:'forro', :'lote_forro', :'taller', 'compra', 200, 8, :'felipe_p');`;
const CONSUMO = (insumo, metros) => `select retail.registrar_consumo_insumo(:'oid', :'${insumo}', ${metros}, 'tendido') as consumo_${insumo} \\gset`;
const CIERRA = `select pg_temp.cierra(:'oid', ${L(["v1", 30], ["v2", 20])}) as c \\gset`;
const MEDIDO = `coalesce((select buenas || ':' || metros from retail.producto_consumo_medido where produccion_id = :'oid'), 'sin_medida')`;
const ESTADO = `(select estado from retail.producciones where id = :'oid')`;

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

// M. LA MIGRACIÓN ---------------------------------------------------------------------------------------------------------------
caso(
  "M1 la migración se vuelve a cargar sin error (idempotente): la columna es boolean, no nula y nace en falso, y cada función sigue siendo una sola",
  `${MIGRACION}
   set local search_path = retail, public, extensions;
   select concat_ws('|',
     (select data_type || ':' || is_nullable || ':' || column_default from information_schema.columns where table_schema = 'retail' and table_name = 'produccion_insumos' and column_name = 'es_complemento'),
     (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'retail'
        and p.proname in ('fn_produccion_insumos_marcar_complementos', 'abrir_orden_produccion', 'guardar_insumos_orden', 'cerrar_produccion', 'fn_orden_produccion')));`,
  "boolean:NO:false|5"
);
caso(
  "M2 las migraciones de ANTES (lo medido, el consumo por talla, los avíos del modelo) se pueden volver a cargar encima de esta sin perder su ancla ni la marca de los complementos",
  `${leer("20261026150000_produccion_lo_medido_no_pisa_lo_declarado.sql")}
   set local search_path = retail, public, extensions;
   ${leer("20261026151000_produccion_consumo_por_talla.sql")}
   set local search_path = retail, public, extensions;
   ${leer("20261026152000_produccion_avios_del_modelo.sql")}
   set local search_path = retail, public, extensions;
   select concat_ws('|',
     (pg_get_functiondef('retail.cerrar_produccion(uuid, jsonb, numeric, numeric, numeric, boolean)'::regprocedure) like '%ADR-0563%'),
     (pg_get_functiondef('retail.abrir_orden_produccion(jsonb, jsonb, jsonb)'::regprocedure) like '%ADR-0563%'),
     (pg_get_functiondef('retail.guardar_insumos_orden(uuid, jsonb)'::regprocedure) like '%ADR-0563%'),
     (pg_get_functiondef('retail.fn_orden_produccion(uuid)'::regprocedure) like '%es_complemento%'));`,
  "t|t|t|t"
);

// A. ABRIR ----------------------------------------------------------------------------------------------------------------------
caso(
  "A1 una orden con un forro (toda la orden, 0.9 m, puesto ANTES de la tela) y lino en el primer color: el forro queda marcado como complemento (0.9 × 50 = 45) y el modelo declara el consumo del LINO (1.200), no el del forro",
  `${ABRE(LISTA(["forro", null, "0.9", true], ["lino", "c1", "1.2", false]))}
   select concat_ws('|', :'r' like 'OK:%', ${PLAN}, ${DECLARADO});`,
  "t|CO-FORRO:-:C:0.900:45.000 CO-LINO:c1:P:1.200:37.800|1.200"
);
caso(
  "A2 el control: sin `complemento` (como manda la web de hoy) todas las filas son la tela de siempre, y la PRIMERA declara el modelo (aquí el forro, 0.900): la marca es lo que lo evita",
  `${ABRE(LISTA(["forro", null, "0.9"], ["lino", "c1", "1.2"]))}
   select concat_ws('|', :'r' like 'OK:%', ${PLAN}, ${DECLARADO});`,
  "t|CO-FORRO:-:P:0.900:45.000 CO-LINO:c1:P:1.200:37.800|0.900"
);
caso(
  "A3 una orden con SOLO complementos no deja declarado ningún consumo del modelo: no hay tela principal que declarar",
  `${ABRE(LISTA(["forro", null, "0.9", true], ["boton", null, "4", true]))}
   select concat_ws('|', :'r' like 'OK:%', ${PLAN}, ${DECLARADO});`,
  "t|CO-BOTON:-:C:4.000:200.000 CO-FORRO:-:C:0.900:45.000|sin"
);
caso(
  "A4 un `complemento` que no se lee como verdadero o falso se rechaza (insumo_invalido) y no abre la orden",
  `select count(*) as antes from retail.producciones \\gset
   ${ABRE(LISTA(["forro", null, "0.9", "quizas"]))}
   select concat_ws('|', pg_temp.eh(:'r'), (select count(*) from retail.producciones) - :antes);`,
  "P0001|insumo_invalido|0"
);

// G. GUARDAR --------------------------------------------------------------------------------------------------------------------
caso(
  "G1 una orden abierta con lino agrega un forro como complemento: `OK:1,0,0`, el forro queda marcado, el lino sigue siendo la principal y el modelo sigue diciendo 1.200",
  `${ABRE(LISTA(["lino", "c1", "1.2"]))}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true])}) as g \\gset
   select concat_ws('|', :'g', ${PLAN}, ${DECLARADO});`,
  "OK:1,0,0|CO-FORRO:-:C:0.900:45.000 CO-LINO:c1:P:1.200:37.800|1.200"
);
caso(
  "G2 declarar SOLO un forro en una orden sin tela no deja nada en el modelo; al sumar después el lino (el forro sigue primero en la lista) el modelo queda con el consumo del lino (1.200)",
  `${ABRE_SIN_TELA}
   select pg_temp.guarda(${LISTA(["forro", null, "0.9", true])}) as g1 \\gset
   select ${DECLARADO} as tras_forro \\gset
   select pg_temp.guarda(${LISTA(["forro", null, "0.9", true], ["lino", "c1", "1.2"])}) as g2 \\gset
   select concat_ws('|', :'g1', :'tras_forro', :'g2', ${DECLARADO});`,
  "OK:1,0,0|sin|OK:1,0,0|1.200"
);
caso(
  "G3 cambiar SOLO el rol de una fila que ya estaba (el forro pasa de tela a complemento) cuenta como una corrección, no mueve su plan aunque la merma del catálogo cambie, y reenviarlo no cambia nada ni anota otra edición",
  `${ABRE(LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9"]))}
   reset role;
   update retail.insumos set merma_pct = 0.10 where id = :'forro';
   ${como(FELIPE)}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true])}) as g1 \\gset
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true])}) as g2 \\gset
   select concat_ws('|', :'g1', :'g2', ${PLAN},
     (select count(*) from retail.actividad where accion = 'orden_produccion_tela_editada' and registro_id = (select id::text from pg_temp.ultima)));`,
  "OK:0,1,0|OK:0,0,0|CO-FORRO:-:C:0.900:45.000 CO-LINO:c1:P:1.200:37.800|1"
);
caso(
  "G4 volver un complemento a tela principal también es una corrección (`OK:0,1,0`); y cambiar el rol Y el consumo de la misma fila cuenta UNA vez, no dos (el plan sí se recalcula: 1.0 × 50 = 50)",
  `${ABRE(LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true]))}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", false])}) as g1 \\gset
   select ${PLAN} as p1 \\gset
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["forro", null, "1.0", true])}) as g2 \\gset
   select concat_ws('|', :'g1', :'p1', :'g2', ${PLAN});`,
  "OK:0,1,0|CO-FORRO:-:P:0.900:45.000 CO-LINO:c1:P:1.200:37.800|OK:0,1,0|CO-FORRO:-:C:1.000:50.000 CO-LINO:c1:P:1.200:37.800"
);
caso(
  "G5 un `complemento` ilegible al guardar se rechaza (insumo_invalido) y la lista que había no se toca",
  `${ABRE(LISTA(["lino", "c1", "1.2"]))}
   select pg_temp.guarda(${LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", "quizas"])}) as g \\gset
   select concat_ws('|', pg_temp.eh(:'g'), ${PLAN});`,
  "P0001|insumo_invalido|CO-LINO:c1:P:1.200:37.800"
);

// C. PASAR AL STOCK -------------------------------------------------------------------------------------------------------------
caso(
  "C1 LO MEDIDO: con lino (69 m) y forro complemento (40 m) gastados, lo medido es solo el lino (50 prendas : 69 m), no los 109 m; y el costo de la tela de la orden SÍ incluye el forro (69 × 12.50 + 40 × 8 = 1182.50)",
  `${FLUJO(LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true]))}
   ${CONSUMO("lino", 69)}
   ${CONSUMO("forro", 40)}
   ${CIERRA}
   select concat_ws('|', :'c', ${ESTADO}, ${MEDIDO}, (select costo_tela from retail.producciones where id = :'oid'));`,
  "OK|terminada|50:69.000|1182.50"
);
caso(
  "C2 el control: el MISMO forro sin la marca (como lo haría hoy) suma a lo medido: 109 m para 50 prendas. Esa diferencia es lo que la marca evita",
  `${FLUJO(LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9"]))}
   ${CONSUMO("lino", 69)}
   ${CONSUMO("forro", 40)}
   ${CIERRA}
   select concat_ws('|', :'c', ${MEDIDO});`,
  "OK|50:109.000"
);
caso(
  "C3 si una misma tela es la principal de un color y complemento de otro, sus metros no se pueden separar: esa orden no aporta a lo medido, y el cierre sigue sin error",
  `${FLUJO(LISTA(["lino", "c1", "1.2"], ["lino", "c2", "1.1", true]))}
   ${CONSUMO("lino", 69)}
   ${CIERRA}
   select concat_ws('|', :'c', ${ESTADO}, ${MEDIDO});`,
  "OK|terminada|sin_medida"
);
caso(
  "C4 lo que se devolvió también se resta de los complementos: forro 40 gastados y 10 devueltos no cambian lo medido (solo el lino) y el costo del forro es el de los 30 m netos",
  `${FLUJO(LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true]))}
   ${CONSUMO("lino", 69)}
   ${CONSUMO("forro", 40)}
   select retail.devolver_insumo_de_produccion(:'oid', :'forro', 10, 'sobró') as dev \\gset
   ${CIERRA}
   select concat_ws('|', :'c', ${MEDIDO}, (select costo_tela from retail.producciones where id = :'oid'));`,
  "OK|50:69.000|1102.50"
);

// L. LA LECTURA -----------------------------------------------------------------------------------------------------------------
caso(
  "L1 la orden en una sola lectura devuelve `es_complemento` por fila: el forro true y el lino false",
  `${ABRE(LISTA(["lino", "c1", "1.2"], ["forro", null, "0.9", true]))}
   select string_agg(f ->> 'codigo' || ':' || (f ->> 'es_complemento'), ' ' order by f ->> 'codigo')
     from jsonb_array_elements(retail.fn_orden_produccion((select id from pg_temp.ultima)) -> 'insumos') f;`,
  "CO-FORRO:true CO-LINO:false"
);

// S. LA FORMA -------------------------------------------------------------------------------------------------------------------
caso(
  "S1 la forma: las tres funciones que escriben siguen siendo security definer con search_path y sin acceso de anon; la función nueva no la llama nadie desde afuera (ni anon ni authenticated)",
  `select concat_ws('|',
     (select bool_and(p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path%') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('abrir_orden_produccion', 'guardar_insumos_orden', 'cerrar_produccion')),
     (select bool_or(has_function_privilege('anon', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('abrir_orden_produccion', 'guardar_insumos_orden', 'cerrar_produccion', 'fn_produccion_insumos_marcar_complementos')),
     (select has_function_privilege('authenticated', 'retail.fn_produccion_insumos_marcar_complementos(jsonb, jsonb)'::regprocedure, 'execute')),
     (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'retail' and p.proname in ('abrir_orden_produccion', 'guardar_insumos_orden', 'cerrar_produccion')));`,
  "t|f|f|t"
);

console.log(`\n${casos - fallas}/${casos} casos bien (contenedor: ${CONTENEDOR})`);
process.exit(fallas === 0 ? 0 : 1);
